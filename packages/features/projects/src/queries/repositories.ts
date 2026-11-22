import { invoke } from "../../../../engine-client/src/client.ts";
import type { ProjectRepository } from "../../../../../apps/desktop/src/lib/projectRepositories";

export type RemoteRepository = {
  slug?: string;
  name: string;
  clone_url: string;
};

export type Area = { key: string; name: string };

export const listProjectRepositories = (
  workspace?: string | null,
): Promise<(ProjectRepository[])> =>
  invoke<(ProjectRepository[])>("list_project_repositories", { workspace });

export const getGitHostAreas = (
  id: string,
  scope?: string | null,
): Promise<(Area[])> =>
  invoke<(Area[])>("git_host_areas", { id, scope });

export const getGitHostProjects = (payload: {
  id: string;
  area: string;
  scope?: string | null;
  includeSkills?: boolean;
}): Promise<(RemoteRepository[])> =>
  invoke<(RemoteRepository[])>("git_host_projects", payload);
