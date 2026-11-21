import { Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { capabilities } from "../../../../host/src/platform";
import { SettingsPanel, SettingsSection } from "./layout";
import Harness from "./Harness";
import Herramientas from "../screens/Tools";
import "../../../../../apps/desktop/src/locales/settingsPhrases";

/** Conexiones › MCP: las herramientas que usan los agentes que trabajan en tus proyectos. */
export default function ConnectionsOperation() {
  return (
    <SettingsPanel>
      <SettingsSection title={t("settings.skills.tab_mcp")} description={t("settings.connections.mcp_hint")}>
        <div class="grid min-w-0 gap-5 pt-2">
          <Herramientas />
        </div>
      </SettingsSection>
      <Show when={capabilities().radiant}>
        <Harness />
      </Show>
    </SettingsPanel>
  );
}
