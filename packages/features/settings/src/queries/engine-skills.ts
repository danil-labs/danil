import { callEngine, type InvokeArgs, type InvokeOptions } from "../../../../engine-client/src/client.ts";

export function addSkillSource<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("add_skill_source", args, options);
}

export function listSkillSources<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("list_skill_sources", args, options);
}

export function listSourceSkills<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("list_source_skills", args, options);
}

export function removeSkillSource<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("remove_skill_source", args, options);
}

export function setSkillSourceEnabled<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("set_skill_source_enabled", args, options);
}

export function setSourceSkill<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("set_source_skill", args, options);
}

export function skillSourceFreshness<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("skill_source_freshness", args, options);
}

export function uninstallSourceSkill<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("uninstall_source_skill", args, options);
}

export function updateSkillSource<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("update_skill_source", args, options);
}
