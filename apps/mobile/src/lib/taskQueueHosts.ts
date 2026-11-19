import type { Host } from "./hosts.ts";
import type { HostLookup, Resolver } from "./taskQueue.ts";

/** Cuánto debe faltar una máquina, de forma continua, antes de darla por fuera de la cuenta. */
export const GONE_AFTER_MS = 5_000;

export type FleetView = {
  hostOf(id: string): Host | undefined;
  /** El usuario con sesión; `""` sin sesión (laboratorio o demo con una máquina sin cuenta). */
  user: string;
  fleet: string;
  contextReady: boolean;
};

/**
 * Cómo decide la cola si una máquina ya no está. Una máquina falta (`gone`)
 * solo si hay sesión, la entrada es de esa cuenta, la flota ya cargó esa
 * cuenta y la máquina lleva faltando un rato seguido. Sin sesión, con la flota
 * cargándose, con otra cuenta o con el bridge (que depende del emparejamiento,
 * no de la flota) la entrada espera.
 */
export function createResolver(now: () => number = Date.now) {
  const missing = new Map<string, number>();
  return (view: FleetView): Resolver =>
    (id, owner): HostLookup => {
      const key = `${owner}:${id}`;
      // Primero el dueño: una máquina compartida entre cuentas no ejecuta lo que pidió otra. Lo pedido sin sesión (`""`)
      // solo corre sin sesión y con la máquina ya resuelta.
      if (owner === undefined || owner !== view.user) {
        missing.delete(key);
        return "pending";
      }
      const host = view.hostOf(id);
      if (host) {
        missing.delete(key);
        return host;
      }
      if (!view.user || id === "bridge" || !(view.fleet === "ok" && view.contextReady)) {
        missing.delete(key);
        return "pending";
      }
      const since = missing.get(key) ?? now();
      missing.set(key, since);
      return now() - since >= GONE_AFTER_MS ? "gone" : "pending";
    };
}
