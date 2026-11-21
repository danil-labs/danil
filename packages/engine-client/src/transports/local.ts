import type { ConnectionStatus, StatefulTransport } from "./types.ts";

/** Lo que el host (packages/host) inyecta para hablar con el motor local en Desk. */
export interface LocalHost {
  invoke<T = unknown>(command: string, args?: unknown): Promise<T>;
  /** Suscribe a un evento del motor; devuelve la baja (puede resolverse async). */
  listen(event: string, cb: (payload: unknown) => void): (() => void) | Promise<() => void>;
  /** true si `machineId` es esta computadora (su motor responde por IPC, sin relay). */
  isLocal?(machineId: string): boolean;
}

export function createLocalTransport(host: LocalHost): StatefulTransport {
  const subs = new Set<(s: ConnectionStatus) => void>();
  let status: ConnectionStatus = "connected";
  const set = (s: ConnectionStatus) => {
    if (s === status) return;
    status = s;
    for (const cb of [...subs]) cb(s);
  };
  return {
    status: () => status,
    onStatus(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    call: (name, params) => host.invoke(name, params ?? undefined),
    subscribe(event, cb) {
      let off: (() => void) | undefined;
      let cancelled = false;
      void Promise.resolve(host.listen(event, cb)).then((u) => {
        if (cancelled) u();
        else off = u;
      });
      return () => {
        cancelled = true;
        off?.();
      };
    },
    close() {
      set("error");
      subs.clear();
    },
  };
}
