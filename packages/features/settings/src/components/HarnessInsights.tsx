import { t } from "../../../../ui/src/lib/i18n";
import { SettingsSection } from "../../../../ui/src/SettingsLayout";

export default function HarnessInsights() {
  return <SettingsSection title={t("harness.insights.title")}>
    <p class="m-0 text-ui text-neutral-500" role="status">{t("harness.admin.unavailable")}</p>
  </SettingsSection>;
}
