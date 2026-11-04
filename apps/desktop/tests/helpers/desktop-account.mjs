/** Lo común de `desktop-account-*.test.mjs`: el escritorio con la cuenta de Danil sobre un IPC y un relay simulados. */
import assert from "node:assert/strict";
import { engine, fleet } from "./fake-relay.mjs";
import { boot, sleep } from "./jsdom-app.mjs";

export const SAME = { id: "w", name: "W", context_root: null, provider: "github", remote: "danil/panel" };
export const row = (id, title) => ({ id, title, last_message: "", provider: "codex", model: "gpt-5.6", refs: [], created_at: 0, updated_at: 0, turns: 0, parent: null, esperando: false });
export const project = (name) => ({ id: "p1", name, working_directory: "/lab/p1", kind: "git", portfolio: null, sources: [] });

/** The same workspace and project on every machine; task ids collide and only the namespace of the others keeps them apart. */
export function remote(name, task, extra = {}) {
  return {
    ...engine,
    list_workspaces: { workspaces: [SAME], active: "w" },
    workspaces_startup: { workspaces: [SAME], active: "w" },
    list_projects: [project(name)],
    list_live_sessions: ({ project: p }) => (p === "p1" || p === "" ? [row("t1", task)] : []),
    send_message: () => "t1",
    create_project: ({ name: n }) => ({ id: "p9", name: n, working_directory: "/lab/p9", kind: "folder", sources: [] }),
    ...extra,
  };
}

/** The window's own engine, through the simulated IPC. */
export function local(calls, extra = {}) {
  const answer = (command, value) => (args) => {
    calls.push({ command, args });
    return typeof value === "function" ? value(args) : value;
  };
  const table = {
    window_ready: null,
    window_vitals: null,
    setup_required: false,
    danil_sessions: () => Promise.reject(Object.assign(new Error("command"), { detail: "command" })),
    list_providers: [{ id: "codex", label: "Codex", available: true, driver: true }],
    list_workspaces: { workspaces: [SAME], active: "w" },
    workspaces_startup: { workspaces: [SAME], active: "w" },
    list_projects: [project("Local")],
    list_portfolios: [],
    list_sources: [],
    list_agents: { agents: [], rechazados: [] },
    list_agent_status: [],
    list_mentions: { fuentes: [], archivos: [] },
    list_models: engine.list_models,
    list_surfaces: engine.list_surfaces,
    session_folder: "/tmp",
    list_task_trees: [],
    preview_tree_files: { paths: [], folders: [], truncated: false },
    task_history: engine.task_history,
    list_live_turns: [],
    list_active_turns: [],
    list_live_sessions: ({ project: p }) => (p === "p1" || p === "" ? [row("t1", "Tarea local")] : []),
    load_queue: [],
    save_queue: null,
    session_usage: null,
    list_session_git: {},
    turn_authors: { person: null, agent: null },
    service_filter: null,
    service_poll: () => sleep(40).then(() => ({ cursor: 1, gap: false, replay: false, runtime: "lab", reset: false })),
    machine_list: [{ id: "local", local: true, active: true, on: true, hosts: true }],
    set_active_workspace: null,
    send_message: () => "t1",
    create_project: ({ name }) => ({ id: "p8", name, working_directory: "/lab/p8", kind: "folder", sources: [] }),
    ...extra,
  };
  return Object.fromEntries(Object.entries(table).map(([k, v]) => [k, answer(k, v)]));
}

export const SIGNED_IN = { state: "connected", computer_id: "cmp_home", name: "Mi Mac", online: true };
export const TOKEN = () => ({ token: "client-tok", expires_at: Date.now() + 600_000, endpoint: "https://relay.test", computer_id: "cmp_home" });
export const HOME = { computer_id: "cmp_home", name: "Mi Mac", state: "online", provider: "self", kind: "physical" };
export const VM = { computer_id: "cmp_vm", name: "Danil VM", state: "stopped", provider: "aws-ec2" };
export const MAC = { computer_id: "cmp_mac", name: "Mac de Ana", state: "offline", provider: "self", kind: "physical" };

export async function open(name, { status = SIGNED_IN, token = TOKEN, computers = [HOME, VM, MAC], relays = {}, extra = {}, registry = null, onRename = null, storage = {}, shared = null, sharedStart = null } = {}) {
  const f = fleet(relays);
  const calls = [];
  const listed = [];
  const registered = [];
  const renamed = [];
  const responses = local(calls, {
    danil_connect_status: status,
    ...(token ? { account_relay_token: token } : {}),
    ...extra,
  });
  const app = await boot("listo", name, responses, undefined, storage, {
    beforeImport: () => {
      globalThis.WebSocket = f.Socket;
      const previous = globalThis.fetch;
      const fake = (url, init) => {
        if (String(url) === "https://relay.test/v1/workspaces") {
          registered.push(init?.headers?.authorization);
          return Promise.resolve(registry ? Response.json({ workspaces: registry }) : new Response("{}", { status: 404 }));
        }
        if (String(url) === "https://relay.test/v1/shared-computers" && (init?.method ?? "GET") === "GET") {
          return Promise.resolve(Response.json({ computers: shared ?? [] }));
        }
        const starting = /^https:\/\/relay\.test\/v1\/shared-computers\/([^/]+)\/start$/.exec(String(url));
        if (starting && init?.method === "POST") {
          const id = decodeURIComponent(starting[1]);
          const row = (shared ?? []).find((item) => item.computer_id === id);
          if (!row) return Promise.resolve(Response.json({ error: "not_found" }, { status: 404 }));
          if (sharedStart) return Promise.resolve(Response.json(sharedStart.body, { status: sharedStart.status }));
          row.power = "starting";
          return Promise.resolve(Response.json({ ...row }));
        }
        if (String(url).startsWith("https://relay.test/v1/computers/") && init?.method === "PATCH") {
          const id = decodeURIComponent(String(url).split("/").pop());
          const { name: given } = JSON.parse(init.body);
          renamed.push({ id, name: given, authorization: init.headers?.authorization, type: init.headers?.["content-type"] });
          const refused = onRename?.(id, given);
          if (refused) return Promise.resolve(Response.json({ error: { code: refused.code } }, { status: refused.status }));
          const at = computers.findIndex((c) => c.computer_id === id);
          if (at < 0) return Promise.resolve(Response.json({ error: { code: "not_found" } }, { status: 404 }));
          computers[at] = { ...computers[at], name: given.trim() };
          return Promise.resolve(Response.json({ computer_id: id, name: given.trim() }));
        }
        if (String(url).startsWith("https://relay.test/v1/computers")) {
          listed.push(init?.headers?.authorization);
          return Promise.resolve(new Response(JSON.stringify({ computers }), { status: 200, headers: { "content-type": "application/json" } }));
        }
        return previous(url, init);
      };
      fake.__jsdomApp = true;
      globalThis.fetch = fake;
    },
  });
  await sleep(2000);
  const invoke = (command, args, options) => app.w.__TAURI_INTERNALS__.invoke(command, args, options);
  const relayCalls = (id, command) => (f.relays[id]?.calls ?? []).filter((c) => c.command === command);
  const native = (command) => calls.filter((c) => c.command === command);
  return { app, f, invoke, relayCalls, native, listed, registered, renamed, doc: app.w.document, text: () => app.w.document.body.textContent ?? "" };
}

export const until = async (check, ms = 4000) => {
  for (let waited = 0; waited < ms; waited += 50) {
    if (check()) return true;
    await sleep(50);
  }
  return false;
};

export async function write(app, message) {
  const field = app.w.document.querySelector("textarea");
  field.value = message;
  field.dispatchEvent(new app.w.Event("input", { bubbles: true }));
  field.closest("form").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(50);
}

export async function openTask(app, id) {
  const row = app.w.document.querySelector(`[data-sesion="${id}"]`);
  assert.ok(row, `no row for ${id}`);
  row.click();
  await sleep(400);
}

/** A new task in folder P1, from the composer. */
/**
 * The «+» of this computer's «Local» group. Since f86188a a folder with tasks on
 * several machines is one group per machine («Local · Esta computadora»); this
 * one is `data-folder-machine=""`, or the only group when the folder is not split.
 */
export function localNewTask(doc) {
  const group = doc.querySelector('[data-folder-machine=""]') ?? doc.querySelector("[data-folder-group]:not([data-folder-machine])");
  return group?.querySelector('[aria-label^="Nueva tarea en Local"]');
}

export async function newTask(app) {
  const doc = app.w.document;
  [...doc.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith("Nueva tarea"))?.click();
  await sleep(300);
  doc.querySelector('button[aria-label="Proyecto"]').click();
  // Inside the picker: the sidebar has its own «P1» button too (the folder's group).
  const option = () => [...doc.querySelectorAll("[role=dialog] button")].find((b) => b.textContent?.trim().startsWith("Local") || b.textContent?.trim().startsWith("P1"));
  assert.ok(await until(() => option()), "the folder picker opens");
  option().click();
  await sleep(300);
}

export const reread = async (app) => {
  app.w.dispatchEvent(new app.w.CustomEvent("harness:tasks-changed"));
  await sleep(700);
};

export const SESSION_A = { account: "u_alberto", email: "alberto@danil.ai", name: "Alberto", photo: null, computer_id: "cmp_home", computer_name: "Mi Mac", default: true, workspaces: [], status: "connected", online: true };
export const SESSION_B = { ...SESSION_A, account: "u_fdb", email: "alberto@dondebanco.org", computer_id: "cmp_home_fdb", default: false, workspaces: ["w"] };
