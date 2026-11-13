import { t } from "../../lib/i18n";
import { SettingsSection } from "./layout";

export default function HarnessInsights() {
  return <SettingsSection title={t("harness.insights.title")}>
    <p class="m-0 text-ui text-neutral-500" role="status">{t("harness.admin.unavailable")}</p>
  </SettingsSection>;
}
