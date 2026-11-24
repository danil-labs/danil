import { invoke, type InvokeOptions } from "../../../../engine-client/src/client.ts";

export const getProjectBaseBranches = <t = unknown>(
  payload: {
    project: string;
    refresh?: boolean;
    details?: boolean;
  },
  options?: InvokeOptions,
): Promise<t> =>
  invoke<t>("project_base_branches", payload, options);

export const setProjectBaseBranch = (
  payload: {
    project: string;
    reference: string;
  },
  options?: InvokeOptions,
): Promise<void> =>
  invoke("set_project_base_branch", payload, options);
