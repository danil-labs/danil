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
  /** El modelo con el que corre la sesión, para lo que no es un turno del agente (`!`). */
  model?: string | null;
  /** El nivel de razonamiento con el que corre la sesión. */
  effort?: string | null;
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

/**
 * El CLI con que corre un `!` y con el que el agente contesta su salida: el de
 * la sesión. Un traspaso confirmado en el borrador no es un turno del agente y
 * no se gasta aquí.
 */
export function shellCli(sessionProvider: string | null | undefined, draftProvider: string): string {
  return sessionProvider || draftProvider;
}
