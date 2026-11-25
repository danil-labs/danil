import { createSignal } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n.ts";
import type { HandlerRequests } from "../../../../ui/src/lib/model.ts";
const [version, setVersion] = createSignal(0);
const changed = () => setVersion(v => v + 1);
type Pending = { operation: string; action: "approve" | "revoke" | "release" };
const pending = new Map<string, Pending>();
const running = new Set<string>();
export const pendingHandlerOperation = (scope: string) => { version(); return pending.get(scope); };
export const handlerOperationRunning = (scope: string) => { version(); return running.has(scope); };

function receipt(error: unknown): { operation?: string; settled?: boolean } {
  const outer = error as { detail?: { detail?: { operation?: string; settled?: boolean } } } | null;
  return outer?.detail?.detail ?? {};
}

export async function handlerMutation<T>(scope: string, action: Pending["action"], send: () => Promise<T>): Promise<T> {
  if (pending.has(scope) || running.has(scope)) throw { what: { clave: "settings.handler.pending" }, detail: "operation_pending" };
  running.add(scope); changed();
  try { return await send(); }
  catch (error) {
    const r = receipt(error);
    if (r.operation && !r.settled) pending.set(scope, { operation: r.operation, action });
    throw error;
  } finally { running.delete(scope); changed(); }
}

export async function resumeHandlerOperation<T>(scope: string, poll: (operation: string) => Promise<T>): Promise<T> {
  const held = pending.get(scope);
  if (!held || running.has(scope)) throw { what: { clave: "settings.handler.pending" }, detail: "operation_pending" };
  running.add(scope); changed();
  try {
    const result = await poll(held.operation);
    pending.delete(scope);
    return result;
  } catch (error) {
    if (receipt(error).settled) pending.delete(scope);
    throw error;
  } finally { running.delete(scope); changed(); }
}

/** `stale` llega como prosa del motor en inglés; el motivo sale de los campos. Sin commit ya tiene su línea. */
export const staleReason = (r: Pick<HandlerRequests, "approval" | "dirty">) =>
  r.approval?.revoked_at ? t("settings.handler.stale_revoked") : r.dirty ? "" : t("settings.handler.stale_changed");
