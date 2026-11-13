/**
 * La sesión del teléfono en la web, por el borde. Solo un 401 de `identity/me` es «sin sesión»:
 * cualquier otro fallo es «identity no contesta», se reintenta solo y nunca abre otro login.
 * Salir solo cuenta cuando el borde lo confirma (o contesta 401). Sin React: se prueba en Node.
 */
import { EdgeError, type EdgePerson } from "@terminus/computers";

export type EdgeSessionState =
  | { kind: "loading" }
  | { kind: "signed_in"; person: EdgePerson }
  | { kind: "signed_out" }
  /** Identity no contestó y no hay persona confirmada: se reintenta con espera creciente. */
  | { kind: "unavailable" };

type Identity = { me(): Promise<EdgePerson>; logout(): Promise<void> };
type Options = { schedule?: (run: () => void, ms: number) => () => void; first?: number; max?: number };

const FIRST_MS = 2_000;
const MAX_MS = 60_000;
const unauthorized = (error: unknown) => error instanceof EdgeError && error.status === 401;
const defaultSchedule = (run: () => void, ms: number) => {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
};

export function edgeSession(identity: Identity, options: Options = {}) {
  const schedule = options.schedule ?? defaultSchedule;
  const first = options.first ?? FIRST_MS;
  let state: EdgeSessionState = { kind: "loading" };
  let wait = first;
  let cancel: (() => void) | null = null;
  let stopped = false;
  const listeners = new Set<() => void>();
  let asking: Promise<boolean> | null = null;
  const set = (next: EdgeSessionState) => {
    if (next.kind === state.kind && next.kind !== "signed_in") return;
    state = next;
    for (const listener of listeners) listener();
  };
  const signedIn = (person: EdgePerson) => {
    const before = state;
    // La misma persona conserva su objeto: no se repintan las pantallas por una relectura.
    if (before.kind !== "signed_in" || before.person.id !== person.id) set({ kind: "signed_in", person });
  };

  async function load(): Promise<void> {
    cancel?.();
    cancel = null;
    try {
      signedIn(await identity.me());
      wait = first;
    } catch (error) {
      if (stopped) return;
      if (unauthorized(error)) {
        wait = first;
        set({ kind: "signed_out" });
        return;
      }
      if (state.kind !== "signed_in") set({ kind: "unavailable" });
      const delay = wait;
      wait = Math.min(wait * 2, options.max ?? MAX_MS);
      cancel = schedule(() => void load(), delay);
    }
  }

  return {
    state: () => state,
    load,
    /** Tras un 401 de otra llamada: `false` si la sesión ya no existe; una caída la conserva. */
    recheck(): Promise<boolean> {
      // Un solo vuelo: varios rechazos a la vez son una sola pregunta.
      asking ??= (async () => {
        try {
          signedIn(await identity.me());
          return true;
        } catch (error) {
          if (!unauthorized(error)) return true;
          set({ kind: "signed_out" });
          return false;
        } finally {
          asking = null;
        }
      })();
      return asking;
    },
    /** `true` si el borde cerró la sesión; `false` si no lo confirmó y la persona sigue dentro. */
    async signOut(): Promise<boolean> {
      try {
        await identity.logout();
      } catch (error) {
        if (!unauthorized(error)) return false;
      }
      cancel?.();
      cancel = null;
      set({ kind: "signed_out" });
      return true;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    stop() {
      stopped = true;
      cancel?.();
      cancel = null;
    },
  };
}

export type EdgeSession = ReturnType<typeof edgeSession>;
