import { listen } from "../../../../apps/desktop/src/lib/serviceEvents";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { invoke } from "../../../engine-client/src/client.ts";
import { asFailure, type Failure } from "../../../ui/src/Failure";

/** Espeja `dialects::claude::mcp_sin_sesion`. */
type PendingServer = { name: string; source: string };
/** El evento `mcp_auth` de una tarea. */
type PendingSignIn = { provider: string; servers: PendingServer[] };
/** Lo que emite `mcp::lanzar_login` al terminar; los demás `mcp` no traen nada. */
type LoginEnded = { provider: string; server: string; ok: boolean } | null;

// Por sesión y fuera del componente: el evento llega al arrancar el turno,
// se esté mirando esa tarea o no. Una lista vacía quita la señal.
const [pendingBySession, setPendingBySession] = createSignal<Record<string, PendingSignIn>>({});
// La tarea a la vista: la fija `McpSignInNotice` desde App, y la lee el menú
// de Conexiones del riel, que no sabe de sesiones.
const [activeSession, setActiveSession] = createSignal<string | null>(null);
const [inProgress, setInProgress] = createSignal<Set<string>>(new Set());
const [finished, setFinished] = createSignal<Set<string>>(new Set());
const [loginUrl, setLoginUrl] = createSignal<string | null>(null);
const [failure, setFailure] = createSignal<Failure | null>(null);
// Sin tope, un navegador cerrado sin autorizar deja el renglón bloqueado: `mcp` no llega.
const timers = new Map<string, number>();

export function noteMcpSignIn(session: string, text: string) {
  let parsed: PendingSignIn;
  try {
    parsed = JSON.parse(text) as PendingSignIn;
  } catch {
    return;
  }
  setPendingBySession((all) => ({ ...all, [session]: parsed }));
}

// La sesión queda en la cuenta, no en la tarea: el servidor deja de faltar en
// todas las tareas de ese agente.
function forgetSignedIn(agent: string, server: string) {
  setPendingBySession((all) =>
    Object.fromEntries(
      Object.entries(all).map(([session, p]) => [
        session,
        p.provider === agent ? { ...p, servers: p.servers.filter((s) => s.name !== server) } : p,
      ]),
    ),
  );
}

const current = () => {
  const s = activeSession();
  return s ? pendingBySession()[s] : undefined;
};
const loginKey = (name: string) => `${activeSession() ?? ""}:${name}`;

/** Los servidores de la tarea a la vista que piden sesión. */
export const mcpPendingSignIn = () => current()?.servers ?? [];
export const mcpSignInState = (name: string): "idle" | "waiting" | "retry" =>
  inProgress().has(loginKey(name)) ? "waiting" : finished().has(loginKey(name)) ? "retry" : "idle";
export const mcpLoginUrl = loginUrl;
export const mcpSignInFailure = failure;

function stopWaiting(key: string) {
  const timer = timers.get(key);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(key);
  }
  setInProgress((s) => {
    const n = new Set(s);
    n.delete(key);
    return n;
  });
}

/**
 * El turno no es interactivo y el agente no puede abrir el OAuth; lo corre
 * `mcp_login` con el CLI y la cuenta de la tarea, sin que ningún token pase
 * por aquí.
 */
export async function mcpSignIn(name: string) {
  const agent = current()?.provider;
  if (!agent) return;
  const key = loginKey(name);
  if (inProgress().has(key)) return;
  setFailure(null);
  setLoginUrl(null);
  setInProgress((s) => new Set(s).add(key));
  timers.set(key, window.setTimeout(() => stopWaiting(key), 120_000));
  try {
    await invoke("mcp_login", { provider: agent, id: name });
  } catch (e) {
    setFailure(asFailure(e));
    stopWaiting(key);
  }
}

/**
 * Sin interfaz: ya no hay aviso flotante. Fija la tarea a la vista y escucha
 * el login; la señal y el botón viven en el menú de Conexiones del riel.
 */
export default function McpSignInNotice(props: { session: string | null }) {
  onMount(() => {
    // Nombres literales: `scripts/guards/bridge.mjs` solo lee esos.
    const url = listen<string>("mcp-login", (e) => setLoginUrl(e.payload));
    const end = listen<LoginEnded>("mcp", (e) => {
      if (e.payload?.ok) forgetSignedIn(e.payload.provider, e.payload.server);
      const done = Array.from(inProgress());
      setFinished((s) => new Set([...s, ...done]));
      for (const key of done) stopWaiting(key);
      setLoginUrl(null);
    });
    onCleanup(() => {
      void url.then((f) => f());
      void end.then((f) => f());
      for (const timer of timers.values()) clearTimeout(timer);
    });
  });
  createEffect(() => setActiveSession(props.session));
  return null;
}
