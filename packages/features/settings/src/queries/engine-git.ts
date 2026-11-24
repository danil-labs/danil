import { invoke, type InvokeArgs, type InvokeOptions } from "../../../../engine-client/src/client.ts";

export function addFolder<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("add_folder", args, options);
}

export function addRepoUrl<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("add_repo_url", args, options);
}

export function attachRepo<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("attach_repo", args, options);
}

export function cancelBrowserLogin<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("cancel_browser_login", args, options);
}

export function checkGitHost<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("check_git_host", args, options);
}

export function connectGitHost<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("connect_git_host", args, options);
}

export function disconnectGitHost<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("disconnect_git_host", args, options);
}

export function finishBrowserLogin<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("finish_browser_login", args, options);
}

export function gitHostAreas<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("git_host_areas", args, options);
}

export function gitHostAvailableAreas<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("git_host_available_areas", args, options);
}

export function gitHostProjects<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("git_host_projects", args, options);
}

export function installGh<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("install_gh", args, options);
}

export function repoBranches<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("repo_branches", args, options);
}

export function selectGitHostArea<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("select_git_host_area", args, options);
}

export function startBrowserLogin<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("start_browser_login", args, options);
}
