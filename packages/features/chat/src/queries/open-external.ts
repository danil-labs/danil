import { callEngine } from "../../../../engine-client/src/client.ts";

export const openExternal = (target: string): Promise<void> =>
  callEngine("open_external", { target });
