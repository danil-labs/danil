import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { SettingsRow } from "./layout";
import "../../../../../apps/desktop/src/locales/settingsPhrases";

export function CloseBehavior() {
  return (
    <SettingsRow
      data-setting="close-behavior"
      label={t("settings.general.close.title")}
      description={t("settings.general.close.hint")}
    />
  );
}
