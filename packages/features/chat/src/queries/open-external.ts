import { invoke } from "../../../../engine-client/src/client.ts";

export const openExternal = (target: string): Promise<void> =>
  invoke("open_external", { target });
