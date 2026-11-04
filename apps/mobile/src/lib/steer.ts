import { failureKey } from "./failureNotice.ts";

/**
 * «Mandar ahora» y su cola, como la ventana (`apps/desktop/src/app/App.tsx`,
 * `mandarAhora` y `noRecibeAMedias`). Sin React Native: se prueba en Node.
 */

/** Un mensaje que espera a que cierre el turno. */
export type Queued = { id: string; text: string; attachments: string[] };

/**
 * Lo que contesta el ejecutor cuando despachó el mensaje pero no pudo saber si
 * entró (`runtime/chat/delivery.rs`, `ACCEPTANCE_UNKNOWN`). OpenCode 2.x cae
 * aquí: rechaza el segundo prompt. Es una clave interna, no una frase.
 */
export const ACCEPTANCE_UNKNOWN = "executor_acceptance_unknown";

/**
 * Qué hacer con un `inject_message` rechazado:
 * - `later`: el turno acaba de cerrar o está cerrándose; el mensaje sigue en la
 *   cola y sale como el siguiente turno.
 * - `delivered`: ya entró; se quita de la cola.
 * - `unsupported` / `unconfirmed`: este agente no recibe mensajes a medias. Sigue
 *   en la cola, se dice una vez con la frase del catálogo y se deja de ofrecer
 *   «Mandar ahora».
 * - `null`: otro fallo, que se dice como cualquiera.
 */
export type SteerRefusal = "later" | "delivered" | "unsupported" | "unconfirmed";

export function steerRefusal(error: unknown): SteerRefusal | null {
  const key = failureKey(error);
  if (key === "chat.steer.not_running" || key === "chat.steer.stopping") return "later";
  if (key === "chat.steer.delivered") return "delivered";
  if (key === "chat.steer.unsupported") return "unsupported";
  if (key === ACCEPTANCE_UNKNOWN || mentions(error, ACCEPTANCE_UNKNOWN)) return "unconfirmed";
  return null;
}

/** La clave del catálogo que se dice al negarse, la misma de la ventana. */
export function steerNotice(refusal: "unsupported" | "unconfirmed"): "chat.steer.unsupported" | "chat.steer.unconfirmed" {
  return refusal === "unsupported" ? "chat.steer.unsupported" : "chat.steer.unconfirmed";
}

/** Si la clave viene en el detalle del fallo: el relay la pasa como texto o dentro del `Failure` del motor. */
function mentions(error: unknown, key: string): boolean {
  if (!error || typeof error !== "object") return false;
  const detail = (error as { detail?: unknown }).detail;
  if (detail === key) return true;
  if (detail && typeof detail === "object") {
    const inner = detail as { detail?: unknown; what?: unknown };
    if (inner.detail === key || inner.what === key) return true;
  }
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.endsWith(`: ${key}`);
}

/**
 * Los agentes que ya negaron el steer, por máquina: mientras la app corre no se
 * vuelve a ofrecer «Mandar ahora» con ellos ni se repite el aviso. Por máquina y
 * no global: otra puede tener otra versión del CLI.
 */
export class SteerMemory {
  private refused = new Set<string>();

  /** Lo anota; `true` si es la primera vez y hay que decirlo. */
  refuse(host: string, provider: string): boolean {
    const key = `${host}/${provider}`;
    if (this.refused.has(key)) return false;
    this.refused.add(key);
    return true;
  }

  refuses(host: string | null | undefined, provider: string | null | undefined): boolean {
    return Boolean(host && provider && this.refused.has(`${host}/${provider}`));
  }
}

/**
 * La cola de cada tarea mientras la app corre: salir de la pantalla y volver la
 * encuentra igual. Solo en memoria, como la ventana entre pestañas; cerrar la
 * app la pierde.
 */
export class QueueMemory {
  private queues = new Map<string, readonly Queued[]>();

  static key(host: string | null | undefined, workspace: string | null | undefined, session: string | null | undefined): string | null {
    return host && workspace && session ? `${host}/${workspace}/${session}` : null;
  }

  get(key: string | null): readonly Queued[] {
    return (key && this.queues.get(key)) || [];
  }

  set(key: string | null, items: readonly Queued[]) {
    if (!key) return;
    if (items.length) this.queues.set(key, items);
    else this.queues.delete(key);
  }
}

/**
 * «Detener y enviar»: lo elegido sale primero y el resto conserva su orden.
 * Detener el turno lo hace quien llama; al cerrar, la cola sale sola.
 */
export function promote(queue: readonly Queued[], id: string): Queued[] {
  const chosen = queue.find((item) => item.id === id);
  return chosen ? [chosen, ...queue.filter((item) => item.id !== id)] : [...queue];
}

/** Las de la app: una por proceso. */
export const steerMemory = new SteerMemory();
export const queueMemory = new QueueMemory();
