import { type InvokeArgs, type InvokeOptions, invoke as tauri } from "@tauri-apps/api/core";
import { connected, whenConnected } from "../lib/engineConnection.ts";
import { withoutAbout } from "../lib/taskMentions.ts";
import { captureWorkspaceContext } from "../lib/workspace-context.ts";

export { captureWorkspaceContext, displayWorkspaceSnapshot, requestedWorkspaceSnapshot } from "../lib/workspace-context.ts";

import { errorCode } from "../lib/errorCode.ts";

/**
 * El único `invoke` de la ventana: el de Tauri, que espera al servicio en vez
 * de rendirse con él. El backend ya insiste por su cuenta
 * (`cli/service/mod.rs`, `RETRY_BUDGET`); esta es la segunda red, para el
 * relevo que tarda más. Un fallo del comando —permiso denegado, rama que no
 * existe— cruza tal cual y sin demora.
 */

export { canRepeat, neverRan, retrying, WAITS } from "./retries.ts";

import { canRepeat, retrying, sleep } from "./retries.ts";

/**
 * Antes de que la ventana tenga motor (`launcher.rs`, fase `connecting`) el proxy
 * contesta `engine_down` sin correr nada: la orden espera al motor y se repite.
 */
export async function untilConnected<T>(
  call: () => Promise<T>,
  isConnected: () => boolean = connected,
  wait: () => Promise<void> = whenConnected,
): Promise<T> {
  try {
    return await call();
  } catch (e) {
    if (isConnected() || errorCode(e) !== "engine_down") throw e;
    await wait();
    return await call();
  }
}

const GLOBAL_READS = new Set(["list_workspaces", "workspaces_startup", "list_workspace_attention", "service_poll"]);

type Route = (command: string, args?: InvokeArgs, options?: InvokeOptions) => Promise<unknown>;
let route: Route | null = null;

/**
 * Con la cuenta de Danil, quien reparte entre las máquinas de la cuenta
 * (`features/machines/router.ts`); `null` deja solo el motor de la ventana. El
 * IPC global de Tauri no se toca: lo de esta computadora sigue siendo nativo.
 */
export function setMachineRoute(next: Route | null) {
  route = next;
}

const call = <T>(command: string, args?: InvokeArgs, options?: InvokeOptions): Promise<T> =>
  (route ? route(command, args, options) : tauri<T>(command, withoutAbout(args as Record<string, unknown> | undefined) as InvokeArgs | undefined, options)) as Promise<T>;

export const invoke = <T>(command: string, args?: InvokeArgs, options?: InvokeOptions): Promise<T> => {
  const captured = route && !GLOBAL_READS.has(command) ? captureWorkspaceContext(options) : options;
  return untilConnected(() => retrying(() => call<T>(command, args, captured), sleep, (e) => canRepeat(command, e)));
};
