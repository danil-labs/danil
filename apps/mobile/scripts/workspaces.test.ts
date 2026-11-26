/**
 * La lista de workspaces del teléfono (`src/lib/engine.ts`): un workspace es de
 * la cuenta, no de una máquina. Con la VM dormida (sin copia en el relay) y la
 * única máquina encendida sin workspaces, la lista trae los de la cuenta y sus
 * carpetas, en la VM; sin registro, lo de antes.
 *
 *   node --test apps/mobile/scripts/workspaces.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AccountWorkspace } from "@terminus/computers";
import { delegatedOf } from "@terminus/tasks";
import { type Folder, foldersForNewTask, mergeSnapshots, taskInSpace, tasksOf, withAccountFolders, withSpaceCatalog, workspaceEntries } from "../src/lib/engine.ts";

const REGISTRY: AccountWorkspace[] = [
  {
    id: "w1",
    name: "Producto",
    projects: [
      { id: "p1", name: "Aplicación", remote_url: "https://github.com/ana/app", home_computer_id: "cmp_vm" },
      { id: "p2", name: "Notas", remote_url: null, home_computer_id: "cmp_otra" },
    ],
    computers: ["cmp_vm"],
  },
];
const HOSTS = [{ id: "cmp_vm" }, { id: "cmp_mac" }];

test("con la VM dormida y la Mac sin workspaces, la lista trae los de la cuenta", () => {
  // La VM no contestó (`null`); la Mac contestó sin ninguno.
  const perHost = { cmp_vm: null, cmp_mac: [] };
  assert.deepEqual(workspaceEntries(HOSTS, perHost, null), [], "sin registro, la lista vacía de hoy");
  const list = workspaceEntries(HOSTS, perHost, REGISTRY);
  assert.deepEqual(
    list.map((w) => [w.id, w.name, w.hosts]),
    [["w1", "Producto", ["cmp_vm"]]],
  );
});

test("la fila de una máquina que contesta manda, y la que contestó sin el workspace no es miembro", () => {
  const list = workspaceEntries(HOSTS, { cmp_vm: null, cmp_mac: [{ id: "w1", name: "Producto en la Mac" }] }, REGISTRY);
  assert.deepEqual(list.map((w) => [w.name, w.hosts]), [["Producto en la Mac", ["cmp_vm", "cmp_mac"]]]);
  const awake = workspaceEntries(HOSTS, { cmp_vm: [], cmp_mac: [] }, REGISTRY);
  assert.deepEqual(awake.map((w) => w.hosts), [[]], "la VM despierta dice que ya no lo tiene");
});

test("las carpetas del registro se ven en la máquina donde nacieron, o en la primera del workspace", () => {
  const empty = { folders: [] as Folder[], spaces: [{ id: "s", name: null, folders: [] as string[] }], tasks: [] };
  const filled = withAccountFolders(empty, REGISTRY, "w1", ["cmp_vm"]);
  assert.deepEqual(filled.folders.map((f) => [f.key, f.name]), [["cmp_vm/p1", "Aplicación"], ["cmp_vm/p2", "Notas"]]);
  assert.deepEqual(filled.spaces[0].folders, ["cmp_vm/p1", "cmp_vm/p2"], "y en el space que se ve");
  const live = { ...empty, folders: [{ id: "p1", name: "Aplicación", key: "cmp_mac/p1", host: "cmp_mac" }] };
  assert.deepEqual(withAccountFolders(live, REGISTRY, "w1", ["cmp_vm", "cmp_mac"]).folders.map((f) => f.key), ["cmp_mac/p1", "cmp_vm/p2"], "lo que una máquina lista manda");
  assert.equal(withAccountFolders(empty, REGISTRY, "w1", []), empty, "sin máquinas del workspace, nada");
  assert.equal(withAccountFolders(empty, null, "w1", ["cmp_vm"]), empty, "sin registro, nada");
});

test("los spaces son de todas las máquinas: uno por id o por nombre, y cada tarea va en el de su fila", () => {
  const part = (host: string, spaces: { id: string; name: string | null; folders: string[] }[], tasks: { id: string; space: string | null }[]) => ({
    host,
    folders: [],
    spaces,
    tasks: tasks.map((t) => ({ ...t, title: t.id, provider: "codex", model: null, created_at: 0, updated_at: 0, esperando: false, agent: null, host, workspace: "w1", folder: "p1", folderKey: `${host}/p1` })),
    delegated: [],
    agents: [],
    live: [],
    providers: [],
    cachedAt: null,
  });
  // La VM (primera) dormida no tiene spaces; la Mac sí.
  const vm = part("cmp_vm", [], [{ id: "t-vm", space: null }]);
  const mac = part("cmp_mac", [{ id: "s-gen", name: null, folders: ["p1"] }, { id: "s-web", name: "Web", folders: [] }], [{ id: "t-gen", space: "s-gen" }, { id: "t-web", space: "s-web" }]);
  const merged = mergeSnapshots([vm, mac], () => null);
  assert.deepEqual(merged.spaces.map((s) => [s.id, s.on]), [["s-gen", { cmp_mac: "s-gen" }], ["s-web", { cmp_mac: "s-web" }]]);
  assert.deepEqual(merged.spaces[0].folders, ["cmp_vm/p1", "cmp_mac/p1"], "la carpeta tiene el mismo id en cada máquina");
  const web = merged.spaces[1];
  assert.deepEqual(merged.tasks.filter((t) => taskInSpace(t, web)).map((t) => t.id), ["t-vm", "t-web"], "una sin space resuelto va en todos");
  // Con las dos despiertas, el space por defecto de cada una es uno.
  const both = mergeSnapshots([part("cmp_vm", [{ id: "s-vm", name: null, folders: [] }], [{ id: "t-vm", space: "s-vm" }]), mac], () => null);
  assert.deepEqual(both.spaces.map((s) => s.on), [{ cmp_vm: "s-vm", cmp_mac: "s-gen" }, { cmp_mac: "s-web" }]);
  assert.ok(taskInSpace(both.tasks.find((t) => t.id === "t-vm")!, both.spaces[0]));
  assert.ok(!taskInSpace(both.tasks.find((t) => t.id === "t-vm")!, both.spaces[1]));
});

test("la lista del teléfono esconde las delegadas bajo su lanzador, como el escritorio, y las guarda para su chat", () => {
  const row = (id: string, created_at: number, extra: object = {}) => ({ id, title: id, provider: "codex", model: null, created_at, updated_at: 0, esperando: false, agent: null, ...extra });
  const { tasks, delegated } = tasksOf({
    p1: [row("lanzador", 3), row("delegada", 2, { launched_by: "lanzador", launcher_available: true }), row("huerfana", 1, { launched_by: "borrado", launcher_available: false })],
    "": [row("vieja", 0, { launched_by: "lanzador", archived: true })],
  }, "cmp_mac", "w1");
  assert.deepEqual(tasks.map((t) => t.id), ["lanzador"], "la de un lanzador que ya no existe tampoco sale suelta");
  assert.deepEqual(delegated.map((t) => [t.id, t.folderKey]), [["delegada", "cmp_mac/p1"], ["huerfana", "cmp_mac/p1"]], "la archivada no");
  const merged = mergeSnapshots([{ host: "cmp_mac", folders: [], spaces: [], tasks, delegated, agents: [], live: [], providers: [], cachedAt: null }], () => ({ machine: "Mac", on: false }));
  assert.deepEqual(merged.delegated.map((t) => [t.id, t.machine, t.machine_on]), [["delegada", "Mac", false], ["huerfana", "Mac", false]], "con la máquina apagada siguen en el chat de su lanzador");
  assert.deepEqual(delegatedOf(merged.delegated, "lanzador").map((t) => t.id), ["delegada"]);
});


test("una hija remota cuelga de su coordinador en otra máquina solo si su máquina anuncia `remote_child_v1`", () => {
  const row = (id: string, created_at: number, extra: object = {}) => ({ id, title: id, provider: "codex", model: null, created_at, updated_at: 0, esperando: false, agent: null, ...extra });
  const mac = tasksOf({ p1: [row("coord", 3)] }, "cmp_mac", "w1");
  const vm = tasksOf({ p1: [row("hija", 2, { remote_parent: { machine: "cmp_mac", workspace: "w1", task: "coord", request_id: "r" } })] }, "cmp_vm", "w1");
  const part = (host: string, p: typeof mac, features: string[]) => ({ host, folders: [], spaces: [], ...p, agents: [], live: [], providers: [], cachedAt: null, features });
  const on = mergeSnapshots([part("cmp_mac", mac, []), part("cmp_vm", vm, ["remote_child_v1"])], () => null);
  assert.deepEqual(on.tasks.map((t) => t.id), ["coord"]);
  assert.deepEqual(on.delegated.map((t) => [t.id, t.remote_launcher]), [["hija", "cmp_mac/coord"]]);
  const off = mergeSnapshots([part("cmp_mac", mac, []), part("cmp_vm", vm, [])], () => null);
  assert.deepEqual(off.tasks.map((t) => t.id), ["coord", "hija"], "sin la función, suelta como siempre");
  assert.deepEqual(off.delegated, []);
});

test("el teléfono usa el orden compartido aunque los motores listen en otro orden", () => {
  const snapshot = { folders: [], tasks: [], spaces: [
    { id: "a", name: "A", folders: [] }, { id: "b", name: "B", folders: [] },
  ] };
  const registry = [{ ...REGISTRY[0], spaces: [
    { id: "a", name: "A", folders: [], position: 0, changed_at: 1 },
    { id: "b", name: "B", folders: [], position: 1, changed_at: 1 },
  ], settings: { space_order: '["b","a"]' } }];
  assert.deepEqual(withAccountFolders(snapshot, registry, "w1", []).spaces.map(space => space.id), ["b", "a"]);
});

test("withSpaceCatalog proyecta espacios en orden y asigna tareas e hijas desde task_spaces", () => {
  const taskRow = (id: string, space: string | null, extra: object = {}) => ({
    id,
    title: id,
    provider: "codex",
    model: null,
    created_at: 0,
    updated_at: 0,
    esperando: false,
    agent: null,
    space,
    host: "vm1",
    workspace: "w1",
    folder: "f1",
    folderKey: "vm1/f1",
    ...extra,
  });
  const base = {
    spaces: [{ id: "eng_empty", name: null, folders: [], on: { vm1: "eng_empty" } }],
    tasks: [
      taskRow("t_mapped", "eng_empty"),
      taskRow("t_fallback", "eng_empty"),
      taskRow("t_engine", "sp_b"),
    ],
    delegated: [taskRow("t_child", "eng_empty", { launched_by: "t_mapped" })],
  };
  assert.equal(withSpaceCatalog(base, null, ["vm1"]), base);
  assert.equal(withSpaceCatalog(base, { version: 1, spaces: [], order: [], task_spaces: {} }, ["vm1"]), base);

  const projected = withSpaceCatalog(
    base,
    {
      version: 4,
      spaces: [
        { id: "sp_a", name: null, folders: ["f1"] },
        { id: "sp_b", name: "App", folders: ["f2"] },
      ],
      order: ["sp_b", "sp_a"],
      task_spaces: { t_mapped: "sp_b" },
    },
    ["vm1", "mac1"],
  );
  assert.deepEqual(projected.spaces.map((s) => s.id), ["sp_b", "sp_a"]);
  assert.deepEqual(projected.spaces[0].folders, ["vm1/f2", "mac1/f2"]);
  assert.deepEqual(projected.tasks.map((t) => [t.id, t.space]), [
    ["t_mapped", "sp_b"],
    ["t_fallback", "sp_b"],
    ["t_engine", "sp_b"],
  ]);
  assert.equal(projected.delegated[0].space, "sp_b", "la hija hereda el espacio de su coordinador");
  assert.ok(taskInSpace({ space: "sp_x" }, { id: "sp_x", name: "X", folders: [], on: {} }), "matchea id aunque on esté vacío");
});

test("foldersForNewTask prioriza el espacio activo y cae a todas las carpetas si el espacio no enlaza ninguna", () => {
  const all: Folder[] = [
    { id: "f1", name: "Notas", kind: "folder", key: "vm1/f1", host: "vm1" },
    { id: "f2", name: "Repo", kind: "git", key: "vm1/f2", host: "vm1" },
    { id: "f3", name: "RemotaGit", kind: "git", key: "mac1/f3", host: "mac1" },
    { id: "f4", name: "RemotaLocal", kind: "folder", key: "mac1/f4", host: "mac1" },
    { id: "f2", name: "RepoDup", kind: "git", key: "mac1/f2", host: "mac1" },
  ];
  assert.deepEqual(
    foldersForNewTask(all, { folders: ["vm1/f2"] }, "vm1").map((f) => f.key),
    ["vm1/f2"],
  );
  assert.deepEqual(
    foldersForNewTask(all, { folders: [] }, "vm1").map((f) => f.key),
    ["vm1/f1", "vm1/f2", "mac1/f3"],
    "con espacio sin carpetas cae al resto sin duplicar f2 ni incluir folder no-git remoto",
  );
  assert.deepEqual(
    foldersForNewTask(all, { folders: ["vm1/desconocida"] }, "vm1").map((f) => f.key),
    ["vm1/f1", "vm1/f2", "mac1/f3"],
  );
});
