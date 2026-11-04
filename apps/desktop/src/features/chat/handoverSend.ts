import { sessionModelArgs } from "@terminus/protocol";
import { invoke } from "../../lib/invoke.ts";

export type HandoverSend<T> = {
  session: string | null;
  /** El CLI confirmado en el borrador, si hay un traspaso pendiente. */
  pending: string | null;
  /** El CLI con el que la sesión corre hoy. */
  current: string | null;
  /** El CLI de este mensaje: el de la caja, no el de la sesión. */
  provider: string;
  /** Un `!` no escribe la intención: el comando no es un turno del agente. */
  command: boolean;
  /** `set_session_provider`: deja el consentimiento de un solo uso. */
  setProvider: (provider: string) => Promise<unknown>;
  /** `send_message`, que consume el consentimiento en el turno siguiente. */
  send: () => Promise<T>;
};

/**
 * Manda el mensaje dejando el consentimiento justo antes; si
 * `set_session_provider` falla, `send` no corre.
 *
 * Si el consentimiento se escribe y `send` falla, lanza sin `settled`: el
 * pendiente queda y el reintento vuelve a consentir. `settled` solo llega
 * cuando el mensaje ya salió.
 */
export async function sendWithHandover<T>(
  input: HandoverSend<T>,
): Promise<{ answer: T; handedOver: boolean; settled: boolean }> {
  const pending = input.pending;
  const handedOver = !!input.session &&
    !!pending &&
    pending === input.provider &&
    pending !== input.current &&
    !input.command;
  const alreadyOn = !!input.session &&
    !!pending &&
    pending === input.provider &&
    pending === input.current;
  if (handedOver && pending) await input.setProvider(pending);
  return {
    answer: await input.send(),
    handedOver,
    settled: handedOver || (!input.command && alreadyOn),
  };
}

// `set_session_model` (`session_model_v1`): el otro gesto del chip que queda en la tarea. Vive en este
// trozo perezoso, que ya carga el chip, para no sumar otro a la carga inicial.

/**
 * El modelo que la persona eligió en el chip de cada tarea y que ya quedó en su
 * `session.model`. Solo con él un cambio de esfuerzo se guarda: sin elección
 * explícita, el modelo de la caja es el que la ventana puso sola.
 */
const elegidos = new Map<string, string>();

/** `effortOnly`: un cambio de esfuerzo, que solo viaja con el modelo que la persona eligió. */
export async function saveSessionModel(
  project: string,
  id: string,
  model: string,
  effort: string | null,
  options: Parameters<typeof invoke>[2],
  effortOnly?: boolean,
): Promise<void> {
  if (effortOnly && elegidos.get(id) !== model) return;
  elegidos.set(id, model);
  try {
    await invoke("set_session_model", sessionModelArgs(project, id, model, effort), options);
  } catch (error) {
    if (elegidos.get(id) === model) elegidos.delete(id);
    throw error;
  }
}
