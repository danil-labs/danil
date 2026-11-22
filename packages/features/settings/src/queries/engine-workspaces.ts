import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";

export function deleteProject<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("delete_project", args, options);
}

export function getProfile<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("get_profile", args, options);
}

export function getProjectDirectory<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("get_project_directory", args, options);
}

export function listProjects<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("list_projects", args, options);
}

export function listSources<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("list_sources", args, options);
}

export function listSurfaces<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("list_surfaces", args, options);
}

export function listWorkspaces<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("list_workspaces", args, options);
}

export function previewFile<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("preview_file", args, options);
}

export function removeSource<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("remove_source", args, options);
}

export function removeWorkspace<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("remove_workspace", args, options);
}

export function renameProject<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("rename_project", args, options);
}

export function renameWorkspace<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("rename_workspace", args, options);
}

export function setProfile<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("set_profile", args, options);
}

export function setProjectDirectory<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("set_project_directory", args, options);
}

export function setWorkspaceHostGithub<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("set_workspace_host_github", args, options);
}

export function setWorkspaceLogo<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("set_workspace_logo", args, options);
}

export function setWorkspaceLogoPng<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("set_workspace_logo_png", args, options);
}

export function setWorkspacePermissionMode<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("set_workspace_permission_mode", args, options);
}

export function setWorkspaceWorktreesRoot<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("set_workspace_worktrees_root", args, options);
}

export function sourceDetail<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("source_detail", args, options);
}

export function sourceFreshness<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("source_freshness", args, options);
}
