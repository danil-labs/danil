/**
 * La organización de la página web. Con una sola y sin activa se elige sola; un
 * `403 organization_selection_required` de cualquier ruta (canje, máquinas) vuelve a
 * resolverla. Identity pide un login nuevo para entrar a una organización
 * (`409 organization_auth_required`): la página va al login una vez, y si al volver se
 * repite antes de dos minutos se queda y ofrece volver a iniciar sesión.
 */
import { isOrganizationSelectionRequired } from "@terminus/computers";
import { createSignal } from "solid-js";
import { organizationSession } from "./organization-session.ts";
import type { platformTransport } from "./platform-session.ts";

const MARK = "danil.web.org-auth.";
const AGAIN_MS = 120_000;
const SELECT = "identity/organizations/select";
/** Sin organización todavía (identity la crea tras el alta): se relee sola, con backoff y tope. */
const EMPTY_FIRST_MS = 2_000;
const EMPTY_CEILING_MS = 30_000;
const EMPTY_TRIES = 12;

type Transport = ReturnType<typeof platformTransport>;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
type Redeemed = { machine?: { state?: string } };
type Options = { signal: AbortSignal; store: Store; signIn: () => void; onSelected: () => void; redeem: (code: string, key: string) => Promise<Redeemed>; now?: () => number };

export const isOrganizationAuthRequired = (e: unknown) => (e as { code?: unknown } | null)?.code === "organization_auth_required";

function organizationIn(init?: RequestInit): string | undefined {
  try { return JSON.parse(String(init?.body)).organization_id; } catch { return undefined; }
}

export function webOrganizations(transport: Transport, options: Options) {
  const now = options.now ?? Date.now;
  const [blocked, setBlocked] = createSignal(false);
  let chosen: string | undefined;
  let leaving = false;
  let resolving: Promise<void> | undefined;
  let emptyTries = 0;
  let emptyTimer: ReturnType<typeof setTimeout> | undefined;
  const tracked: Transport = {
    call: transport.call,
    mutation: (path, init) => { if (path === SELECT) chosen = organizationIn(init) ?? chosen; return transport.mutation(path, init); },
  };
  const session = organizationSession(tracked, options.signal, () => { settled(); options.onSelected(); });
  const selection = session.selection;
  const stopWatching = selection.subscribe(() => {
    const s = selection.state();
    if (s.kind === "ready" && s.active) settled();
    if (s.kind === "ready" && s.items.length === 0) rereadEmpty();
    else if (s.kind === "ready") emptyTries = 0;
  });

  function marks() {
    try { return Array.from({ length: options.store.length }, (_, i) => options.store.key(i)).filter((k): k is string => !!k?.startsWith(MARK)); } catch { return []; }
  }
  function settled() {
    for (const key of marks()) try { options.store.removeItem(key); } catch { /* sin almacenamiento no hay guarda */ }
    setBlocked(false);
  }
  function rereadEmpty() {
    if (emptyTimer || emptyTries >= EMPTY_TRIES || options.signal.aborted) return;
    const wait = Math.min(EMPTY_CEILING_MS, EMPTY_FIRST_MS * 2 ** emptyTries++);
    emptyTimer = setTimeout(() => { emptyTimer = undefined; if (!options.signal.aborted) void resolve(); }, wait);
  }
  /** Al login con la marca de esa organización: al volver, el mismo 409 no redirige solo. */
  function leave(organization: string) {
    try { options.store.setItem(MARK + organization, String(now())); } catch { /* sin almacenamiento */ }
    leaving = true;
    options.signIn();
  }
  function authRequired(organization: string) {
    if (blocked() || leaving) return;
    let at = 0;
    try { at = Number(options.store.getItem(MARK + organization) ?? 0); } catch { /* sin almacenamiento */ }
    if (at && now() - at < AGAIN_MS) { setBlocked(true); return; }
    leave(organization);
  }
  /** La selección del arranque no pasa por aquí: con una sola organización, es esa. */
  function only() { const s = selection.state(); return s.kind === "ready" && s.items.length === 1 ? s.items[0].id : undefined; }
  function resolve(): Promise<void> {
    if (blocked() || leaving) return Promise.resolve();
    resolving ??= selection.load().finally(() => { resolving = undefined; });
    return resolving;
  }
  /** Para cualquier error de la página: `true` si era de contexto de organización. */
  function report(cause: unknown): boolean {
    if (isOrganizationAuthRequired(cause)) { authRequired(chosen ?? only() ?? "current"); return true; }
    if (!isOrganizationSelectionRequired(cause)) return false;
    // Oculta, `selection.report` leería la lista por su cuenta: la lectura es siempre la de `resolve`.
    if (selection.state().kind !== "hidden") selection.report(cause);
    void resolve();
    return true;
  }
  /** El canje sin contexto lo resuelve y se repite una vez con la misma clave. */
  async function redeem(code: string, key: string): Promise<Redeemed> {
    try { return await options.redeem(code, key); }
    catch (cause) {
      if (!isOrganizationSelectionRequired(cause)) throw cause;
      await resolve();
      const s = selection.state();
      if (s.kind !== "ready" || !s.active) throw cause;
      return options.redeem(code, key);
    }
  }
  return {
    selection, load: session.load, report, redeem,
    reauth: { needed: blocked, signIn: () => leave(chosen ?? only() ?? "current") },
    stop() { clearTimeout(emptyTimer); stopWatching(); selection.stop(); },
  };
}
