import { callEngine } from "../../../../engine-client/src/client.ts";
import type { ProjectRepository } from "../model/projectRepositories";

export type RemoteRepository = {
  slug?: string;
  name: string;
  clone_url: string;
};

export type Area = { key: string; name: string };

export const listProjectRepositories = (
  workspace?: string | null,
): Promise<(ProjectRepository[])> =>
  callEngine<(ProjectRepository[])>("list_project_repositories", { workspace });

export const getGitHostAreas = (
  id: string,
  scope?: string | null,
): Promise<(Area[])> =>
  callEngine<(Area[])>("git_host_areas", { id, scope });

export const getGitHostProjects = (payload: {
  id: string;
  area: string;
  scope?: string | null;
  includeSkills?: boolean;
}): Promise<(RemoteRepository[])> =>
  callEngine<(RemoteRepository[])>("git_host_projects", payload);
