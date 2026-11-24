import { callEngine, type InvokeArgs, type InvokeOptions } from "../../../../engine-client/src/client.ts";

export function openExternal<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("open_external", args, options);
}
