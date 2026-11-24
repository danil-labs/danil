import { Channel, type InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";
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
  return invoke<(Project)>(
    "clone_project",
    { ...payload, progress: channel },
    options,
  );
};

export const cancelProjectClone = (operation: string): Promise<void> =>
  invoke("cancel_project_clone", { operation });

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
  invoke<(Project)>("create_project", payload, options);

export const reuseProject = (
  payload: {
    workspace: string;
    project: string;
    space?: string;
    workingDirectory?: string;
  },
  options?: InvokeOptions,
): Promise<(Project)> =>
  invoke<(Project)>("reuse_project", payload, options);

export const getProjectDirectory = (options?: InvokeOptions): Promise<string> =>
  invoke<string>("get_project_directory", {}, options);
