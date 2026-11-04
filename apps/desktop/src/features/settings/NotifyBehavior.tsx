import { t } from "../../lib/i18n";
import { createPref } from "../../lib/prefs";
import { Select } from "../../ui/Select";
import { NOTIFY_PREF, type NotifyChoice } from "../shell/TaskNotifier";
import { SettingsRow } from "./layout";
import "../../locales/settingsPhrases";

/** Cuándo avisa una tarea que se mira desde otro lado o con la ventana sin foco. */
export function NotifyBehavior() {
  const [choice, setChoice] = createPref<NotifyChoice>(NOTIFY_PREF, "all");
  return (
    <SettingsRow
      data-setting="notify-behavior"
      label={t("settings.general.notify.title")}
      description={t("settings.general.notify.hint")}
    >
      <Select
        variant="ghost"
        class="min-h-8 w-auto px-1.5 text-sm focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
        aria-label={t("settings.general.notify.title")}
        value={choice()}
        onChange={(e) => setChoice(e.currentTarget.value as NotifyChoice)}
      >
        <option value="all">{t("settings.general.notify.all")}</option>
        <option value="needs_you">{t("settings.general.notify.needs_you")}</option>
        <option value="off">{t("settings.general.notify.off")}</option>
      </Select>
    </SettingsRow>
  );
}
