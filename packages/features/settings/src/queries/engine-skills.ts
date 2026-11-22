import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";

export function addSkillSource<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("add_skill_source", args, options);
}

export function listSkillSources<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("list_skill_sources", args, options);
}

export function listSourceSkills<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("list_source_skills", args, options);
}

export function removeSkillSource<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("remove_skill_source", args, options);
}

export function setSkillSourceEnabled<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("set_skill_source_enabled", args, options);
}

export function setSourceSkill<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("set_source_skill", args, options);
}

export function skillSourceFreshness<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("skill_source_freshness", args, options);
}

export function uninstallSourceSkill<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("uninstall_source_skill", args, options);
}

export function updateSkillSource<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("update_skill_source", args, options);
}
