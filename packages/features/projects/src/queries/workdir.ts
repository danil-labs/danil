import { Channel, callEngine, type InvokeOptions } from "../../../../engine-client/src/client.ts";
import type { Project } from "../../../../ui/src/lib/model";

export const cloneProject = (
  payload: {
    url: string;
    name: string;
    directory: string | null;
    operation: string;
    workspace: string | null;
    gitHost: string | null;
    space?: string;
  },
  onProgress?: (value: { phase: string; percent: number | null }) => void,
  options?: InvokeOptions,
): Promise<(Project)> => {
  const channel = onProgress
    ? new Channel<{ phase: string; percent: number | null }>(onProgress)
    : undefined;
  return callEngine<(Project)>(
    "clone_project",
    { ...payload, progress: channel },
    options,
  );
};

export const cancelProjectClone = (operation: string): Promise<void> =>
  callEngine("cancel_project_clone", { operation });

export const createProject = (
  payload: {
    name: string;
    workingDirectory?: string;
    directory?: string;
    space?: string;
    initGit?: boolean;
  },
  options?: InvokeOptions,
): Promise<(Project)> =>
  callEngine<(Project)>("create_project", payload, options);

export const reuseProject = (
  payload: {
    workspace: string;
    project: string;
    space?: string;
    workingDirectory?: string;
  },
  options?: InvokeOptions,
): Promise<(Project)> =>
  callEngine<(Project)>("reuse_project", payload, options);

export const getProjectDirectory = (options?: InvokeOptions): Promise<string> =>
  callEngine<string>("get_project_directory", {}, options);
