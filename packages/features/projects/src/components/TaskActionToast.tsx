import { Show } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { errorCode } from "../../../../ui/src/lib/errorCode.ts";
import { claveDe, detalleDe, prosaDe } from "../../../../ui/src/Failure";
import { Button } from "../../../../ui/src/Button";
import { Toast, ToastPortal } from "../../../../ui/src/Toast";

/** El gesto sobre una tarea que falló: el aviso dice cuál y no la frase genérica del servicio. */
type TaskAction = "finish" | "archive" | "discard" | "pin";
export type TaskActionFailure = { action: TaskAction; error: unknown; retry?: () => void };

const TITULOS: Record<TaskAction, string> = {
  finish: "projects.sessions.action_failed.finish",
  archive: "projects.sessions.action_failed.archive",
  discard: "projects.sessions.action_failed.discard",
  pin: "projects.sessions.action_failed.pin",
};
/** Las frases que no explican nada: con ellas basta el título del gesto. */
const GENERICAS = new Set(["shell.service.failed", "common.failure.generic"]);

/** El porqué, en una frase para personas, o nada si el motor no dio uno. */
function taskActionCause(error: unknown): string | null {
  // `task_family_busy`: otro gesto tiene tomados los candados de la familia.
  if (errorCode(error) === "task_family_busy") return t("projects.sessions.action_failed.busy");
  const clave = claveDe(error);
  if (clave && GENERICAS.has(clave)) return null;
  const texto = prosaDe(error);
  return texto === t("common.failure.generic") || texto === t("shell.service.failed") ? null : texto;
}

/**
 * El fallo de un gesto puntual sobre una tarea (finalizar, archivar…), como
 * aviso de la pila y no como barra fija en el riel: el riel enseña estado, no
 * el resultado de un clic. Se queda hasta su cruz o el siguiente gesto.
 */
export function TaskActionToast(props: { failure: TaskActionFailure | null; onDismiss: () => void }) {
  return (
    <Show when={props.failure}>{(f) => (
      <ToastPortal>
        <Toast tone="error" data-task-action-error={f().action} onDismiss={props.onDismiss}>
          <div class="grid max-h-[50vh] min-w-0 gap-1 overflow-y-auto break-words">
            <p class="m-0 text-ui font-medium text-error-strong">{t(TITULOS[f().action])}</p>
            <Show when={taskActionCause(f().error)}>{(cause) => (
              <p class="m-0 whitespace-pre-line text-caption text-neutral-500">{cause()}</p>
            )}</Show>
            <details>
              <summary class="cursor-pointer text-caption text-neutral-500">{t("common.failure.detail")}</summary>
              <p class="m-0 mt-1 font-mono text-caption break-all whitespace-pre-wrap text-neutral-500">{detalleDe(f().error)}</p>
            </details>
          </div>
          <Show when={f().retry}>{(retry) => (
            <div>
              <Button variant="outline" size="compact" onClick={() => { props.onDismiss(); retry()(); }}>
                {t("common.part.retry")}
              </Button>
            </div>
          )}</Show>
        </Toast>
      </ToastPortal>
    )}</Show>
  );
}
