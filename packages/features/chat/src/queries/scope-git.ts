import { invoke, type InvokeOptions } from "../../../../engine-client/src/client.ts";

export type RepoRemoto = {
  slug: string;
  name: string;
  clone_url: string;
  branch: string;
  can_push: boolean | null;
};

export type Area = { key: string; name: string };

export const getRepoBranches = (
  cloneUrl: string,
): Promise<{ default: string; branches: string[] }> =>
  invoke<{ default: string; branches: string[] }>("repo_branches", { cloneUrl });

export const getGitHostAreas = (id: string): Promise<(Area[])> =>
  invoke<(Area[])>("git_host_areas", { id });

export const getGitHostProjects = (id: string, area: string): Promise<(RepoRemoto[])> =>
  invoke<(RepoRemoto[])>("git_host_projects", { id, area });

export const attachRepo = (
  payload: {
    project: string;
    gitHost: string;
    cloneUrl: string;
    branch?: string;
    name?: string;
    canPush?: boolean | null;
  },
  options?: InvokeOptions,
): Promise<{ id: string }> =>
  invoke<{ id: string }>("attach_repo", payload, options);

export const addRepoUrl = (
  payload: { cloneUrl: string },
  options?: InvokeOptions,
): Promise<{ id: string }> =>
  invoke<{ id: string }>("add_repo_url", payload, options);

export const addFolder = (
  payload: { locator: string },
  options?: InvokeOptions,
): Promise<{ id: string }> =>
  invoke<{ id: string }>("add_folder", payload, options);
