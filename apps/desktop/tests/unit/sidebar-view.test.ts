import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemo, createRoot } from "solid-js";
import "../helpers/catalog.ts";
import { elegirLengua } from "../../src/lib/i18n.ts";
import {
  applySidebarView,
  DEFAULT_SIDEBAR_VIEW,
  groupLabel,
  loadSidebarView,
  nonDefaultCount,
  saveSidebarView,
  setSidebarView,
  sidebarView,
  sidebarViewKey,
  scopeLabel,
  type SidebarTask,
  type SidebarView,
} from "../../src/lib/sidebarView.ts";

const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  },
});

const task = (id: string, extra: Partial<SidebarTask> = {}): SidebarTask => ({
  id,
  esperando: false,
  folder: "terminus",
  agent: null,
  ...extra,
});

const idle = { live: [] as string[], approving: [] as string[] };
const ids = (tasks: SidebarTask[]) => tasks.map((x) => x.id);
const view = (extra: Partial<SidebarView>): SidebarView => ({ ...DEFAULT_SIDEBAR_VIEW, ...extra });

test("without grouping there is one list: tasks that need you stay in place, pinned first", () => {
  const tasks = [
    task("new"),
    task("asks", { esperando: true }),
    task("pinned", { pinned: true }),
    task("done", { outcome: "delivered" }),
    task("archived", { archived: true }),
    task("chat", { chat_de_agente: true }),
  ];
  const groups = applySidebarView(tasks, view({ group: "none" }), idle);
  assert.deepEqual(groups.map((g) => g.key), ["active"]);
  assert.deepEqual(ids(groups[0].tasks), ["pinned", "chat", "new", "asks", "done"]);
  assert.deepEqual(ids(applySidebarView([], view({ group: "none" }), idle)[0].tasks), []);
});

test("folders and agent filter before grouping", () => {
  const tasks = [
    task("a", { folder: "terminus", agent: "ada" }),
    task("b", { folder: "web", agent: "ada" }),
    task("c", { folder: "terminus", agent: "bob" }),
    task("d", { folder: null }),
  ];
  const all = (v: SidebarView) => applySidebarView(tasks, v, idle).flatMap((g) => ids(g.tasks));
  assert.deepEqual(all(view({ folders: ["terminus"] })), ["a", "c"]);
  assert.deepEqual(all(view({ agent: "ada" })), ["a", "b"]);
  assert.deepEqual(all(view({ folders: ["web", "terminus"], agent: "bob" })), ["c"]);
  assert.deepEqual(
    applySidebarView(tasks, view({ folders: ["x"] }), { ...idle, folderOf: (x) => (x.id === "d" ? "x" : null) })
      .flatMap((g) => ids(g.tasks)),
    ["d"],
  );
});

test("grouping keeps only non-empty groups; finished tasks stay in theirs", () => {
  const tasks = [
    task("a", { folder: "web", agent: "ada" }),
    task("b", { folder: null, esperando: true }),
    task("c", { folder: "terminus", agent: "bob" }),
    task("d", { folder: "web", pinned: true }),
    task("e", { folder: "web", outcome: "delivered" }),
  ];
  const byFolder = applySidebarView(tasks, view({ group: "folder" }), idle);
  assert.deepEqual(byFolder.map((g) => `${g.kind}:${g.key}`), ["folder:web", "folder:terminus", "folder:"]);
  assert.deepEqual(ids(byFolder[0].tasks), ["d", "a", "e"]);

  const byStatus = applySidebarView(tasks, view({ group: "status" }), { live: ["c"], approving: [] });
  assert.deepEqual(byStatus.map((g) => g.key), ["unknown"]);
  assert.deepEqual(ids(byStatus[0].tasks), ["d", "a", "b", "c", "e"]);
  assert.equal(groupLabel(byStatus[0], (id) => id), "Desconocido");

  const byAgent = applySidebarView(tasks, view({ group: "agent" }), idle);
  assert.deepEqual(byAgent.map((g) => g.key), ["ada", "bob", ""]);
  assert.deepEqual(ids(byAgent[2].tasks), ["d", "b", "e"]);
});

test("the view survives a restart and bad data falls back to the default", () => {
  store.clear();
  const key = sidebarViewKey("w", "s1");
  assert.deepEqual(loadSidebarView(key), DEFAULT_SIDEBAR_VIEW);
  const chosen = view({ folders: ["terminus"], agent: "ada", group: "status" });
  saveSidebarView(key, chosen);
  assert.deepEqual(loadSidebarView(key), chosen);
  store.set("harness.layout.sidebar.view.w.s1", "{broken");
  assert.deepEqual(loadSidebarView(key), DEFAULT_SIDEBAR_VIEW);
  // Una vista guardada con la densidad que ya no existe la pierde sin perder lo demás.
  store.set("harness.layout.sidebar.view.w.s1", JSON.stringify({ folders: ["a", 3, "a"], agent: 7, group: "size", density: "compact" }));
  assert.deepEqual(loadSidebarView(key), view({ folders: ["a"] }));
});

test("a change from the Customize button reaches the rail on screen without a restart", () => {
  store.clear();
  const key = sidebarViewKey("w", "s1");
  // El riel lee la vista viva; el botón la cambia con el filtro que tenga, aunque sea de otro riel.
  const visto = createRoot(() => createMemo(() => sidebarView(key).group));
  assert.equal(visto(), DEFAULT_SIDEBAR_VIEW.group);
  setSidebarView(key, view({ group: "status" }));
  assert.equal(visto(), "status");
  assert.deepEqual(loadSidebarView(key), view({ group: "status" }), "y se guarda para el próximo arranque");
  setSidebarView(sidebarViewKey("w", "s2"), view({ group: "none" }));
  assert.equal(visto(), "status", "otro espacio no la toca");
});

test("each workspace and space keeps its own view; the old global one is ignored", () => {
  store.clear();
  store.set("harness.layout.sidebar.view", JSON.stringify({ agent: "ada", group: "agent" }));
  const a = sidebarViewKey("w", "s1");
  const b = sidebarViewKey("w", "s2");
  saveSidebarView(a, view({ agent: "ada" }));
  assert.deepEqual(loadSidebarView(a), view({ agent: "ada" }));
  assert.deepEqual(loadSidebarView(b), DEFAULT_SIDEBAR_VIEW, "a space never seen starts from the default");
  assert.deepEqual(loadSidebarView(sidebarViewKey("other", "s1")), DEFAULT_SIDEBAR_VIEW);
  assert.deepEqual(loadSidebarView(sidebarViewKey("w", null)), DEFAULT_SIDEBAR_VIEW);
  assert.notEqual(sidebarViewKey("w", null), a);
});

test("the badge counts each setting away from its default", () => {
  assert.equal(DEFAULT_SIDEBAR_VIEW.group, "folder", "grouping by folder is the default");
  assert.equal(nonDefaultCount(DEFAULT_SIDEBAR_VIEW), 0);
  assert.equal(nonDefaultCount(view({ group: "folder" })), 0);
  assert.equal(nonDefaultCount(view({ group: "none" })), 1);
  assert.equal(nonDefaultCount(view({ folders: ["a", "b"] })), 1);
  assert.equal(nonDefaultCount(view({ folders: ["a"], agent: "ada", group: "agent" })), 3);
});

test("the scope line says what is shown, in the app language", () => {
  const name = (id: string) => ({ f1: "terminus", f2: "web" })[id] ?? id;
  elegirLengua("es");
  assert.equal(scopeLabel(DEFAULT_SIDEBAR_VIEW, name), "Todas las carpetas · por carpeta");
  assert.equal(scopeLabel(view({ group: "none" }), name), "Todas las carpetas");
  assert.equal(scopeLabel(view({ folders: ["f1"], group: "status" }), name), "terminus · por estado del trabajo");
  assert.equal(scopeLabel(view({ folders: ["f1", "f2"], agent: "ada", group: "none" }), name), "terminus, web · ada");
  assert.equal(groupLabel({ kind: "folder", key: "", tasks: [] }, name), "Sin carpeta");
  assert.equal(groupLabel({ kind: "section", key: "active", tasks: [] }, name), "Tareas");
  elegirLengua("en");
  assert.equal(scopeLabel(view({ group: "agent" }), name), "All folders · by agent");
  elegirLengua("es");
});
