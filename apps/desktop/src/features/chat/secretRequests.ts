/**
 * Las solicitudes «Secreto solicitado» de cada tarea (extensión `secret_request_v1`).
 * `secret_requests_list` es la verdad: se relee al abrir el chat y tras un hueco
 * del stream; los eventos la mantienen al día entre lecturas.
 */
import { createRoot, createSignal } from "solid-js";
import { unknownCommand } from "../../lib/errorCode.ts";
import { invoke } from "../../lib/invoke.ts";
import { listen } from "../../lib/serviceEvents.ts";
import { machines, refetchMachines } from "../machines/store";
import { applyClosed, applyList, applyRequested, sameTask, type SecretRequest, type SecretRequestClosed, type SecretRequestWire } from "./secretRequestsBook.ts";

export { sameTask, type SecretRequest } from "./secretRequestsBook.ts";

const [book, setBook] = createRoot(() => createSignal<Map<string, SecretRequest>>(new Map()));
const [unsupported, setUnsupported] = createRoot(() => createSignal(false));
export { book as secretRequests, unsupported as secretRequestsUnsupported };

let started = false;
const reads = new Map<string, () => void>();

/** Solo con un motor que anuncia `secret_request_v1` (`status.service_features`) se lee nada. */
export function supportsSecretRequests(machine?: string): boolean {
  const list = machines();
  const target = machine ? list.find((m) => m.id === machine) : (list.find((m) => m.active) ?? list.find((m) => m.local));
  return !!target?.features?.includes("secret_request_v1");
}

export function startSecretRequests() {
  if (started) return;
  started = true;
  // Sin cuenta de Danil nadie pidió la lista; una vez, para saber qué anuncia este motor.
  if (machines().length === 0) void refetchMachines();
  void listen<SecretRequestWire>("secret_requested", (e) => setBook((b) => applyRequested(b, e.payload)));
  void listen<SecretRequestClosed>("secret_request_closed", (e) => setBook((b) => applyClosed(b, e.payload)));
  window.addEventListener("harness:service-resync", () => {
    for (const read of reads.values()) read();
  });
}

const options = (machine?: string) => (machine ? { headers: { "x-terminus-machine": machine } } : undefined);

/** Lee las abiertas de la tarea; un motor sin la extensión apaga solo la tarjeta. */
export async function readSecretRequests(conversation: string, machine?: string): Promise<void> {
  startSecretRequests();
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
