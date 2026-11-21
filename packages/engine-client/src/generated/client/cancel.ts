// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { CancelBrowserLoginParams, CancelBrowserLoginOutput, CancelGoogleDriveLoginParams, CancelGoogleDriveLoginOutput, CancelInstallParams, CancelInstallOutput, CancelLocalModelParams, CancelLocalModelOutput, CancelLoginParams, CancelLoginOutput, CancelProjectCloneParams, CancelProjectCloneOutput, CancelQuestionParams, CancelQuestionOutput } from "../commands/cancel.ts";

export function bind_cancel(t: EngineTransport) {
  return {
    cancel_browser_login: (params: CancelBrowserLoginParams) => t.call("cancel_browser_login", params) as Promise<CancelBrowserLoginOutput>,
    cancel_google_drive_login: (params?: CancelGoogleDriveLoginParams) => t.call("cancel_google_drive_login", params) as Promise<CancelGoogleDriveLoginOutput>,
    cancel_install: (params: CancelInstallParams) => t.call("cancel_install", params) as Promise<CancelInstallOutput>,
    cancel_local_model: () => t.call("cancel_local_model", {}) as Promise<CancelLocalModelOutput>,
    cancel_login: (params: CancelLoginParams) => t.call("cancel_login", params) as Promise<CancelLoginOutput>,
    cancel_project_clone: (params: CancelProjectCloneParams) => t.call("cancel_project_clone", params) as Promise<CancelProjectCloneOutput>,
    cancel_question: (params: CancelQuestionParams) => t.call("cancel_question", params) as Promise<CancelQuestionOutput>,
  };
}
