import { t } from "../../../../ui/src/lib/i18n";
import { SettingsRow } from "../../../../ui/src/SettingsLayout";
import "../../../../ui/src/locales/settingsPhrases";

export function CloseBehavior() {
  return (
    <SettingsRow
      data-setting="close-behavior"
      label={t("settings.general.close.title")}
      description={t("settings.general.close.hint")}
    />
  );
}
