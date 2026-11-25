import { invoke, type InvokeArgs, type InvokeOptions } from "../../engine-client/src/client.ts";

/**
 * Ejecuta un comando RPC del motor desde los módulos `.ts` de `packages/shell`,
 * manteniendo el acceso directo a `invoke` dentro de los paquetes permitidos por R1.
 */
export function callShellEngine<T = unknown>(
  command: string,
  args?: InvokeArgs,
  options?: InvokeOptions,
): Promise<T> {
  return invoke<T>(command, args, options);
}
