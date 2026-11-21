import type { MachineConnection } from "@danil/engine-client";
import type {
  DeleteTaskTarget,
  DeleteTaskPreview,
  DeleteTaskResult,
} from "../model.ts";
import { inspectTaskDeletion, applyTaskDeletion } from "../queries.ts";

export interface TaskLifecycleErrorDetails {
  code: "task_family_consent_changed" | "inspection_failed" | "apply_failed";
  message: string;
  target: DeleteTaskTarget;
  preview?: DeleteTaskPreview;
}

export class TaskLifecycleError extends Error implements TaskLifecycleErrorDetails {
  readonly code: "task_family_consent_changed" | "inspection_failed" | "apply_failed";
  readonly target: DeleteTaskTarget;
  readonly preview?: DeleteTaskPreview;

  constructor(details: TaskLifecycleErrorDetails) {
    super(details.message);
    this.name = "TaskLifecycleError";
    this.code = details.code;
    this.target = details.target;
    this.preview = details.preview;
  }
}

/**
 * Orquesta el ciclo de vida de borrado según 11-business-logic § 4:
 * 1. Inspección previa (task_lifecycle_preview) obteniendo consentimiento (5 min) y estado git.
 * 2. Aplicación con descarte (task_lifecycle_apply con { project, id, action: "delete", consent, discard }).
 * 3. Si el motor devuelve `task_family_consent_changed`, NUNCA reaplica a ciegas;
 *    solicita una nueva preview y pide confirmación actualizada.
 */
export async function executeTaskDeletionLifecycle(
  conn: MachineConnection,
  target: DeleteTaskTarget,
  preview: DeleteTaskPreview,
  optionsOrConsentCallback?:
    | { discard?: boolean; onConsentRenewalNeeded?: (newPreview: DeleteTaskPreview) => void }
    | ((newPreview: DeleteTaskPreview) => void),
): Promise<DeleteTaskResult> {
  const options =
    typeof optionsOrConsentCallback === "function"
      ? { onConsentRenewalNeeded: optionsOrConsentCallback, discard: false }
      : optionsOrConsentCallback;
  try {
    return await applyTaskDeletion(conn, target, preview, { discard: options?.discard ?? false });
  } catch (err) {
    const isConsentChanged =
      (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "task_family_consent_changed") ||
      (err instanceof Error && err.message.includes("task_family_consent_changed"));

    if (isConsentChanged) {
      // Solicitar nueva preview sin reaplicar a ciegas
      const freshPreview = await inspectTaskDeletion(conn, target);
      if (options?.onConsentRenewalNeeded) {
        options.onConsentRenewalNeeded(freshPreview);
      }
      throw new TaskLifecycleError({
        code: "task_family_consent_changed",
        message: "El consentimiento de la tarea cambió; se ha solicitado una nueva preview",
        target,
        preview: freshPreview,
      });
    }

    throw err;
  }
}
