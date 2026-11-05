/**
 * A workspace is the account's, not a machine's: with the managed VM asleep
 * (and no copy at the relay) and the only machine on without workspaces, the
 * browser lists the account's workspaces from `GET /v1/workspaces` instead of
 * the «create your workspace» onboarding, shows their projects from the
 * registry, and a new task goes to the VM, which wakes. Mounts `dist-web/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { engine, fleet } from "../helpers/fake-relay.mjs";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const SUPABASE = "https://supabase.test";
const API = "https://machines.danil.ai/v1/computers";
const session = JSON.stringify({
  access_token: "stored",
  refresh_token: "r",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "u1", aud: "authenticated", role: "authenticated", email: "persona@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
});

const REGISTRY = [
  {
    id: "w1",
    name: "Producto",
    radiant_workspace_id: null,
    settings: { lengua: null, lengua_de_salida: null, default_permission_mode: null, terminal_theme: null },
    settings_version: 1,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
    projects: [{ id: "p1", name: "Aplicación", remote_url: "https://github.com/ana/app", default_branch: "main", home_computer_id: "cmp_vm" }],
    computers: ["cmp_vm"],
  },
];
const VM = { computer_id: "cmp_vm", name: "Danil VM", state: "stopped", provider: "aws-ec2", workspaces: ["w1"] };
const MAC = { computer_id: "cmp_mac", name: "Mac de Ana", state: "online", provider: "self", kind: "physical", workspaces: [] };

/** The VM has the workspace and its project; the Mac, on, has none. */
function machines() {
  const vm = {
    ...engine,
    list_workspaces: { workspaces: [{ id: "w1", name: "Producto", context_root: null }], active: "w1" },
    workspaces_startup: { workspaces: [{ id: "w1", name: "Producto", context_root: null }], active: "w1" },
    list_projects: [{ id: "p1", name: "Aplicación", working_directory: "/lab/p1", kind: "git", portfolio: null, sources: [] }],
    send_message: () => "t9",
  };
  const empty = { workspaces: [], active: null };
  const mac = { ...engine, list_workspaces: empty, workspaces_startup: empty, list_projects: [], list_live_sessions: [] };
  return fleet({ cmp_vm: { table: vm, state: "offline" }, cmp_mac: { table: mac } });
}

test("the account's workspaces show with their machines asleep, not the create-workspace onboarding", async () => {
  const f = machines();
  const app = await boot("listo", "web-account-workspaces", {}, undefined, {}, {
    web: true,
    workspaces: REGISTRY,
    beforeImport: (w) => {
      globalThis.WebSocket = f.Socket;
      w.terminusWeb = { endpoint: "https://relay.test", computers: [VM, MAC], getToken: async () => "tok" };
    },
  });
  const doc = app.w.document;
  const text = () => doc.body.textContent ?? "";
  const invoke = (command, args, options) => app.w.__TAURI_INTERNALS__.invoke(command, args, options);
  const calls = (id, command) => f.relays[id].calls.filter((c) => c.command === command);
  await sleep(3000);

  assert.equal(doc.querySelector("[data-web-onboarding]"), null, "no onboarding");
  assert.ok(!text().includes("Crea tu espacio"), "no create-workspace step");
  assert.equal(calls("cmp_mac", "add_workspace").length, 0);
  const listed = await invoke("list_workspaces");
  assert.deepEqual(listed.workspaces.map((w) => [w.id, w.name, w.machines]), [["w1", "Producto", ["cmp_vm"]]], "the registry's workspace, on the VM");
  assert.equal(listed.active, "w1", "and it is the open one");
  // The workspace column names it by its tile: the monogram shows, the name is the label.
  const tile = doc.querySelector('[data-workspace-tile="w1"]');
  assert.equal(tile?.getAttribute("aria-current"), "true", "the panel opens on it");
  assert.equal(tile.getAttribute("aria-label"), "Producto");
  // Grouped by folder (the default), an empty project is its own group with «Sin tareas todavía».
  assert.ok(doc.querySelector('[data-sidebar-group="p1"] [data-folder-empty]'), "with an empty task list, not an error");
  const projects = await invoke("list_projects");
  assert.deepEqual(projects.map((p) => [p.id, p.machines, p.remote_url]), [["p1", ["cmp_vm"], "https://github.com/ana/app"]], "its project, from the registry");
  // Nadie contestó y no hay nada guardado: se dice por qué, nunca una lista vacía que no es cierta.
  await assert.rejects(invoke("list_live_sessions", { project: "p1", open: [] }), (e) => ["machine_starting", "start_failed"].includes(e.detail) && e.what.includes("Danil VM") && !e.what.includes("Verifica que Danil esté abierto"), "the off VM is being started, said by name, never as a closed Danil");
  assert.ok(!f.relays.cmp_vm.calls.some((c) => c.command === "send_message"), "reading wakes nothing");

  const id = await invoke("send_message", { project: "p1", session: null, prompt: "hola", provider: "codex" });
  assert.equal(id, "cmp_vm~t9", "the new task is the VM's");
  assert.equal(calls("cmp_vm", "send_message").length, 1, "it goes to the VM, which wakes");
  assert.equal(calls("cmp_mac", "send_message").length, 0);
  assert.deepEqual(app.failures, []);
});

test("with no linked workspace on any computer the gate still opens when the account has one", async () => {
  const f = machines();
  const own = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input?.url ?? input);
    if (!url.startsWith(API)) return own(input, init);
    return Response.json([{ ...VM, workspaces: [] }, MAC]);
  };
  try {
    const app = await boot("listo", "web-account-workspaces-gate", {}, undefined, { "sb-supabase-auth-token": session }, {
      web: true,
      workspaces: REGISTRY,
      beforeImport: (w) => {
        globalThis.WebSocket = f.Socket;
        w.terminusWeb = { supabaseUrl: SUPABASE, supabaseKey: "public-anon-key" };
      },
    });
    await sleep(3000);
    const doc = app.w.document;
    assert.equal(doc.querySelector("[data-web-gate]"), null, "the gate let the app in");
    assert.equal(doc.querySelector("[data-web-onboarding]"), null, "and the app opens no onboarding");
    assert.deepEqual(app.failures, []);
  } finally {
    globalThis.fetch = own;
  }
});
