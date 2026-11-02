/**
 * Cambiar el CLI (Claude, Codex, OpenCode) dentro de una tarea normal
 * (`provider_handoff_v1`). El motor es la autoridad: aquí solo se combina lo
 * que anuncia (`service_features`, `can_hand_over`, `hand_over_blocked`) y se
 * ordena el envío para que el consentimiento vaya antes del mensaje.
 */
import { canHandOver, PROVIDER_HANDOFF_FEATURE, type OpenedSession } from "@terminus/protocol";

/** `allowed` y, si no, la clave del catálogo que explica el rechazo. */
export type HandoverGate = { allowed: boolean; reason: string | null };

/**
 * Si la tarea puede cambiar de CLI ahora. Un motor anterior no manda
 * `can_hand_over` y no anuncia la feature: en los dos casos no se ofrece.
 * `remote` es una tarea con `remote_parent` (v1 las bloquea).
 */
export function handoverGate(input: {
  session: Pick<OpenedSession, "can_hand_over" | "hand_over_blocked"> | null | undefined;
  running: boolean;
  features: readonly string[] | null | undefined;
  remote: boolean;
}): HandoverGate {
  if (!input.session) return { allowed: false, reason: "chat.handover.unsupported" };
  if (!input.features?.includes(PROVIDER_HANDOFF_FEATURE)) return { allowed: false, reason: "chat.handover.unsupported" };
  if (input.remote) return { allowed: false, reason: "chat.handover.unsupported" };
  if (input.session.hand_over_blocked) return { allowed: false, reason: input.session.hand_over_blocked };
  if (!canHandOver(input.session)) return { allowed: false, reason: "chat.handover.unsupported" };
  // `can_hand_over` no mira el turno vivo: ese rechazo solo aplica si lo demás permite.
  if (input.running) return { allowed: false, reason: "chat.handover.busy" };
  return { allowed: true, reason: null };
}

/** El traspaso confirmado y todavía no aplicado, atado a su tarea y a su CLI de origen. */
export type PendingHandover = { to: string; from: string; task: string };

/**
 * El pendiente sigue vivo solo en su tarea y mientras la tarea siga en el CLI
 * desde el que se confirmó. `to` es que ya se aplicó; otro `from` es un cambio
 * de otro cliente. `current === null` es una lectura que todavía no llegó.
 */
export function livePending(pending: PendingHandover | null, task: string, current: string | null): PendingHandover | null {
  if (!pending || pending.task !== task) return null;
  if (current === null) return pending;
  return current === pending.from ? pending : null;
}

/**
 * El envío de un mensaje con traspaso confirmado: primero el consentimiento
 * (`set_session_provider`) y después el mensaje. Si el consentimiento falla,
 * el mensaje no sale. Un `!` no escribe la intención, y sin cambio de CLI no
 * se toca el motor. `onConsent` corre en cuanto el consentimiento quedó escrito,
 * aunque el turno falle después: el pendiente ya no es una promesa para el
 * próximo envío.
 */
export async function sendWithHandover<T>(input: {
  shell: boolean;
  /** El CLI confirmado en la hoja de modelo, si lo hay. */
  pending: string | null;
  /** El CLI con que sigue la tarea ahora (`session.provider`). */
  from: string | null;
  /** El CLI con que saldría este mensaje. */
  to: string;
  consent: (provider: string) => Promise<unknown>;
  onConsent?: () => void;
  send: () => Promise<T>;
}): Promise<T> {
  const changes = !input.shell && Boolean(input.from) && Boolean(input.pending) && input.pending === input.to && input.to !== input.from;
  if (changes) {
    await input.consent(input.to);
    input.onConsent?.();
  }
  return input.send();
}
