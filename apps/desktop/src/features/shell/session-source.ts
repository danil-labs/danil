/**
 * La única interfaz de la sesión de la persona para la ventana. Sin `person_session_v1` la da
 * `desk_auth`; con él, la da el motor y la del llavero de Desk no cuenta.
 */
export type PersonSession = { state?: string; email?: string | null; sessions?: { email?: string | null }[]; user_code?: string | null } | null;
export type SessionSource = {
  origin: "desk" | "engine";
  read: () => Promise<PersonSession>;
  /** El login de siempre: el navegador con PKCE. */
  signIn: () => Promise<void>;
  changes: (on: (session: PersonSession) => void) => Promise<() => void>;
};
type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
type Listen = <T>(event: string, on: (e: { payload: T }) => void) => Promise<() => void>;

export const ENGINE_SESSION_FEATURE = "person_session_v1";

export function deskSessionSource(invoke: Invoke, listen?: Listen): SessionSource {
  return {
    origin: "desk",
    read: () => invoke<PersonSession>("danil_session_status").then((s) => s ?? null),
    signIn: async () => { await invoke("danil_sign_in"); },
    changes: (on) => listen ? listen<PersonSession>("danil-connect", (e) => on(e.payload ?? null)) : Promise.resolve(() => {}),
  };
}

let engineSource: SessionSource | null = null;
/** Un origen propio del motor en el front, si algún día no pasa por `desk_auth`. */
export const registerEngineSessionSource = (source: SessionSource | null) => { engineSource = source; };

/**
 * Con `person_session_v1`, `desk_auth` es el adaptador del motor (`engine_session.rs`): los mismos
 * comandos leen y abren la sesión del motor, y la del llavero de Desk ya no cuenta.
 */
export async function personSessionSource(invoke: Invoke, features: () => Promise<readonly string[] | null>, listen?: Listen): Promise<SessionSource> {
  const announced = await features().catch(() => null);
  if (!announced?.includes(ENGINE_SESSION_FEATURE)) return deskSessionSource(invoke, listen);
  return engineSource ?? { ...deskSessionSource(invoke, listen), origin: "engine" };
}
