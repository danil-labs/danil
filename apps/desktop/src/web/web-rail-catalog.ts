import { createSignal } from "solid-js";
import type { WebSessionCommands } from "./web-session-contexts.ts";

type Row = { id: string; name: string };
type Reply = { status: number; body?: unknown };

/**
 * La fuente del riel web (plan web varias sesiones § 3): los workspaces del catálogo de cada
 * contexto (`GET /v1/identity/sessions/catalog`). La máquina sirve el contenido, pero nunca
 * agrega ni quita cuadros: una máquina apagada deja su cuadro en su sitio.
 * `null` para un contexto es «no se pudo comprobar»: el riel conserva lo que mostraba.
 */
export function webRailCatalog(sessions: Pick<WebSessionCommands, "handle">) {
  const [lists, setLists] = createSignal<ReadonlyMap<string, readonly Row[] | null>>(new Map());
  let running: Promise<void> | null = null;
  async function read() {
    const reply = (await sessions.handle("danil_edge_fetch", { method: "GET", path: "/v1/identity/sessions/catalog" })) as Reply;
    if (reply.status !== 200) return;
    const items = (reply.body as { items?: unknown } | null)?.items;
    const next = new Map<string, readonly Row[] | null>();
    for (const family of Array.isArray(items) ? items : []) {
      for (const raw of Array.isArray(family?.contexts) ? family.contexts : []) {
        const context = typeof raw?.context_id === "string" ? raw.context_id : null;
        if (!context) continue;
        const rows = Array.isArray(raw.workspaces)
          ? raw.workspaces.flatMap((w: { engine_workspace_id?: unknown; name?: unknown }) => (typeof w?.engine_workspace_id === "string" && w.engine_workspace_id ? [{ id: w.engine_workspace_id, name: typeof w.name === "string" ? w.name : w.engine_workspace_id }] : []))
          : null;
        // Un vacío confirmado es una lista vacía; uno sin comprobar conserva la lectura anterior.
        next.set(context, rows ?? (raw.catalog_state === "empty" ? [] : lists().get(context) ?? null));
      }
    }
    setLists(next);
  }
  return {
    workspaces: (context: string) => lists().get(context) ?? null,
    refresh: () => (running ??= read().catch(() => {}).finally(() => { running = null; })),
  };
}
