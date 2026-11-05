import { invoke as tauri, type InvokeArgs, type InvokeOptions } from "@tauri-apps/api/core";
import { connected, whenConnected } from "./engineConnection.ts";
import { withoutAbout } from "./taskMentions.ts";
import { errorCode } from "./errorCode.ts";
import { capabilities } from "./platform.ts";

/**
 * El único `invoke` de la ventana: el de Tauri, que espera al servicio en vez
 * de rendirse con él. El backend ya insiste por su cuenta
 * (`cli/service/mod.rs`, `RETRY_BUDGET`); esta es la segunda red, para el
 * relevo que tarda más. Un fallo del comando —permiso denegado, rama que no
 * existe— cruza tal cual y sin demora.
 */

/**
 * Los códigos con los que el backend afirma que la orden no llegó a correr.
 * Viajan en el `detail` del `Failure` (`para_la_ventana`). `io` no está: ahí la
 * orden pudo ejecutarse y perderse la respuesta, y repetirla la duplicaría.
 */
const NEVER_RAN = new Set(["app_unavailable", "invalid_token", "service_busy"]);

/** Cinco esperas que suman unos cuatro segundos y medio. */
export const WAITS = [150, 300, 600, 1200, 2400];

export function neverRan(e: unknown): boolean {
  const code = errorCode(e);
  return code !== null && NEVER_RAN.has(code);
}

/**
 * Una lectura se repite también tras `io`: repetirla no duplica nada. Sin esto,
 * la lista que falló una vez —workspaces, cuentas— deja su panel muerto hasta
 * que algo lo recargue.
 */
const READ = /^(list_|load_|read_|get_)|_status$/;

/**
 * Lecturas que tras `io` siguen corriendo en el motor: el barrido de disco pasa
 * de los 30 s del transporte, y repetirlo lo forma detrás de sí mismo.
 */
const SLOW_READS = new Set(["list_storage"]);

export function canRepeat(command: string, e: unknown): boolean {
  if (neverRan(e)) return true;
  return READ.test(command) && !SLOW_READS.has(command) && errorCode(e) === "io";
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** El reintento suelto del transporte que usa `invoke`, para poder probarlo. */
export async function retrying<T>(
  call: () => Promise<T>,
  wait: (ms: number) => Promise<unknown> = sleep,
  repeatable: (e: unknown) => boolean = neverRan,
): Promise<T> {
  for (const ms of WAITS) {
    try {
      return await call();
    } catch (e) {
      if (!repeatable(e)) throw e;
      await wait(ms);
    }
  }
  return await call();
}

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

const call = <T>(command: string, args?: InvokeArgs, options?: InvokeOptions): Promise<T> => {
  if (route) return route(command, args, options) as Promise<T>;
  const machine = new Headers(options?.headers).get("x-terminus-machine");
  if (capabilities().nativeWindow && machine && machine !== "local")
    return Promise.reject({ what: { clave: "shell.service.failed" }, detail: "unknown_machine" });
  return tauri<T>(command, withoutAbout(args as Record<string, unknown> | undefined) as InvokeArgs | undefined, options);
};

export const invoke = <T>(command: string, args?: InvokeArgs, options?: InvokeOptions): Promise<T> =>
  untilConnected(() => retrying(() => call<T>(command, args, options), sleep, (e) => canRepeat(command, e)));
