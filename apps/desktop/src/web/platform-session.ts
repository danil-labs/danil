import { z } from "zod";
import { EdgeError as PlatformSessionError, edgeIdentity, edgeTransport } from "@terminus/computers";

const workspaceId = z.string().regex(/^[1-9]\d*$/);
const profile = z.object({ id: z.string().startsWith("user_"), name: z.string(), email: z.string().nullable().optional(), workspace: workspaceId.nullable(), organizations: z.array(z.object({ id: z.string(), name: z.string() })) });
const workspace = z.object({ id: workspaceId, org: z.string(), name: z.string(), role: z.string() });
const page = z.object({ items: z.array(workspace), next_cursor: z.string().min(1).nullable() });
/** `POST /v1/workspaces/select` → `{workspace: Workspace}` (mvp-v1 `WorkspaceSelection`); campos nuevos se ignoran. */
const selection = z.object({ workspace });
export type PlatformProfile = z.infer<typeof profile>;
export type PlatformWorkspace = z.infer<typeof workspace>;

/** The edge's cookie transport and its error are shared with the phone on the web (`@terminus/computers`). */
export { PlatformSessionError };
export const platformTransport = edgeTransport;

export function platformSession(options: { origin: string; timeoutMs: number }, request: typeof fetch = fetch) {
  const transport = platformTransport(options, request);
  const { call, mutation } = transport;
  const identity = edgeIdentity(transport, options.origin);
  return {
    loginUrl: identity.loginUrl,
    async me() { return profile.parse(await (await call("identity/me")).json()); },
    async active() { return profile.parse(await (await call("identity/me")).json()).workspace; },
    async workspaces() {
      const items: PlatformWorkspace[] = [];
      const cursors = new Set<string>();
      let cursor: string | null = null;
      do {
        const result = page.parse(await (await call(`workspaces${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`)).json());
        items.push(...result.items);
        cursor = result.next_cursor;
        if (cursor && cursors.has(cursor)) throw new Error("Repeated workspace cursor");
        if (cursor) cursors.add(cursor);
      } while (cursor);
      return items;
    },
    async select(id: string, idempotencyKey: string) {
      workspaceId.parse(id);
      return selection.parse(await (await mutation("workspaces/select", {
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ workspace: id }),
      })).json());
    },
    async redeemPromo(code: string, idempotencyKey: string) {
      const response = await mutation("workspaces/promo/redeem", {
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ code }),
      });
      return z.object({ machine: z.object({ state: z.string().optional() }).optional() }).parse(await response.json());
    },
    logout: identity.logout,
  };
}

/**
 * La preparación de la cuenta agotó su presupuesto sin quedar lista. No es un fallo del transporte:
 * la ventana termina en un estado visible y solo la persona arranca otra preparación.
 * `last` es la última negativa leída, si la última lectura fue una negativa; un valor pendiente no viaja.
 */
export class PreparationExpired extends Error {
  readonly last: PlatformSessionError | undefined;
  constructor(last?: PlatformSessionError) {
    super('Account preparation did not finish within its budget');
    this.name = 'PreparationExpired';
    this.last = last;
  }
}

const PREPARATION_MS = 20_000;
/** Red caída o plazo propio de la petición: no dicen nada de la cuenta. Se compara por nombre: el error puede venir de otro realm. */
const transportFailure = (e: unknown) => ['TypeError', 'TimeoutError'].includes(String((e as { name?: unknown } | null)?.name));

export async function preparePlatformSession<T>(read: (signal: AbortSignal) => Promise<T>, signal: AbortSignal, preparing: () => void, ready: (value: T) => boolean = () => true): Promise<T> {
  const deadline = Date.now() + PREPARATION_MS;
  const budget = AbortSignal.any([signal, AbortSignal.timeout(PREPARATION_MS)]);
  let last: PlatformSessionError | undefined;
  let started = false;
  let attempt = 0;
  for (;;) {
    signal.throwIfAborted();
    try {
      const value = await read(budget);
      if (ready(value)) return value;
      last = undefined;
    } catch (cause) {
      signal.throwIfAborted();
      // Lo que corta el presupuesto (o cae con él) es el fin de la preparación, no una caída que reintentar.
      if (budget.aborted && !(cause instanceof PlatformSessionError)) throw new PreparationExpired(last);
      const preparingAccount = cause instanceof PlatformSessionError && [403, 404].includes(cause.status) &&
        !['workspace_selection_required', 'organization_selection_required'].includes(cause.code ?? '');
      // Empezada la preparación, una caída del transporte se reintenta dentro del mismo presupuesto:
      // si escapara, la ventana arrancaría otra preparación y el plazo dejaría de acotarla.
      if (preparingAccount) last = cause as PlatformSessionError;
      else if (!(started && transportFailure(cause))) throw cause;
    }
    started = true;
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new PreparationExpired(last);
    preparing();
    const hint = last?.retryAfter;
    const seconds = hint && /^\d+$/.test(hint) ? Number(hint) * 1000 : NaN;
    const retryAfter = hint ? (Number.isFinite(seconds) ? seconds : Date.parse(hint) - Date.now()) : 0;
    const backoff = Math.min(500 * 2 ** attempt++, 4000) * (1 + Math.random() / 4);
    const delay = Math.max(backoff, Number.isFinite(retryAfter) ? retryAfter : 0);
    await new Promise<void>((resolve, reject) => {
      const finish = () => { signal.removeEventListener('abort', abort); resolve(); };
      const timer = setTimeout(finish, Math.min(delay, remaining));
      const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
    if (Date.now() >= deadline) throw new PreparationExpired(last);
  }
}
