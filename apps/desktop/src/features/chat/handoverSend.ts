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
 * Manda el mensaje dejando el consentimiento justo antes. Si
 * `set_session_provider` falla, `send` no corre: un turno con el CLI viejo y un
 * mensaje escrito para el nuevo no es lo que se confirmó.
 *
 * `settled` dice si el pendiente se consumió: se escribió el consentimiento o
 * el mensaje ya salió con el CLI que el pendiente pedía. Un `!` no lo consume.
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
