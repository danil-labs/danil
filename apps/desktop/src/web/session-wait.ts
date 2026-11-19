import { PlatformSessionError } from "./platform-session.ts";
import { sessionStorageScope } from "./session-storage.ts";

export { clearWebCaches } from "./session-storage.ts";

type Store = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;

/** «Cerrar sesión» durante un reintento: cancela lo programado y, mientras sale, lo que llegue tarde no monta ni reprograma. */
/** Un 401 al salir también deja la sesión cerrada; cualquier otro fallo la conserva para reintentar. */
export function sessionExit(steps: { closed: () => boolean; cancel: () => void; logout: () => Promise<void>; signedOut: () => void; unavailable: () => void }) {
  let leaving = false;
  return {
    leaving: () => leaving,
    async leave() {
      if (leaving || steps.closed()) return;
      leaving = true;
      steps.cancel();
      try {
        await steps.logout();
      } catch (cause) {
        leaving = false;
        if (cause instanceof PlatformSessionError && cause.status === 401) steps.signedOut();
        else steps.unavailable();
        return;
      }
      leaving = false;
      steps.signedOut();
    },
  };
}

/** Una cuenta nueva monta sin workspace; la ventana sondea y avisa hasta que la plataforma tiene uno. */
export function awaitingWorkspace(person: { workspace: string | null } | undefined, listsWorkspaces: boolean, listed: number) {
  return person !== undefined && (person.workspace === null || (listsWorkspaces && listed === 0));
}

/** La caché local de la persona; si el workspace llega sin recargar, lo que se lee y guarda pasa a él. */
export function workspaceCache(store: Store, person: string, workspace: string) {
  let scope = sessionStorageScope(store, person, workspace);
  return {
    storage: {
      getItem: (key: string) => scope.storage.getItem(key),
      setItem: (key: string, value: string) => scope.storage.setItem(key, value),
      removeItem: (key: string) => scope.storage.removeItem(key),
    },
    clear: () => scope.clear(),
    rescope(next: string) {
      scope = sessionStorageScope(store, person, next);
    },
  };
}

/** La lista vacía o aún sin contexto (403/404/503) no impide montar; un 401 sí sale. */
export async function readWorkspaces<T>(read: () => Promise<T>, fallback: T, failed: (cause: unknown) => void): Promise<T> {
  try {
    return await read();
  } catch (cause) {
    if (cause instanceof PlatformSessionError && cause.status === 401) throw cause;
    failed(cause);
    return fallback;
  }
}

/** Lo que pide esperar el servidor (`Retry-After`), sin acortar la espera que ya hay. */
export function retryWait(cause: unknown, wait: number) {
  return cause instanceof PlatformSessionError && cause.retryAfter ? Math.max(wait, Number(cause.retryAfter) * 1000 || wait) : wait;
}
