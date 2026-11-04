/** Lo que comparten las pruebas `web-machines*`: dos máquinas, sus tablas y abrir el panel. */
import { engine, fleet } from "./fake-relay.mjs";
import { boot, sleep } from "./jsdom-app.mjs";

export const SAME = { id: "w", name: "W", context_root: null, provider: "github", remote: "danil/panel" };
export const row = (id, title) => ({ id, title, last_message: "", provider: "codex", model: "gpt-5.6", refs: [], updated_at: 0, turns: 0, parent: null, esperando: false });
export const account = (id, identity, label = "Cuenta 1") => ({ id, label, created_at: 0, identity, authenticated_at: 1 });
export const folder = (id, name, extra = {}) => ({ id, name, working_directory: `/lab/${id}`, kind: "git", portfolio: null, sources: [], ...extra });

/** The same workspace on both machines, each with its own project; task ids collide and only the namespace keeps them apart. */
export function table(project, task, extra = {}, id = "p1") {
  return {
    ...engine,
    list_workspaces: { workspaces: [SAME], active: "w" },
    workspaces_startup: { workspaces: [SAME], active: "w" },
    list_projects: [folder(id, project)],
    list_live_sessions: ({ project: p }) => (p === id ? [row("t1", task)] : []),
    send_message: () => "t1",
    create_project: ({ name }) => ({ id: "p9", name, working_directory: "/lab/p9", kind: "folder", sources: [] }),
    remove_account: true,
    ...extra,
  };
}

export async function until(check, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return true;
    await sleep(100);
  }
  return false;
}

export const VM = { computer_id: "cmp_vm", name: "Danil VM", state: "online", provider: "aws-ec2", os: "linux" };
export const MAC = { computer_id: "cmp_mac", name: "Mac de Ana", state: "online", provider: "self", kind: "physical", os: "macos" };

export const registry = (spaces) =>
  Object.entries(spaces).map(([id, computers]) => ({ id, name: id === "w" ? "W" : id, radiant_workspace_id: null, settings: null, settings_version: 1, created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z", projects: [], computers }));

/** The envelope of a call to a machine, as the window builds it from the task's row. */
export const on = (machine) => ({ headers: { "x-terminus-machine": machine } });

export async function open(name, computers, relays, workspaces, { shared = null, sharedStart = null } = {}) {
  const f = fleet(relays);
  const app = await boot("listo", name, {}, undefined, {}, {
    web: true,
    workspaces,
    beforeImport: (w) => {
      globalThis.WebSocket = f.Socket;
      if (shared) {
        const previous = globalThis.fetch;
        const fake = (url, init) => {
          const path = String(url?.url ?? url);
          if (path.endsWith("/v1/shared-computers") && (init?.method ?? "GET") === "GET") return Promise.resolve(Response.json({ computers: shared }));
          const start = /\/v1\/shared-computers\/([^/]+)\/start$/.exec(path);
          if (start && init?.method === "POST") {
            const id = decodeURIComponent(start[1]);
            const row = shared.find((item) => item.computer_id === id);
            if (!row) return Promise.resolve(Response.json({ error: "not_found" }, { status: 404 }));
            if (sharedStart) return Promise.resolve(Response.json(sharedStart.body, { status: sharedStart.status }));
            row.power = "starting";
            return Promise.resolve(Response.json({ ...row }));
          }
          return previous(url, init);
        };
        fake.__jsdomApp = true;
        globalThis.fetch = fake;
      }
      w.terminusWeb = { endpoint: "https://relay.test", computers, getToken: async () => "tok" };
    },
  });
  await sleep(2500);
  const invoke = (command, args, options) => app.w.__TAURI_INTERNALS__.invoke(command, args, options);
  const calls = (id, command) => f.relays[id].calls.filter((c) => c.command === command);
  return { app, f, invoke, calls, doc: app.w.document, text: () => app.w.document.body.textContent ?? "" };
}
