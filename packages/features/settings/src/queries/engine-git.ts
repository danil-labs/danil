import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";

export function addFolder<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("add_folder", args, options);
}

export function addRepoUrl<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("add_repo_url", args, options);
}

export function attachRepo<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("attach_repo", args, options);
}

export function cancelBrowserLogin<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("cancel_browser_login", args, options);
}

export function checkGitHost<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("check_git_host", args, options);
}

export function connectGitHost<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("connect_git_host", args, options);
}

export function disconnectGitHost<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("disconnect_git_host", args, options);
}

export function finishBrowserLogin<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("finish_browser_login", args, options);
}

export function gitHostAreas<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("git_host_areas", args, options);
}

export function gitHostAvailableAreas<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("git_host_available_areas", args, options);
}

export function gitHostProjects<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("git_host_projects", args, options);
}

export function installGh<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("install_gh", args, options);
}

export function repoBranches<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("repo_branches", args, options);
}

export function selectGitHostArea<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("select_git_host_area", args, options);
}

export function startBrowserLogin<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("start_browser_login", args, options);
}
