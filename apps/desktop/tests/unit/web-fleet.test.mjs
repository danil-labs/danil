/**
 * The browser on the account's fleet with every machine off: the page opens
 * at once from the account registry and the relay's copy of each machine, no
 * «connecting» screen, the tasks of both machines in the list marked saved, and
 * nothing woken by opening. A machine of another contract does not take the
 * page down. The sidebar carries no strip with the state of each slice: that
 * lives in each task's machine chip and in «Ejecutar en». Mounts `dist-web/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { engine, fleet } from "../helpers/fake-relay.mjs";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const REGISTRY = [
  {
    id: "w1",
    name: "Producto",
    radiant_workspace_id: null,
    settings: { lengua: "es", lengua_de_salida: null, default_permission_mode: null, terminal_theme: null },
    settings_version: 1,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
    projects: [{ id: "p1", name: "Aplicación", remote_url: "https://github.com/ana/app", default_branch: "main", home_computer_id: "cmp_vm" }],
    computers: ["cmp_vm", "cmp_mac"],
  },
];
const WS = { workspaces: [{ id: "w1", name: "Producto", context_root: null }], active: "w1" };
const PROJECT = { id: "p1", name: "Aplicación", working_directory: "/lab/p1", kind: "git", portfolio: null, sources: [] };
const task = (id, title) => ({ id, title, last_message: "", provider: "codex", model: "gpt-5.6", refs: [], updated_at: 0, turns: 0, parent: null, esperando: false });
const VM = { computer_id: "cmp_vm", name: "Danil VM", state: "stopped", provider: "aws-ec2", workspaces: ["w1"] };
const MAC = { computer_id: "cmp_mac", name: "Mac de Ana", state: "offline", provider: "self", kind: "physical", workspaces: ["w1"] };
const SAVED = "2026-10-22T18:30:00Z";

function tables() {
  const of = (title) => ({ ...engine, list_workspaces: WS, workspaces_startup: WS, list_projects: [PROJECT], list_live_sessions: ({ project }) => (project === "p1" ? [task("t1", title)] : []) });
  return { vm: of("Tarea de la VM"), mac: of("Tarea de la Mac") };
}

test("with every machine off the page opens in under two seconds with the saved tasks of each", async () => {
  const { vm, mac } = tables();
  const f = fleet({ cmp_vm: { table: vm, state: "offline", cachedAt: SAVED }, cmp_mac: { table: mac, state: "offline", cachedAt: SAVED, notStartable: true } });
  const started = Date.now();
  const app = await boot("listo", "web-fleet-off", {}, undefined, {}, {
    web: true,
    workspaces: REGISTRY,
    beforeImport: (w) => {
      globalThis.WebSocket = f.Socket;
      w.terminusWeb = { endpoint: "https://relay.test", computers: [VM, MAC], getToken: async () => "tok" };
    },
  });
  const doc = app.w.document;
  const text = () => doc.body.textContent ?? "";
  while (Date.now() - started < 2_000 && !(text().includes("Tarea de la VM") && text().includes("Tarea de la Mac"))) await sleep(50);
  assert.ok(text().includes("Tarea de la VM") && text().includes("Tarea de la Mac"), `the tasks of both machines within 2 s (${Date.now() - started} ms)`);
  assert.ok(!/Conectando con tu computadora|Connecting to your computer/.test(text()), "no connecting screen");
  assert.equal(doc.querySelector("[data-managed-setup]"), null);
  assert.equal(doc.querySelector("[data-machine-slices]"), null, "no strip of slice states in the sidebar");
  assert.ok(!Object.values(f.relays).some((r) => r.calls.some((c) => c.command === "send_message")), "opening wakes nothing");
  assert.deepEqual(app.failures, []);
});

test("a machine of another contract does not take the page down: it opens with the other", async () => {
  const { vm, mac } = tables();
  const f = fleet({ cmp_vm: { table: vm }, cmp_mac: { table: mac, outdated: true } });
  const app = await boot("listo", "web-fleet-outdated", {}, undefined, {}, {
    web: true,
    workspaces: REGISTRY,
    beforeImport: (w) => {
      globalThis.WebSocket = f.Socket;
      w.terminusWeb = { endpoint: "https://relay.test", computers: [{ ...VM, state: "online" }, { ...MAC, state: "online" }], getToken: async () => "tok" };
    },
  });
  const doc = app.w.document;
  const text = () => doc.body.textContent ?? "";
  const started = Date.now();
  while (Date.now() - started < 5_000 && !text().includes("Tarea de la VM")) await sleep(50);
  assert.ok(text().includes("Tarea de la VM"), "the VM's tasks show");
  assert.equal(doc.querySelector("[data-machine-slices]"), null, "no strip of slice states in the sidebar");
  assert.deepEqual(app.failures, []);
});
