import { Show } from "solid-js";
import { isNoMachines } from "../../../../host/src/platform";
import type { MaquinasDeAjustes } from "../model/machines-port";
import { t } from "../../../../ui/src/lib/i18n";
import { SettingsPanel, SettingsSection } from "../../../../ui/src/SettingsLayout";
import Herramientas from "../screens/Tools";
import { MachineRequiredState } from "./MachineRequiredNotice";
import "../../../../ui/src/locales/settingsPhrases";

/** Conexiones › MCP: las herramientas que usan los agentes que trabajan en tus proyectos. */
export default function ConnectionsOperation(props: { maquinas: MaquinasDeAjustes }) {
  return (
    <SettingsPanel>
      <SettingsSection title={t("settings.skills.tab_mcp")} description={t("settings.connections.mcp_hint")}>
        <Show when={!isNoMachines()} fallback={<MachineRequiredState />}>
          <div class="grid min-w-0 gap-5 pt-2">
            <Herramientas maquinas={props.maquinas} />
          </div>
        </Show>
      </SettingsSection>
    </SettingsPanel>
  );
}
