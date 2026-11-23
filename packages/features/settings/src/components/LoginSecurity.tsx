import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { SettingsPanel, SettingsSection } from "../../../../ui/src/SettingsLayout";

export default function LoginSecurity() {
  return (
    <SettingsPanel data-settings-security="">
      <SettingsSection
        title={t("settings.security.title")}
        description={t("settings.security.status")}
      />
    </SettingsPanel>
  );
}
