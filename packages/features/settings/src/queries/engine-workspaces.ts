import { invoke, type InvokeArgs, type InvokeOptions } from "../../../../engine-client/src/client.ts";

export function getProfile<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("get_profile", args, options);
}

export function getProjectDirectory<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("get_project_directory", args, options);
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

export function setProfile<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("set_profile", args, options);
}

export function setProjectDirectory<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("set_project_directory", args, options);
}

export function setWorkspaceHostGithub<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("set_workspace_host_github", args, options);
}

export function setWorkspacePermissionMode<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("set_workspace_permission_mode", args, options);
}

export function sourceDetail<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("source_detail", args, options);
}

export function sourceFreshness<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("source_freshness", args, options);
}
