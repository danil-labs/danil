import { invoke, type InvokeArgs, type InvokeOptions } from "../../engine-client/src/client.ts";

/** Invoca comandos del motor desde las vistas de `packages/shell` sin exponer `invoke` directo. */
export function callShellViewEngine<T = unknown>(command: string, args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>(command, args, options);
}
