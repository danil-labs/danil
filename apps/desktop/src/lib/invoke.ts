import { invoke as tauri, type InvokeArgs, type InvokeOptions } from "@tauri-apps/api/core";
import { connected, whenConnected } from "./engineConnection.ts";
import { withoutAbout } from "./taskMentions.ts";
import { errorCode } from "./errorCode.ts";

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

/** La máquina que pide la cabecera `x-terminus-machine`, si la hay. */
function machineHeader(options?: InvokeOptions): string | null {
  try {
    return new Headers(options?.headers as HeadersInit | undefined).get("x-terminus-machine") || null;
  } catch {
    return null;
  }
}

/**
 * Si el IPC reparte por máquina: lo declara con `routesMachines: true` (el
 * router de la web, `web/ipc.ts`). Sin la marca no reparte, como el nativo.
 */
function ipcRoutesMachines(): boolean {
  // Donde lo lee `@tauri-apps/api`: `window`, que en el arnés no es `globalThis`.
  const host = (typeof window === "undefined" ? globalThis : window) as { __TAURI_INTERNALS__?: { routesMachines?: unknown } };
  const internals = host.__TAURI_INTERNALS__;
  return internals?.routesMachines === true;
}

/**
 * Sin ruta, un IPC que no reparte (el motor de la ventana) ignora la cabecera:
 * una orden para otra máquina (en medio de un cambio de cuenta) correría aquí
 * sin aviso. Se rechaza con su motivo; una VM huésped dice que está apagada.
 */
function unrouted<T>(command: string, args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  const machine = machineHeader(options);
  if (machine && machine !== "local" && !ipcRoutesMachines()) {
    const guest = machine.startsWith("wsl:") || machine.startsWith("lima:");
    return Promise.reject({ code: guest ? "machine_off" : "unknown_machine", detail: machine });
  }
  return tauri<T>(command, withoutAbout(args as Record<string, unknown> | undefined) as InvokeArgs | undefined, options);
}

const call = <T>(command: string, args?: InvokeArgs, options?: InvokeOptions): Promise<T> =>
  (route ? route(command, args, options) : unrouted<T>(command, args, options)) as Promise<T>;

export const invoke = <T>(command: string, args?: InvokeArgs, options?: InvokeOptions): Promise<T> =>
  untilConnected(() => retrying(() => call<T>(command, args, options), sleep, (e) => canRepeat(command, e)));
