// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { CliSkillDisableParams, CliSkillDisableOutput, CliSkillEnableParams, CliSkillEnableOutput, CliSkillListParams, CliSkillListOutput, CliSkillSourceAddParams, CliSkillSourceAddOutput, CliSkillSourceDisableParams, CliSkillSourceDisableOutput, CliSkillSourceEnableParams, CliSkillSourceEnableOutput, CliSkillSourceRemoveParams, CliSkillSourceRemoveOutput, CliSkillSourceUpdateParams, CliSkillSourceUpdateOutput, CliSkillSourcesParams, CliSkillSourcesOutput, CliSkillUninstallParams, CliSkillUninstallOutput, SkillSourceFreshnessParams, SkillSourceFreshnessOutput } from "../commands/skill.ts";

export function bind_skill(t: EngineTransport) {
  return {
    "skill disable": () => t.call("skill disable", {}) as Promise<CliSkillDisableOutput>,
    "skill enable": () => t.call("skill enable", {}) as Promise<CliSkillEnableOutput>,
    "skill list": () => t.call("skill list", {}) as Promise<CliSkillListOutput>,
    "skill source-add": () => t.call("skill source-add", {}) as Promise<CliSkillSourceAddOutput>,
    "skill source-disable": () => t.call("skill source-disable", {}) as Promise<CliSkillSourceDisableOutput>,
    "skill source-enable": () => t.call("skill source-enable", {}) as Promise<CliSkillSourceEnableOutput>,
    "skill source-remove": () => t.call("skill source-remove", {}) as Promise<CliSkillSourceRemoveOutput>,
    "skill source-update": () => t.call("skill source-update", {}) as Promise<CliSkillSourceUpdateOutput>,
    "skill sources": () => t.call("skill sources", {}) as Promise<CliSkillSourcesOutput>,
    "skill uninstall": () => t.call("skill uninstall", {}) as Promise<CliSkillUninstallOutput>,
    skill_source_freshness: () => t.call("skill_source_freshness", {}) as Promise<SkillSourceFreshnessOutput>,
  };
}
