import { t } from "../../lib/i18n";

export default function HarnessInsights() {
  return (
    <div class="grid gap-3 rounded-lg border border-border bg-surface-raised p-4" data-harness-insights="">
      <header class="grid gap-1">
        <h3 class="m-0 text-sm font-semibold text-neutral-950">{t("harness.insights.title")}</h3>
        <p class="m-0 text-xs text-neutral-500">{t("harness.insights.description")}</p>
      </header>
      <p class="m-0 text-ui text-neutral-500" role="status">{t("harness.admin.unavailable")}</p>
    </div>
  );
}
