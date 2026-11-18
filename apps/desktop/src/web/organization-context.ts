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
  const tracked: Transport = {
    call: transport.call,
    mutation: (path, init) => { if (path === SELECT) chosen = organizationIn(init) ?? chosen; return transport.mutation(path, init); },
  };
  const session = organizationSession(tracked, options.signal, () => { settled(); options.onSelected(); });
  const selection = session.selection;
  const stopWatching = selection.subscribe(() => { const s = selection.state(); if (s.kind === "ready" && s.active) settled(); });

  function marks() {
    try { return Array.from({ length: options.store.length }, (_, i) => options.store.key(i)).filter((k): k is string => !!k?.startsWith(MARK)); } catch { return []; }
  }
  function settled() {
    for (const key of marks()) try { options.store.removeItem(key); } catch { /* sin almacenamiento no hay guarda */ }
    setBlocked(false);
  }
  function authRequired(organization: string) {
    if (leaving) return;
    const key = MARK + organization;
    let at = 0;
    try { at = Number(options.store.getItem(key) ?? 0); } catch { /* sin almacenamiento */ }
    if (at && now() - at < AGAIN_MS) { setBlocked(true); return; }
    try { options.store.setItem(key, String(now())); } catch { /* sin almacenamiento */ }
    leaving = true;
    options.signIn();
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
    const hidden = selection.state().kind === "hidden";
    if (!selection.report(cause)) return false;
    if (!hidden) void resolve();
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
    reauth: { needed: blocked, signIn: () => { leaving = true; options.signIn(); } },
    stop() { stopWatching(); selection.stop(); },
  };
}
