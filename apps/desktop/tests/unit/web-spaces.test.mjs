/**
 * Spaces are of the machine that keeps them: with a managed VM asleep first in
 * the list and the Mac on, the browser asks every machine of the workspace for
 * its spaces (not only the first one, which answered «none» while asleep),
 * shows the Mac's in the title bar, and renaming or creating one goes to the
 * Mac. Mounts `dist-web/`.
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
    settings: { lengua: null, lengua_de_salida: null, default_permission_mode: null, terminal_theme: null },
    settings_version: 1,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
    projects: [{ id: "p1", name: "Aplicación", remote_url: "https://github.com/ana/app", default_branch: "main", home_computer_id: "cmp_mac" }],
    computers: ["cmp_vm", "cmp_mac"],
  },
];
const VM = { computer_id: "cmp_vm", name: "Danil VM", state: "stopped", provider: "aws-ec2", workspaces: ["w1"] };
const MAC = { computer_id: "cmp_mac", name: "Mac de Ana", state: "online", provider: "self", kind: "physical", workspaces: ["w1"] };
const WS = { workspaces: [{ id: "w1", name: "Producto", context_root: null }], active: "w1" };
const PROJECT = { id: "p1", name: "Aplicación", working_directory: "/lab/p1", kind: "git", portfolio: null, sources: [] };
const row = { id: "t1", title: "Tarea del espacio", last_message: "", provider: "codex", model: "gpt-5.6", refs: [], updated_at: 0, turns: 0, parent: null, esperando: false, space: "s1" };

function machines() {
  const vm = { ...engine, list_workspaces: WS, workspaces_startup: WS, list_projects: [PROJECT], list_spaces: [], list_live_sessions: [] };
  const spaces = [{ id: "s1", name: "Diseño", folders: ["p1"], created_at: 1, updated_at: 1 }];
  const mac = {
    ...engine,
    list_workspaces: WS,
    workspaces_startup: WS,
    list_projects: [PROJECT],
    list_spaces: () => spaces,
    list_live_sessions: ({ project }) => (project === "p1" ? [row] : []),
    rename_space: ({ id, name }) => ({ ...spaces[0], id, name }),
    create_space: ({ name, folders }) => ({ id: "s2", name, folders, created_at: 2, updated_at: 2 }),
  };
  return fleet({ cmp_vm: { table: vm, state: "offline" }, cmp_mac: { table: mac } });
}

test("the spaces of the machine that keeps them show with another machine asleep first", async () => {
  const f = machines();
  const app = await boot("listo", "web-spaces", {}, undefined, {}, {
    web: true,
    workspaces: REGISTRY,
    beforeImport: (w) => {
      globalThis.WebSocket = f.Socket;
      w.terminusWeb = { endpoint: "https://relay.test", computers: [VM, MAC], getToken: async () => "tok" };
    },
  });
  const invoke = (command, args, options) => app.w.__TAURI_INTERNALS__.invoke(command, args, options);
  const calls = (id, command) => f.relays[id].calls.filter((c) => c.command === command);
  await sleep(3000);

  const spaces = await invoke("list_spaces");
  assert.deepEqual(spaces.map((s) => [s.id, s.name]), [["cmp_mac~s1", "Diseño"]], "the Mac's space, with its machine in the id");
  assert.ok((app.w.document.body.textContent ?? "").includes("Diseño"), "and the title bar shows it");
  const tasks = await invoke("list_live_sessions", { project: "p1", open: [] });
  assert.equal(tasks[0]?.space, "cmp_mac~s1", "a task names its space the same way");

  const renamed = await invoke("rename_space", { id: "cmp_mac~s1", name: "Diseño 2" });
  assert.equal(renamed.id, "cmp_mac~s1");
  assert.deepEqual(calls("cmp_mac", "rename_space").map((c) => c.args.id), ["s1"], "renaming goes to the Mac with its own id");
  const made = await invoke("create_space", { name: "Nuevo", folders: [] });
  assert.equal(made.id, "cmp_mac~s2", "a new space goes where the others are");
  assert.equal(calls("cmp_mac", "create_space").length, 1);
  for (const command of ["rename_space", "create_space"]) assert.equal(calls("cmp_vm", command).length, 0, `${command} never goes to the VM`);
  assert.deepEqual(app.failures, []);
});
