import { invoke, type InvokeArgs, type InvokeOptions } from "../../../../engine-client/src/client.ts";

export function setRoot<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("set_root", args, options);
}
