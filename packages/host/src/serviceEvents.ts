/**
 * Los oyentes de los eventos del motor. Con el stream empujado los eventos no
 * llegan como eventos de Tauri sino en lotes por la respuesta de `service_poll`;
 * `deliver` los reparte, en orden, a los mismos manejadores que registró `listen`.
 */
import { listen as tauriListen, type EventCallback } from "@tauri-apps/api/event";

const handlers = new Map<string, Set<EventCallback<unknown>>>();

export type JournalEvent = { name: string; payload: unknown };

export const listen: typeof tauriListen = async (event, handler, options) => {
  const own = handler as EventCallback<unknown>;
  const set = handlers.get(event) ?? new Set();
  handlers.set(event, set.add(own));
  const forget = () => {
    set.delete(own);
    if (set.size === 0 && handlers.get(event) === set) handlers.delete(event);
  };
  try {
    const unlisten = await tauriListen(event, handler, options);
    return () => {
      forget();
      unlisten();
    };
  } catch (error) {
    forget();
    throw error;
  }
};

/** Un manejador que lanza no corta a los demás, como con los eventos de Tauri. */
export function deliver(events: readonly JournalEvent[]): void {
  for (const { name, payload } of events) {
    const set = handlers.get(name);
    if (!set) continue;
    for (const handler of [...set]) {
      try {
        handler({ event: name, id: 0, payload });
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }
}
