import { t } from "../../lib/i18n";

/**
 * El texto de un rechazo al subir o sincronizar el workspace (código del plano de
 * control). `canSync`: su workspace propio en la nube se puede elegir para sincronizar.
 */
export function directoryErrorText(code: string, canSync = false): string {
  switch (code) {
    case "not_account_admin":
      return t("shell.directory.linkNotAdmin");
    case "workspace_already_linked":
    case "danil_workspace_taken":
      return t("shell.directory.linkTaken");
    case "no_session":
      return t("shell.directory.linkSignIn");
    case "personal_workspace_exists":
      return canSync ? t("shell.directory.createExists") : t("shell.directory.createExistsTaken");
    case "create_failed":
      return t("shell.directory.createFailed");
    default:
      return t("shell.directory.linkFailed");
  }
}
