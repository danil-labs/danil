import { callEngine, type InvokeArgs, type InvokeOptions } from "../../../../engine-client/src/client.ts";

export function setRoot<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("set_root", args, options);
}
