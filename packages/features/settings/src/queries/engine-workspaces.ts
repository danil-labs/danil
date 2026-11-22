import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";

export function deleteProject<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("delete_project", args, options);
}

export function getProfile<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("get_profile", args, options);
}

export function getProjectDirectory<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("get_project_directory", args, options);
}

export function listProjects<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("list_projects", args, options);
}

export function listSources<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("list_sources", args, options);
}

export function listSurfaces<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("list_surfaces", args, options);
}

export function listWorkspaces<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("list_workspaces", args, options);
}

export function previewFile<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("preview_file", args, options);
}

export function removeSource<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("remove_source", args, options);
}

export function removeWorkspace<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("remove_workspace", args, options);
}

export function renameProject<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("rename_project", args, options);
}

export function renameWorkspace<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("rename_workspace", args, options);
}

export function setProfile<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("set_profile", args, options);
}

export function setProjectDirectory<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("set_project_directory", args, options);
}

export function setWorkspaceHostGithub<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("set_workspace_host_github", args, options);
}

export function setWorkspaceLogo<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("set_workspace_logo", args, options);
}

export function setWorkspaceLogoPng<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("set_workspace_logo_png", args, options);
}

export function setWorkspacePermissionMode<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("set_workspace_permission_mode", args, options);
}

export function setWorkspaceWorktreesRoot<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("set_workspace_worktrees_root", args, options);
}

export function sourceDetail<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("source_detail", args, options);
}

export function sourceFreshness<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("source_freshness", args, options);
}
