import { SettingsPanel } from "./layout";
import { FuentesDeSkills } from "./SkillSources";
import { SkillsDeFuentes } from "./SourceSkills";

export default function Skills() {
  return (
    <SettingsPanel>
      <FuentesDeSkills />
      <SkillsDeFuentes />
    </SettingsPanel>
  );
}
