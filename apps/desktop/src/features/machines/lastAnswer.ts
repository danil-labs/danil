/**
 * Lo último que contestó cada máquina a las lecturas del composer que el relay
 * no guarda en su copia (`list_surfaces`, `list_models`; `MIRROR_COMMANDS` de
 * `@terminus/computers`). Con la máquina dormida, la caja escribe con eso: no
 * contestar no es no tener agentes, y enviar es lo que la enciende.
 */
import { errorCode } from "../../lib/errorCode";
import { escribirPref, leerPref } from "../../lib/prefs";

const KEY = "machines.last_answer";
/** Apagada, o encendiéndose porque una lectura la despertó (`router.ts`, `managedOff`). */
const ASLEEP = new Set(["machine_off", "machine_starting"]);

export const asleep = (error: unknown) => ASLEEP.has(errorCode(error) ?? "");

/**
 * Llama a `call` y guarda su respuesta para `machine`. Si la máquina duerme,
 * contesta con la última guardada; sin ninguna, lanza el mismo fallo.
 */
export async function withLastAnswer<T>(machine: string | null, key: string, call: () => Promise<T>): Promise<T> {
  if (!machine || machine === "local") return call();
  const slot = `${machine}\u0000${key}`;
  try {
    const value = await call();
    escribirPref(KEY, { ...leerPref<Record<string, unknown>>(KEY, {}), [slot]: value });
    return value;
  } catch (error) {
    const saved = asleep(error) ? leerPref<Record<string, unknown>>(KEY, {})[slot] : undefined;
    if (saved === undefined) throw error;
    return saved as T;
  }
}
