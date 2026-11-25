import assert from "node:assert/strict";
import test from "node:test";

const { createTaskFiles, isTaskToolActive, taskFileTabId, taskSideLayout, taskSidePanelKind, taskSideUsesSplitWidth } = await import("../../src/lib/taskFiles.ts");

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

test("los popovers flotantes y el panel acoplado de archivos son independientes", () => {
  const files = createTaskFiles();
  assert.equal(files.panel("t").dock, "none");
  assert.equal(files.panel("t").popover, "none");

  files.present("t", "search");
  assert.equal(files.panel("t").popover, "search");
  assert.equal(files.panel("t").dock, "none");
  assert.equal(isTaskToolActive(files.panel("t"), "search"), true);

  files.present("t", "usage");
  assert.equal(files.panel("t").popover, "usage");
  assert.equal(isTaskToolActive(files.panel("t"), "usage"), true);
  files.present("t", "usage");
  assert.equal(files.panel("t").popover, "none");
  assert.equal(files.panel("t").open, false);

  files.present("t", "delegated");
  assert.equal(files.panel("t").popover, "subtasks");
  assert.equal(files.panel("t").dock, "none");

  // Abrir un archivo acopla Archivos a la derecha y cierra el popover activo.
  files.open("t", { tree: "a", path: "App.tsx", changes: false, pinned: true });
  assert.equal(files.panel("t").dock, "files");
  assert.equal(files.panel("t").popover, "none");
  assert.deepEqual(ids(files, "t"), ["App.tsx"]);

  // Abrir el buscador no cierra el panel de Archivos acoplado.
  files.present("t", "search");
  assert.equal(files.panel("t").dock, "files");
  assert.equal(files.panel("t").popover, "search");
  files.closePopover("t");
  assert.equal(files.panel("t").popover, "none");
  assert.equal(files.panel("t").dock, "files");

  files.toggle("t");
  assert.equal(files.panel("t").dock, "none");
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

test("archivos y chat de subtarea se excluyen en el dock; buscador y lista de subtareas son popovers", () => {
  const files = createTaskFiles();
  assert.equal(taskSidePanelKind("files"), "files-search");
  assert.equal(taskSidePanelKind("search"), "files-search");
  assert.equal(taskSidePanelKind("delegated"), "subtasks");
  assert.equal(taskSidePanelKind("usage"), "usage");

  // Archivos abre junto al chat (files-split), y solo pasa a files-expanded al expandir.
  files.open("t", { tree: "a", path: "App.tsx", changes: false, pinned: true });
  assert.equal(taskSideLayout(files.panel("t"), false), "files-split");
  assert.equal(taskSideUsesSplitWidth(files.panel("t")), true);
  files.setExpanded("t", true);
  assert.equal(taskSideLayout(files.panel("t"), false), "files-expanded");

  // Elegir una subtarea cierra el popover y sustituye Archivos en el dock (nunca a la vez).
  files.present("t", "delegated");
  assert.equal(files.panel("t").popover, "subtasks");
  files.openSubtask("t", { project: "p1", session: "sub-1" });
  assert.equal(files.panel("t").dock, "subtask");
  assert.equal(files.panel("t").popover, "none");
  assert.equal(files.panel("t").expanded, false);
  assert.deepEqual(files.panel("t").subtask, { project: "p1", session: "sub-1" });
  assert.equal(taskSideLayout(files.panel("t"), false), "subtask-split");
  assert.equal(taskSideLayout(files.panel("t"), true), "subtask-full");
  assert.equal(taskSideUsesSplitWidth(files.panel("t")), true);
  assert.deepEqual(files.activeSubtasks(), ["sub-1"]);

  // El botón de rama vuelve a abrir el popover compacto sin cerrar el subhilo abierto.
  files.present("t", "delegated");
  assert.equal(files.panel("t").popover, "subtasks");
  assert.equal(files.panel("t").dock, "subtask");
  assert.deepEqual(files.activeSubtasks(), ["sub-1"]);

  // Abrir Archivos reemplaza el subhilo en el dock pero conserva sus pestañas.
  files.present("t", "files");
  assert.equal(files.panel("t").dock, "files");
  assert.equal(taskSideLayout(files.panel("t"), false), "files-split");
  assert.deepEqual(ids(files, "t"), ["App.tsx"]);
  assert.deepEqual(files.activeSubtasks(), []);

  // Cerrar el dock deja el chat a ancho completo.
  files.closeDock("t");
  assert.equal(taskSideLayout(files.panel("t"), false), "closed");
});
