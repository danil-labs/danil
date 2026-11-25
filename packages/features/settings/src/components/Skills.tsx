import { Show } from "solid-js";
import { isNoMachines } from "../../../../host/src/platform";
import { t } from "../../../../ui/src/lib/i18n";
import { SettingsPanel, SettingsSection } from "../../../../ui/src/SettingsLayout";
import { MachineRequiredState } from "./MachineRequiredNotice";
import { FuentesDeSkills } from "./SkillSources";
import { SkillsDeFuentes } from "./SourceSkills";

export default function Skills() {
  return (
    <SettingsPanel>
      <Show
        when={!isNoMachines()}
        fallback={
          <SettingsSection title={t("settings.nav.skills")}>
            <MachineRequiredState />
          </SettingsSection>
        }
      >
        <FuentesDeSkills />
        <SkillsDeFuentes />
      </Show>
    </SettingsPanel>
  );
}
