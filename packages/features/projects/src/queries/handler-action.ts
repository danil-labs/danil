import { invoke, type InvokeArgs, type InvokeOptions } from "../../../../engine-client/src/client.ts";

export function handlerAction<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("handler_action", args, options);
}
