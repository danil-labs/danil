import { barWorkspaceIds, type DirectoryEntry } from "@terminus/computers";
import { createResource, createRoot, createSignal } from "solid-js";
import { escribirPref, leerPref } from "../../lib/prefs";
import { capabilities } from "../../lib/platform";

/** El workspace que solo tiene agentes abierto desde el menú; `null` con uno de Terminus. */
export const [agentsWorkspace, setAgentsWorkspace] = createSignal<string | null>(null);

// Una sola lista para el menú y la barra. `capabilities()` no es reactivo: se crea al primer uso, ya con la plataforma puesta.
function createStore() {
  const [loaded, { refetch, mutate }] = createResource(
    () => capabilities().workspaceDirectory,
    (source) => source.list(),
  );
  // Con la sesión de la ventana recién abierta la lista se relee y la hoja del workspace se ofrece.
  const [signedIn, setSignedIn] = createSignal(0);
  capabilities().workspaceDirectory?.onSession?.((state) => {
    void refetch();
    if (state === "signed_in") setSignedIn((n) => n + 1);
  });
  return { loaded, refetch, mutate, signedIn };
}
let created: ReturnType<typeof createStore> | undefined;
const store = () => (created ??= createRoot(createStore));

/** `undefined` mientras carga, y sin directorio en el escritorio. */
export const directory = () => (store().loaded.error ? undefined : store().loaded());
export const reloadDirectory = () => void store().refetch();

const entries = (): readonly DirectoryEntry[] => directory()?.workspaces ?? [];

/** Lo que la barra deja ver; `null` si muestra todos. */
export const workspaceBar = (active: string | null) => barWorkspaceIds(entries(), active);

/** Fijar o quitar; la lista se relee si el plano de control lo rechaza. */
export async function togglePin(entry: DirectoryEntry): Promise<void> {
  const source = capabilities().workspaceDirectory;
  const current = directory();
  if (!source || !current || entry.support) return;
  const pinned = current.workspaces.filter((e) => e.pin !== null).sort((a, b) => (a.pin ?? 0) - (b.pin ?? 0)).map((e) => e.key);
  const keys = entry.pin === null ? [...pinned, entry.key] : pinned.filter((key) => key !== entry.key);
  store().mutate({
    ...current,
    workspaces: current.workspaces.map((e) => ({ ...e, pin: keys.includes(e.key) ? keys.indexOf(e.key) : null })),
  });
  await source.pin(keys).catch(() => undefined);
  reloadDirectory();
}

/**
 * La cuenta de Danil Agents que la persona administra y que todavía no tiene un
 * workspace de Terminus suyo. Solo la ofrece el menú si el workspace abierto es
 * suyo y está sin enlazar: el plano de control vuelve a decidirlo al enlazar.
 */
export function linkableAccounts(active: string | null): DirectoryEntry[] {
  const list = entries();
  const open = list.find((e) => e.workspace_id === active && e.owner && !e.support);
  if (!active || !open || open.danil_workspace_id !== null) return [];
  return list.filter(
    (e) => !e.support && e.workspace_id === null && e.danil_workspace_id !== null && (e.role === "owner" || e.role === "admin"),
  );
}

/** Enlaza el workspace abierto con la cuenta; devuelve el código del error o `null`. */
export async function linkActiveWorkspace(active: string, account: DirectoryEntry): Promise<string | null> {
  const source = capabilities().workspaceDirectory;
  if (!source || account.danil_workspace_id === null) return "link_failed";
  try {
    await source.link(active, account.danil_workspace_id);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "link_failed";
  } finally {
    reloadDirectory();
  }
}

/** La fila del workspace abierto si es de la persona y está sin enlazar; si no, `null`. */
export function unlinkedActive(active: string | null): DirectoryEntry | null {
  if (!active) return null;
  const open = entries().find((e) => e.workspace_id === active && e.owner && !e.support);
  return open && open.danil_workspace_id === null ? open : null;
}

/** Cuántas veces se abrió la sesión de la ventana desde que arrancó; la hoja lo observa. */
export const signedInCount = () => store().signedIn();

const DISMISSED = "danilWorkspaceStep.dismissed";
const DISMISSED_MAX = 50;

/** «Ahora no» para este workspace: la hoja no vuelve a salir con él. */
export function dismissDanilWorkspaceStep(workspace: string) {
  const list = leerPref<string[]>(DISMISSED, []).filter((w) => w !== workspace);
  escribirPref(DISMISSED, [...list, workspace].slice(-DISMISSED_MAX));
}

export const danilWorkspaceStepDismissed = (workspace: string) => leerPref<string[]>(DISMISSED, []).includes(workspace);
