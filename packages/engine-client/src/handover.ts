import type { OpenedSession } from "./types.ts";

/**
 * Cambiar de CLI (Claude, Codex, OpenCode) dentro de una tarea normal. El motor
 * anuncia la extensión y deja el comando `set_session_provider`; `load_session`
 * dice si la tarea puede cambiar y, si no, por qué (`chat.handover.*`).
 */

/** Anunciada por el motor que conoce `set_session_provider` (`provider_handoff_v1`). */
export const PROVIDER_HANDOFF_FEATURE = "provider_handoff_v1";

/** Un motor anterior no manda el campo: ausente es que la tarea no puede cambiar. */
export function canHandOver(session: Pick<OpenedSession, "can_hand_over"> | null | undefined): boolean {
  return session?.can_hand_over === true;
}
