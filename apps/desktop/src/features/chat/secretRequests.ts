/**
 * Las solicitudes «Secreto solicitado» de cada tarea (extensión `secret_request_v1`).
 * `secret_requests_list` es la verdad: se relee al abrir el chat y tras un hueco
 * del stream; los eventos la mantienen al día entre lecturas.
 */
import { createRoot, createSignal } from "solid-js";
import { unknownCommand } from "../../lib/errorCode.ts";
import { invoke } from "../../lib/invoke.ts";
import { listen } from "../../lib/serviceEvents.ts";

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

const [book, setBook] = createRoot(() => createSignal<Map<string, SecretRequest>>(new Map()));
const [unsupported, setUnsupported] = createRoot(() => createSignal(false));
export { book as secretRequests, unsupported as secretRequestsUnsupported };

let started = false;
const reads = new Map<string, () => void>();

function start() {
  if (started) return;
  started = true;
  void listen<SecretRequestWire>("secret_requested", (e) => setBook((b) => applyRequested(b, e.payload)));
  void listen<SecretRequestClosed>("secret_request_closed", (e) => setBook((b) => applyClosed(b, e.payload)));
  window.addEventListener("harness:service-resync", () => {
    for (const read of reads.values()) read();
  });
}

const options = (machine?: string) => (machine ? { headers: { "x-terminus-machine": machine } } : undefined);

/** Lee las abiertas de la tarea; un motor sin la extensión apaga solo la tarjeta. */
export async function readSecretRequests(conversation: string, machine?: string): Promise<void> {
  start();
  if (unsupported()) return;
  try {
    const answer = await invoke<{ requests?: SecretRequestWire[] } | null>("secret_requests_list", { session: conversation }, options(machine));
    setBook((b) => applyList(b, (task) => sameTask(conversation, task), answer?.requests ?? []));
  } catch (e) {
    if (unknownCommand(e)) setUnsupported(true);
  }
}

/** Mientras el chat de la tarea está abierto, un hueco del stream vuelve a leerla. */
export function watchSecretRequests(conversation: string, machine?: string): () => void {
  const key = `${machine ?? ""}|${conversation}`;
  reads.set(key, () => void readSecretRequests(conversation, machine));
  void readSecretRequests(conversation, machine);
  return () => reads.delete(key);
}

export function answerSecretRequest(request: SecretRequest, outcome: "saved" | "declined", machine?: string) {
  return invoke<{ request_id: string; outcome: string }>("secret_request_answer", { requestId: request.request_id, outcome }, options(machine)).then((answer) =>
    setBook((b) => applyClosed(b, { request_id: request.request_id, outcome: answer?.outcome ?? outcome })),
  );
}

/** En la web la copia sellada llega a la máquina cuando la reconcilia; `saved` va después (K3). */
export const syncSealedCopy = (workspace: string, machine?: string) => invoke("sync_account_credentials", { id: workspace }, options(machine));
