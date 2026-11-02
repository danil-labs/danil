import { t } from "../../lib/i18n";

/** El texto de un rechazo al enlazar o crear el workspace de Danil (código del plano de control). */
export function directoryErrorText(code: string): string {
  switch (code) {
    case "not_account_admin":
      return t("shell.directory.linkNotAdmin");
    case "workspace_already_linked":
    case "danil_workspace_taken":
      return t("shell.directory.linkTaken");
    case "personal_workspace_exists":
      return t("shell.directory.createExists");
    case "create_failed":
      return t("shell.directory.createFailed");
    default:
      return t("shell.directory.linkFailed");
  }
}
