import assert from "node:assert/strict";
import test from "node:test";

const { createTaskFiles, taskFileTabId, taskSidePanelKind, taskSideUsesSplitWidth } = await import("../../src/lib/taskFiles.ts");

const ids = (files: ReturnType<typeof createTaskFiles>, task: string) => files.panel(task).tabs.map((tab) => tab.path);

test("una pestaña de vista previa se reemplaza con el siguiente clic", () => {
  const files = createTaskFiles();
  files.open("t", { tree: "a", path: "README.md", changes: false });
  files.open("t", { tree: "a", path: "App.tsx", changes: false });
  assert.deepEqual(ids(files, "t"), ["App.tsx"]);
  assert.equal(files.panel("t").active, taskFileTabId("a", "App.tsx", false));
});

test("una pestaña fija se queda al abrir otra", () => {
  const files = createTaskFiles();
  files.open("t", { tree: "a", path: "README.md", changes: false, pinned: true });
  files.open("t", { tree: "a", path: "App.tsx", changes: false });
  files.open("t", { tree: "a", path: "main.typ", changes: false });
  assert.deepEqual(ids(files, "t"), ["README.md", "main.typ"]);
});

test("editar fija la pestaña y cerrarla con cambios sin guardar no la cierra", () => {
  const files = createTaskFiles();
  files.open("t", { tree: "a", path: "App.tsx", changes: false });
  const id = taskFileTabId("a", "App.tsx", false);
  files.setDirty("t", id, true);
  assert.equal(files.panel("t").tabs[0].pinned, true);
  assert.deepEqual(files.close("t", [id]), [id]);
  assert.deepEqual(ids(files, "t"), ["App.tsx"]);
  files.setDirty("t", id, false);
  assert.deepEqual(files.close("t", [id]), []);
  assert.deepEqual(ids(files, "t"), []);
});

test("el archivo y su vista de cambios son pestañas distintas", () => {
  const files = createTaskFiles();
  files.open("t", { tree: "a", path: "App.tsx", changes: false, pinned: true });
  files.open("t", { tree: "a", path: "App.tsx", changes: true, pinned: true });
  assert.equal(files.panel("t").tabs.length, 2);
  assert.equal(files.panel("t").tabs[1].changed, true);
});

test("cada tarea tiene su propio panel", () => {
  const files = createTaskFiles();
  files.open("t1", { tree: "a", path: "App.tsx", changes: false });
  assert.equal(files.panel("t1").open, true);
  assert.equal(files.panel("t2").open, false);
  assert.deepEqual(ids(files, "t2"), []);
});

test("cerrar la última pestaña quita el modo expandido y vuelve el árbol", () => {
  const files = createTaskFiles();
  files.open("t", { tree: "a", path: "App.tsx", changes: false });
  files.setExpanded("t", true);
  files.setTree("t", false);
  files.close("t", [taskFileTabId("a", "App.tsx", false)]);
  assert.equal(files.panel("t").expanded, false);
  assert.equal(files.panel("t").tree, true);
  assert.equal(files.panel("t").open, true);
});

test("el modo abre, cambia, cierra, y abrir un archivo vuelve a archivos", () => {
  const files = createTaskFiles();
  assert.equal(files.panel("t").mode, "files");
  files.present("t", "search");
  assert.equal(files.panel("t").open, true);
  assert.equal(files.panel("t").mode, "search");
  files.present("t", "usage");
  assert.equal(files.panel("t").open, true);
  assert.equal(files.panel("t").mode, "usage");
  files.present("t", "usage");
  assert.equal(files.panel("t").open, false);
  files.present("t", "delegated");
  assert.equal(files.panel("t").open, true);
  assert.equal(files.panel("t").mode, "delegated");
  files.open("t", { tree: "a", path: "App.tsx", changes: false, pinned: true });
  assert.equal(files.panel("t").open, true);
  assert.equal(files.panel("t").mode, "files");
  assert.deepEqual(ids(files, "t"), ["App.tsx"]);
  files.present("t", "search");
  files.setOpen("t", true);
  assert.equal(files.panel("t").mode, "files");
  assert.equal(files.panel("t").open, true);
  files.present("t", "search");
  files.toggle("t");
  assert.equal(files.panel("t").mode, "files");
  assert.equal(files.panel("t").open, true);
  files.toggle("t");
  assert.equal(files.panel("t").open, false);
  assert.deepEqual(ids(files, "t"), ["App.tsx"]);
});

test("renombrar o borrar una carpeta mueve o cierra sus pestañas", () => {
  const files = createTaskFiles();
  files.open("t", { tree: "a", path: "src/App.tsx", changes: false, pinned: true });
  files.open("t", { tree: "a", path: "src/App.css", changes: false, pinned: true });
  files.renamed("t", "a", "src", "app");
  assert.deepEqual(ids(files, "t"), ["app/App.tsx", "app/App.css"]);
  assert.equal(files.panel("t").active, taskFileTabId("a", "app/App.css", false));
  files.removed("t", "a", "app");
  assert.deepEqual(ids(files, "t"), []);
});

test("archivos/buscador y subtareas mantienen estado independiente con uno visible a la vez", () => {
  const files = createTaskFiles();
  assert.equal(taskSidePanelKind("files"), "files-search");
  assert.equal(taskSidePanelKind("search"), "files-search");
  assert.equal(taskSidePanelKind("delegated"), "subtasks");
  assert.equal(taskSidePanelKind("usage"), "usage");

  files.open("t", { tree: "a", path: "App.tsx", changes: false, pinned: true });
  files.setExpanded("t", true);
  assert.equal(taskSideUsesSplitWidth(files.panel("t")), true);

  files.openSubtask("t", { project: "p1", session: "sub-1" });
  assert.equal(files.panel("t").open, true);
  assert.equal(files.panel("t").mode, "delegated");
  assert.equal(files.panel("t").expanded, false);
  assert.deepEqual(files.panel("t").subtask, { project: "p1", session: "sub-1" });
  assert.equal(taskSideUsesSplitWidth(files.panel("t")), true);
  assert.deepEqual(files.activeSubtasks(), ["sub-1"]);

  // Cambiar a archivos o buscador oculta subtareas sin perder la subtarea abierta ni las pestañas.
  files.present("t", "files");
  assert.equal(files.panel("t").mode, "files");
  assert.deepEqual(ids(files, "t"), ["App.tsx"]);
  assert.deepEqual(files.panel("t").subtask, { project: "p1", session: "sub-1" });
  assert.deepEqual(files.activeSubtasks(), []);

  files.present("t", "search");
  assert.equal(files.panel("t").mode, "search");
  assert.equal(taskSideUsesSplitWidth(files.panel("t")), false);

  // Volver a subtareas recupera la conversación de la subtarea donde iba.
  files.present("t", "delegated");
  assert.equal(files.panel("t").open, true);
  assert.equal(files.panel("t").mode, "delegated");
  assert.deepEqual(files.panel("t").subtask, { project: "p1", session: "sub-1" });
  assert.deepEqual(files.activeSubtasks(), ["sub-1"]);

  // Volver al listado (Overview) limpia la subtarea activa pero deja abierto el panel de subtareas.
  files.showSubtaskList("t");
  assert.equal(files.panel("t").open, true);
  assert.equal(files.panel("t").mode, "delegated");
  assert.equal(files.panel("t").subtask, null);
  assert.equal(taskSideUsesSplitWidth(files.panel("t")), false);
  assert.deepEqual(files.activeSubtasks(), []);
});
