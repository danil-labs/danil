/**
 * Las sesiones de Danil de esta computadora como estado de Solid: las lee, sigue
 * `danil-sessions` y, con `workspace`, la cuenta de ese workspace. La comparten
 * Configuración, la sección del workspace y el pie de la barra lateral.
 * `sessions()` es `undefined` mientras lee y `null` con un motor anterior.
 */
import { createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import { invoke } from "../../lib/invoke";
import { listen } from "../../lib/serviceEvents";
import { failureCode } from "./danil-account";
import { machines } from "../machines/store";
import {
  addAccount,
  connectedSessions,
  type DanilSessionInfo,
  pendingSession,
  readSessions,
  readWorkspaceAccount,
  setDefaultAccount,
  signOutAccount,
  type WorkspaceAccount,
} from "./danil-sessions";

/**
 * `workspace`: de cuál leer la cuenta. `"active"` es el abierto, y se relee al
 * cambiar de workspace; sin la opción no se lee ninguna.
 */
export function createDanilAccounts(options: { workspace?: (() => string | null | undefined) | "active" } = {}) {
  const [sessions, setSessions] = createSignal<DanilSessionInfo[] | null | undefined>(undefined);
  const [loadFailed, setLoadFailed] = createSignal(false);
  const [workspaceOf, setWorkspaceOf] = createSignal<string | null | undefined>();
  const [loadingOf, setLoadingOf] = createSignal(true);
  const [of, setOf] = createSignal<WorkspaceAccount | null>(null);
  const [busy, setBusy] = createSignal(false);
  /** El código del último fallo; quien pinta lo traduce. */
  const [problem, setProblem] = createSignal<string | null>(null);
  const reading = options.workspace;
  let turn = 0;
  let previous: string | null | undefined;

  async function readOf() {
    if (!reading || sessions() === null) return;
    const mine = ++turn;
    const workspace = reading === "active" ? undefined : reading();
    if (previous !== workspace) setProblem(null);
    if (previous !== workspace || of() === null) {
      setLoadingOf(true);
      setOf(null);
    }
    previous = workspace;
    if (reading !== "active" && !workspace) {
      setWorkspaceOf(workspace);
      setLoadingOf(false);
      return;
    }
    try {
      const next = await readWorkspaceAccount(workspace);
      if (mine === turn) setOf(next);
    } catch (e) {
      if (mine !== turn) return;
      // Un workspace que esta computadora no tiene (el de una organización en su Nube IA) es de la sesión de la persona.
      const own = workspace && machines().find((m) => m.local)?.hosts === false ? connectedSessions(sessions())[0] : null;
      if (own) {
        setOf({ account: own.account, email: own.email, signed_in: true, linked: true });
      } else {
        setOf(null);
        setProblem(failureCode(e) ?? "failed");
      }
    } finally {
      if (mine === turn) {
        setWorkspaceOf(workspace);
        setLoadingOf(false);
      }
    }
  }

  async function reload() {
    setLoadFailed(false);
    try {
      setSessions(await readSessions());
      await readOf();
    } catch (e) {
      setSessions(undefined);
      setOf(null);
      setLoadFailed(true);
      setProblem(failureCode(e) ?? "failed");
    }
  }

  onMount(() => {
    void reload();
    const changes = listen<DanilSessionInfo[]>("danil-sessions", (e) => {
      if (Array.isArray(e.payload)) setSessions(e.payload);
      void readOf();
    });
    // El primer inicio de sesión llega también por aquí; un motor anterior solo manda este.
    const connect = listen("danil-connect", () => void reload());
    const moved = () => void readOf();
    if (reading === "active") window.addEventListener("harness:workspace", moved);
    onCleanup(() => {
      void changes.then((off) => off());
      void connect.then((off) => off());
      window.removeEventListener("harness:workspace", moved);
    });
  });

  if (reading && reading !== "active") createEffect(on(reading, () => void readOf(), { defer: true }));

  async function run<T>(action: () => Promise<T>, after?: (value: T) => void) {
    setBusy(true);
    setProblem(null);
    try {
      const value = await action();
      after?.(value);
      return value;
    } catch (e) {
      setProblem(failureCode(e) ?? "failed");
      return null;
    } finally {
      setBusy(false);
    }
  }

  return {
    sessions,
    loadingOf,
    workspaceOf,
    loadFailed,
    connected: () => connectedSessions(sessions()),
    pending: () => pendingSession(sessions()),
    of,
    setOf,
    busy,
    problem,
    setProblem,
    reload,
    add: () => run(() => addAccount(), () => void reload()),
    makeDefault: (account: string) => run(() => setDefaultAccount(account), (list) => Array.isArray(list) && setSessions(list)),
    signOut: (account: string) => run(() => signOutAccount(account), () => void reload()),
    reopen: () => {
      const url = pendingSession(sessions())?.verification_uri_complete;
      if (url) void invoke("open_external", { target: url }).catch(() => {});
    },
  };
}

export type DanilAccounts = ReturnType<typeof createDanilAccounts>;
