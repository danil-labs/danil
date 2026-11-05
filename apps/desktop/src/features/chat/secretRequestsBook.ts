/** El libro de solicitudes «Secreto solicitado», sin IPC: lo prueba Node directamente. */

/** Como la manda el motor; `reason` es texto del agente (`reason_author: "agent"`). */
export type SecretRequestWire = { request_id: string; workspace: string; task: string; folder: string; name: string; reason: string; reason_author?: string; replace: boolean; created_at: string; expires_at: string };
export type SecretRequestState = "open" | "saved" | "declined" | "expired";
export type SecretRequest = SecretRequestWire & { state: SecretRequestState };
export type SecretRequestClosed = { request_id: string; workspace?: string; task?: string; outcome: string; closed_at?: string };

const CLOSED: Record<string, SecretRequestState> = { fulfilled: "saved", saved: "saved", declined: "declined", expired: "expired" };

/** Un `secret_requested`: sustituye por `request_id`; un replay de una ya cerrada no la reabre. */
export function applyRequested(book: ReadonlyMap<string, SecretRequest>, wire: SecretRequestWire): Map<string, SecretRequest> {
  const next = new Map(book);
  const known = book.get(wire.request_id);
  next.set(wire.request_id, { ...wire, state: known && known.state !== "open" ? known.state : "open" });
  return next;
}

export function applyClosed(book: ReadonlyMap<string, SecretRequest>, closed: SecretRequestClosed): Map<string, SecretRequest> {
  const known = book.get(closed.request_id);
  if (!known) return new Map(book);
  const next = new Map(book);
  next.set(closed.request_id, { ...known, state: CLOSED[closed.outcome] ?? "expired" });
  return next;
}

/** La lista abierta de `task`: lo que falta de esa tarea y seguía abierto se cierra como vencido. */
export function applyList(book: ReadonlyMap<string, SecretRequest>, task: (id: string) => boolean, open: readonly SecretRequestWire[]): Map<string, SecretRequest> {
  const next = new Map(book);
  const listed = new Set(open.map((r) => r.request_id));
  for (const [id, r] of book) if (task(r.task) && r.state === "open" && !listed.has(id)) next.set(id, { ...r, state: "expired" });
  for (const r of open) {
    const known = next.get(r.request_id);
    next.set(r.request_id, { ...r, state: known && known.state !== "open" && known.state !== "expired" ? known.state : "open" });
  }
  return next;
}

/** La tarea de una solicitud frente a la conversación: en la web el id lleva la máquina delante (`cmp~t1`). */
export const sameTask = (conversation: string, task: string) => conversation === task || conversation.endsWith(`~${task}`);

