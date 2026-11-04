/**
 * Guardar en la tarea el modelo que la persona eligió en el chip
 * (`session_model_v1`, danil-engine#371). `set_session_model` escribe
 * `session.model` y `session.effort` para el siguiente turno, sin tocar el que
 * corre: así un `task send` o el relay que llegan sin modelo siguen con el
 * elegido. Solo la elección explícita se guarda; el modelo que el cliente pone
 * solo (el primero del catálogo) no.
 */

/** Anunciada en `status.service_features` por el motor que conoce `set_session_model`. */
export const SESSION_MODEL_FEATURE = "session_model_v1";

/** Por qué el motor no guardó la elección: claves del catálogo, con frase en los dos clientes. */
export const SESSION_MODEL_REFUSALS = [
  "chat.session_model.not_offered",
  "chat.session_model.effort_not_offered",
  "chat.session_model.catalog_unavailable",
  "chat.session_model.agent_changed",
] as const;

/**
 * El motor niega un envío sin modelo a un agente que no sale sin uno, cuando
 * en el workspace no queda ninguno permitido. El detalle dice qué falta
 * (`free_models_accepted`, `account_connected`); la frase lo nombra.
 */
export const MODEL_REQUIRED_KEY = "cli.error.model_required";

export type SessionModelArgs = { project: string; id: string; model: string | null; effort: string | null };

/**
 * Los argumentos de `set_session_model`. El motor escribe los dos campos
 * siempre y `null` en uno lo borra, así que viajan juntos: un esfuerzo sin
 * modelo no se manda, porque el motor lo rechaza.
 */
export function sessionModelArgs(project: string, id: string, model: string | null | undefined, effort: string | null | undefined): SessionModelArgs {
  const chosen = model?.trim() || null;
  return { project, id, model: chosen, effort: chosen ? effort?.trim() || null : null };
}

/** La máquina anuncia la extensión; un motor anterior no la conoce y la elección no se guarda. */
export function savesSessionModel(features: readonly string[] | null | undefined): boolean {
  return features?.includes(SESSION_MODEL_FEATURE) === true;
}
