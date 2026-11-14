import { borrarPref, escribirPref, leerPref } from "../../lib/prefs.ts";

/**
 * El último nombre conocido de cada máquina de la flota (id → nombre), para
 * que «Ejecutar en» abra en frío con el nombre de la recordada en vez de
 * «Conectando…» mientras llega el inventario. Solo id y nombre, nunca tokens
 * ni estado: lo que vale lo sigue diciendo la flota y toda orden la valida el
 * motor. Se reemplaza con cada inventario y se borra al cerrar sesión.
 */
const KEY = "machines.known_names";

let cache: Record<string, string> | null = null;

const read = (): Record<string, string> => (cache ??= leerPref<Record<string, string>>(KEY, {}));

/** El nombre guardado de `id`, si hay. */
export function knownMachineName(id: string): string | null {
  const name = read()[id];
  return typeof name === "string" && name.trim() && name !== id ? name : null;
}

/** El inventario de la flota recién instalado: sus nombres son los conocidos. */
export function rememberMachineNames(rows: readonly { id: string; name?: string | null }[]) {
  const next: Record<string, string> = {};
  for (const row of rows) if (row.name?.trim() && row.name !== row.id) next[row.id] = row.name.trim();
  const now = read();
  const same = Object.keys(next).length === Object.keys(now).length && Object.entries(next).every(([id, name]) => now[id] === name);
  if (same) return;
  cache = next;
  escribirPref(KEY, next);
}

/** Al cerrar sesión: no queda nada de la cuenta en esta máquina. */
export function forgetMachineNames() {
  cache = {};
  borrarPref(KEY);
}
