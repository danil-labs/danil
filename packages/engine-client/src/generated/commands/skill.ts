// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type CliSkillDisableParams = Record<string, never>;
export type CliSkillDisableOutput = null;

export type CliSkillEnableParams = Record<string, never>;
export type CliSkillEnableOutput = null;

export type CliSkillListParams = Record<string, never>;
export type CliSkillListOutput = null;

export type CliSkillSourceAddParams = Record<string, never>;
export type CliSkillSourceAddOutput = null;

export type CliSkillSourceDisableParams = Record<string, never>;
export type CliSkillSourceDisableOutput = null;

export type CliSkillSourceEnableParams = Record<string, never>;
export type CliSkillSourceEnableOutput = null;

export type CliSkillSourceRemoveParams = Record<string, never>;
export type CliSkillSourceRemoveOutput = null;

export type CliSkillSourceUpdateParams = Record<string, never>;
export type CliSkillSourceUpdateOutput = null;

export type CliSkillSourcesParams = Record<string, never>;
export type CliSkillSourcesOutput = null;

export type CliSkillUninstallParams = Record<string, never>;
export type CliSkillUninstallOutput = null;

export type SkillSourceFreshnessParams = Record<string, never>;
export type SkillSourceFreshnessOutput = unknown[];

export const COMMANDS_SKILL = {
  "skill disable": { kind: "cli", scope: null, authority: "catalog", channel: null },
  "skill enable": { kind: "cli", scope: null, authority: "unattended", channel: null },
  "skill list": { kind: "cli", scope: null, authority: "read", channel: null },
  "skill source-add": { kind: "cli", scope: null, authority: "admin", channel: null },
  "skill source-disable": { kind: "cli", scope: null, authority: "catalog", channel: null },
  "skill source-enable": { kind: "cli", scope: null, authority: "catalog", channel: null },
  "skill source-remove": { kind: "cli", scope: null, authority: "admin", channel: null },
  "skill source-update": { kind: "cli", scope: null, authority: "catalog", channel: null },
  "skill sources": { kind: "cli", scope: null, authority: "read", channel: null },
  "skill uninstall": { kind: "cli", scope: null, authority: "admin", channel: null },
  skill_source_freshness: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
} as const;
