import { canHandOver as engineAllows } from "@terminus/protocol";

/**
 * Cambiar de CLI en una tarea abierta (`provider_handoff_v1`). La autoridad es
 * el motor: `can_hand_over` en `load_session`, ausente en uno anterior y por
 * tanto «no». Aquí solo se combina con lo que el cliente ve —el turno vivo, la
 * máquina y el anuncio del rasgo— para decidir el gesto y el motivo.
 */

/** Lo que `load_session` dijo de la tarea: si puede, por qué no y con cuál corre hoy. */
export type HandoverState = {
  can: boolean;
  /** La clave `chat.handover.*` del rechazo que dio el motor. */
  blocked: string | null;
  /** El CLI de la sesión, no el proveedor del modelo. */
  provider: string | null;
};

export type HandoverGate = {
  session: string | null;
  /** Un encargado conserva su proveedor. */
  handler?: boolean;
  running: boolean;
  remote: boolean;
  /** La máquina de la tarea anuncia `provider_handoff_v1`. */
  announced: boolean;
  state?: HandoverState;
};

/**
 * Por qué la tarea no puede cambiar de CLI, o `null` si puede. Primero las
 * razones permanentes —el encargado, la otra máquina, lo que ya dijo el
 * motor— y al final el turno vivo, que se pasa solo.
 */
export function handOverReason(gate: HandoverGate): string | null {
  if (!gate.session) return null;
  if (gate.handler) return "chat.handover.handler";
  if (gate.remote) return "chat.handover.unsupported";
  if (gate.state?.blocked) return gate.state.blocked;
  if (!gate.announced || !engineAllows({ can_hand_over: gate.state?.can })) {
    return "chat.handover.unsupported";
  }
  if (gate.running) return "chat.handover.busy";
  return null;
}

export function canHandOverTask(gate: HandoverGate): boolean {
  return !!gate.session && handOverReason(gate) === null;
}

/**
 * El candado del selector. El chat de un agente no se bloquea: cambia de CLI
 * por su perfil (`set_agent_model`), que es otro camino y sigue como antes.
 */
export function agentSwitchBlocked(gate: HandoverGate & { agentChat?: boolean }): string | null {
  return gate.agentChat ? null : handOverReason(gate);
}

/** El traspaso confirmado: de qué CLI a cuál, y a qué tarea pertenece. */
export type HandoverPending = { from: string; to: string };

/**
 * El pendiente que sigue en pie. Otro cliente pudo cambiar el CLI: entonces el
 * `from` confirmado ya no es el de la sesión y el gesto caduca.
 */
export function handoverInForce(
  pending: HandoverPending | null | undefined,
  current: string | null,
): HandoverPending | null {
  if (!pending) return null;
  if (current !== null && pending.from !== current) return null;
  return pending;
}

/** La confirmación abierta es de la tarea y del borrador que están delante. */
export function handoverMatches(
  pending: { sesion: string; clave: string } | null | undefined,
  session: string | null,
  clave: string,
): boolean {
  return !!pending && !!session && pending.sesion === session && pending.clave === clave;
}

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
