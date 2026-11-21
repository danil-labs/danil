import { errorCode } from "../../../apps/desktop/src/lib/errorCode.ts";

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

export const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

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

