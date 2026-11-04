/**
 * `set_session_model` (`session_model_v1`), fuera de la carga inicial: solo
 * corre cuando la persona elige en el chip. Trae sus frases de rechazo
 * (`chat.session_model.*`) antes de que el aviso las pida.
 */
import { sessionModelArgs } from "@terminus/protocol";
import { invoke } from "../../lib/invoke.ts";
import "../../locales/failurePhrases";

export async function saveSessionModel(
  project: string,
  id: string,
  model: string,
  effort: string | null,
  options: Parameters<typeof invoke>[2],
): Promise<void> {
  await invoke("set_session_model", sessionModelArgs(project, id, model, effort), options);
}
