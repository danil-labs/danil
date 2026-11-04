import { t } from "../../lib/i18n";

/** El texto de un rechazo al sincronizar el workspace (código del plano de control). */
export function directoryErrorText(code: string): string {
  switch (code) {
    case "not_account_admin":
      return t("shell.directory.linkNotAdmin");
    case "workspace_already_linked":
    case "danil_workspace_taken":
      return t("shell.directory.linkTaken");
    case "no_session":
      return t("shell.directory.linkSignIn");
    default:
      return t("shell.directory.linkFailed");
  }
}
