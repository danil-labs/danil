import assert from "node:assert/strict";
import test from "node:test";

/**
 * **La tira única de pestañas, en lo que se rompe callado.**
 *
 * Nada de esto da un error cuando falla: la pestaña se abre dos veces, o cerrar
 * la que estás mirando deja el centro en blanco, o cerrar una tarea deja
 * huérfano el archivo que se abrió desde ella y su visor pide un árbol de una
 * sesión que ya no está a mano. Todo eso se ve como «raro» y no como roto, que
 * es justo lo que no se reporta.
 *
 * Y una que sí se ve al día siguiente: **que al reiniciar vuelvan los archivos**
 * que alguien estaba mirando. No vuelven a propósito (`lib/tabs.ts`), y sin
 * una prueba eso se «arregla» sin querer en cuanto alguien unifique el guardado.
 *
 * Cada prueba usa **su propio workspace**: la tira se guarda por workspace, así
 * que compartirlo haría que el orden en que corren decidiera el resultado.
 */

// `localStorage` no existe en Node sin banderas, y `lib/prefs.ts` lo usa al
// guardar. Un stub en memoria es suficiente: lo que se prueba es qué se guarda,
// no dónde.
const almacen = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => almacen.get(k) ?? null,
  setItem: (k: string, v: string) => void almacen.set(k, v),
  removeItem: (k: string) => void almacen.delete(k),
  clear: () => almacen.clear(),
};

const { tabsToClose: tabsToClose, createTabs: createTabs, fileTabId: fileTabId, artifactTabId: artifactTabId } = await import(
  "../../src/lib/tabs.ts"
);

const tarea = (id: string, project = "p") => ({ id, project, titulo: id });

const archivo = (session: string, ruta: string, cambiado = false) => ({
  clase: "archivo" as const,
  id: fileTabId({ project: "p", session, arbol: "declarada", ruta }),
  project: "p",
  session,
  arbol: "declarada",
  ruta,
  cambiado,
});

/** El que se mira antes de que la tarea exista: sin sesión y contra la base. */
const antesDeLaTarea = (ruta: string, project = "p") => ({
  clase: "archivo" as const,
  id: fileTabId({ project, session: "", arbol: ".preview", ruta }),
  project,
  session: "",
  arbol: ".preview",
  ruta,
  cambiado: false,
  base: "refs/heads/dev",
});

const artefacto = (session: string, rel: string) => ({
  clase: "artefacto" as const,
  id: artifactTabId({ session, rel }),
  project: "p",
  session,
  rel,
  path: `/tmp/${rel}`,
  kind: "output" as const,
});

/** Una tira cargada sobre un workspace propio, lista para usar. */
function tira(ws: string) {
  const t = createTabs();
  t.load(ws);
  return t;
}

/**
 * Una tarea escribe en más de un árbol y los tres pueden tener un `README.md`.
 * Con la ruta sola como identidad, abrir el segundo activaba la pestaña del
 * primero y quien mira leía el archivo equivocado creyendo que era el suyo.
 */
test("el mismo nombre en dos árboles son dos pestañas", () => {
  const t = tira("dos-arboles");
  t.ensure(tarea("s1"));
  t.openContent({ ...archivo("s1", "README.md"), arbol: "declarada" });
  t.openContent({
    ...archivo("s1", "README.md"),
    arbol: "clon-1",
    id: fileTabId({
      project: "p",
      session: "s1",
      arbol: "clon-1",
      ruta: "README.md",
    }),
  });
  assert.equal(t.open().length, 3);
});

/**
 * Y el mismo archivo abierto desde dos tareas son dos pestañas. Con la tira
 * única eso pasó a ser posible: antes cada tarea tenía la suya.
 */
test("el mismo archivo en dos tareas son dos pestañas", () => {
  const t = tira("dos-tareas");
  t.ensure(tarea("s1"));
  t.ensure(tarea("s2"));
  t.openContent(archivo("s1", "README.md"));
  t.openContent(archivo("s2", "README.md"));
  assert.equal(t.open().filter((p) => p.clase === "archivo").length, 2);
});

/**
 * **Reabrir refresca si cambió.** Entre abrir un archivo y volver a pulsarlo en
 * el árbol puede haber pasado un turno entero: si la pestaña conservara el
 * `cambiado` de la primera vez, no ofrecería la vista de cambios y el panel
 * diría que el turno no tocó nada.
 */
test("volver a abrirlo actualiza si el agente lo cambió", () => {
  const t = tira("refresco");
  t.ensure(tarea("s1"));
  t.openContent(archivo("s1", "src/App.tsx", false));
  t.openContent(archivo("s1", "src/App.tsx", true));
  const p = t.open().find((x) => x.clase === "archivo");
  assert.equal(p?.clase === "archivo" && p.cambiado, true);
});

/**
 * Un árbol sin resumen de cambios —el de kn— siempre abre con `cambiado`
 * falso. Reabrir desde ahí no puede quitar la vista de cambios que el archivo
 * ganó al guardarse; revertirlo lo decide el patch del visor.
 */
test("reabrir sin saber si cambió no le quita la vista de cambios", () => {
  const t = tira("reabrir-sin-resumen");
  t.ensure(tarea("s1"));
  t.openContent(archivo("s1", "ejemplos/hello.go", false));
  t.markChanged(archivo("s1", "ejemplos/hello.go").id);
  t.openContent(archivo("s1", "ejemplos/hello.rb", false));
  t.openContent(archivo("s1", "ejemplos/hello.go", false));
  const p = t.open().find((x) => x.id === archivo("s1", "ejemplos/hello.go").id);
  assert.equal(p?.clase === "archivo" && p.cambiado, true);
});
/** Cerrar la de en medio deja delante la que ocupa su sitio, no la primera. */
test("cerrar la activa deja la de al lado", () => {
  const t = tira("vecina");
  t.ensure(tarea("s1"));
  for (const r of ["a.ts", "b.ts", "c.ts"]) t.openContent(archivo("s1", r));
  t.activate(archivo("s1", "b.ts").id);
  t.close(archivo("s1", "b.ts").id);
  assert.equal(t.active(), archivo("s1", "c.ts").id);
});

/** Y cerrar la última deja la anterior: no hay hueco a la derecha. */
test("cerrar la última deja la anterior", () => {
  const t = tira("ultima");
  t.ensure(tarea("s1"));
  for (const r of ["a.ts", "b.ts"]) t.openContent(archivo("s1", r));
  t.close(archivo("s1", "b.ts").id);
  assert.equal(t.active(), archivo("s1", "a.ts").id);
});

/**
 * **Cerrar la tarea cierra sus archivos y sus artefactos.** No pueden
 * sobrevivirla: el visor los pide con el par proyecto/sesión, así que sin su
 * tarea serían pestañas que no pueden pintar nada.
 */
test("cerrar la tarea se lleva lo suyo", () => {
  const t = tira("cascada");
  t.ensure(tarea("s1"));
  t.ensure(tarea("s2"));
  t.openContent(archivo("s1", "a.ts"));
  t.openContent(artefacto("s1", "informe.md"));
  t.openContent(archivo("s2", "b.ts"));
  // Mirando un archivo de s1, que es cuando cerrar su tarea tiene que mover a
  // alguna parte: su visor se va con ella.
  t.activate(archivo("s1", "a.ts").id);
  t.close("s1");
  assert.deepEqual(
    t.open().map((p) => p.session),
    ["s2", "s2"],
  );
  assert.equal(t.active(), "s2");
});

// Si la pregunta mirara solo la pestaña pulsada, cerrar la tarea tiraría el
// borrador de su archivo sin preguntar.
test("lo sin guardar que se lleva un cierre es el bloque que cierra", () => {
  const t = tira("sin-guardar");
  t.ensure(tarea("s1"));
  t.ensure(tarea("s2"));
  const a = archivo("s1", "a.ts");
  const b = archivo("s1", "b.ts");
  const c = archivo("s2", "c.ts");
  t.openContent(a);
  t.openContent(b);
  t.openContent(c);
  t.setDirty(a.id, true);
  t.setDirty(c.id, true);

  assert.deepEqual(t.dirtyTabsToClose("s1").map((p) => p.ruta), ["a.ts"]);
  assert.deepEqual(t.dirtyTabsToClose(a.id).map((p) => p.ruta), ["a.ts"]);
  assert.deepEqual(t.dirtyTabsToClose(b.id), []);

  t.setDirty(a.id, false);
  assert.deepEqual(t.dirtyTabsToClose("s1"), []);
});

test("guardar desde la tira lo hace el visor, y un fallo lo dice", async () => {
  const t = tira("guardar-desde-fuera");
  t.ensure(tarea("s1"));
  const a = archivo("s1", "a.ts");
  const b = archivo("s1", "b.ts");
  t.openContent(a);
  t.openContent(b);
  const guardados: string[] = [];
  t.registerSaver(a.id, async () => {
    guardados.push(a.id);
    return true;
  });
  t.registerSaver(b.id, async () => false);

  assert.equal(await t.saveFiles([a.id]), true);
  assert.deepEqual(guardados, [a.id]);
  assert.equal(await t.saveFiles([a.id, b.id]), false);
  // Un id sin visor que lo guarde no se da por guardado.
  t.registerSaver(a.id, null);
  assert.equal(await t.saveFiles([a.id]), false);
});

/**
 * **Al reiniciar vuelven las tareas y no los documentos.** Una tarea abierta es
 * un compromiso; un archivo se vuelve a abrir con un clic. Si esto empieza a
 * fallar es porque alguien unificó el guardado, y entonces hay que decidirlo a
 * propósito y no descubrirlo.
 */
test("solo las tareas sobreviven al reinicio", () => {
  const uno = tira("persistencia");
  uno.ensure(tarea("s1"));
  uno.openContent(archivo("s1", "a.ts"));
  uno.openContent(artefacto("s1", "informe.md"));

  const dos = tira("persistencia");
  assert.deepEqual(
    dos.open().map((p) => p.id),
    ["s1"],
  );
});

/** Y la activa que vuelve es la **tarea** de lo que se estaba mirando. */
test("al reiniciar se vuelve a la tarea del documento que se leía", () => {
  const uno = tira("persistencia-activa");
  uno.ensure(tarea("s1"));
  uno.ensure(tarea("s2"));
  uno.openContent(archivo("s2", "a.ts"));

  const dos = createTabs();
  assert.equal(dos.load("persistencia-activa"), "s2");
});

/**
 * Una tarea borrada desde otra instancia de la app deja pestañas que apuntan a
 * nada — **y sus archivos también**. Sin esto, la tira enseñaría el archivo de
 * una tarea que ya no existe y su visor fallaría al pedirla.
 */
test("sincronizar se lleva la tarea que ya no está, y lo suyo", () => {
  const t = tira("sincronizar");
  t.ensure(tarea("s1"));
  t.ensure(tarea("s2"));
  t.openContent(archivo("s1", "a.ts"));
  const fuera = t.sync((id) =>
    id === "s2" ? { project: "p", titulo: "dos" } : null,
  );
  assert.deepEqual(fuera, ["s1"]);
  assert.deepEqual(
    t.open().map((p) => p.id),
    ["s2"],
  );
});

/**
 * Antes de la tarea la sesión está vacía en todas, y lo único que separa dos
 * `README.md` es el proyecto. Sin él en la identidad, entrar a un proyecto y
 * abrir su README activa el que quedó abierto del anterior, con otro contenido
 * y sin decir nada.
 */
test("el mismo archivo en dos proyectos son dos pestañas", () => {
  const t = tira("dos-proyectos");
  t.openContent(antesDeLaTarea("README.md", "uno"));
  t.openContent(antesDeLaTarea("README.md", "dos"));
  assert.equal(t.open().length, 2);
});

/** Con tarea manda ella: mudarla de proyecto no cambia el id de sus archivos. */
test("mudar la tarea de proyecto no reabre su archivo", () => {
  const t = tira("mudar-y-reabrir");
  t.ensure(tarea("s1"));
  t.openContent(archivo("s1", "a.ts"));
  t.moveToProject("s1", "otro");
  t.openContent({ ...archivo("s1", "a.ts"), project: "otro" });
  assert.equal(t.open().filter((p) => p.clase === "archivo").length, 1);
});

/**
 * Lo que se miraba antes de arrancar sigue delante, y pasa a leer la copia de
 * trabajo. Sin el reatado quedarían dos pestañas del mismo archivo —la del
 * commit y la de la copia— diciendo cosas distintas.
 */
test("el primer turno reata los archivos a su tarea", () => {
  const t = tira("reatar");
  t.openContent(antesDeLaTarea("README.md"));
  const antes = t.active();
  t.ensure(tarea("s1"));
  const pares = t.attachPreviewFiles("p", "s1", "declarada");
  const p = t.open().find((x) => x.clase === "archivo");
  assert.equal(p?.session, "s1");
  assert.equal(p?.clase === "archivo" && p.arbol, "declarada");
  assert.equal(p?.clase === "archivo" && p.base, undefined);
  assert.deepEqual(pares, [[antes as string, p?.id as string]]);
  assert.equal(t.active(), p?.id);
});

/**
 * Renombrar desde el árbol deja la pestaña en la ruta nueva, y una carpeta
 * arrastra las de dentro. Sin esto el visor pediría una ruta que ya no existe.
 */
test("renombrar en el árbol mueve sus pestañas y solo las suyas", () => {
  const t = tira("mover-archivos");
  t.ensure(tarea("s1"));
  t.openContent(archivo("s1", "docs/a.md"));
  t.openContent(archivo("s1", "docs2/b.md"));
  t.openContent(archivo("s1", "docs/sub/c.md"));
  const viendo = t.active();
  const pares = t.renameFiles("s1", "declarada", "docs", "manual");
  assert.deepEqual(
    t.open().flatMap((p) => (p.clase === "archivo" ? [p.ruta] : [])),
    ["manual/a.md", "docs2/b.md", "manual/sub/c.md"],
  );
  assert.equal(pares.length, 2);
  assert.equal(t.active(), fileTabId({ project: "p", session: "s1", arbol: "declarada", ruta: "manual/sub/c.md" }));
  assert.notEqual(t.active(), viendo);
  assert.deepEqual(t.renameFiles("s2", "declarada", "manual", "x"), []);
});

/** Un proyecto no reata los archivos que otro dejó abiertos. */
test("reatar solo toca los de su proyecto", () => {
  const t = tira("reatar-ajeno");
  t.openContent(antesDeLaTarea("README.md", "uno"));
  t.openContent(antesDeLaTarea("README.md", "dos"));
  t.attachPreviewFiles("uno", "s1", "declarada");
  assert.deepEqual(
    t.open().map((p) => p.session),
    ["s1", ""],
  );
});

/**
 * Un archivo sin tarea no tiene fila en el historial. Preguntando por él, cada
 * pasada de `sincronizar` lo borraba de la tira mientras se estaba leyendo.
 */
test("sincronizar no se lleva lo que se mira antes de la tarea", () => {
  const t = tira("sincronizar-previa");
  t.openContent(antesDeLaTarea("README.md"));
  t.sync(() => null);
  assert.equal(t.open().length, 1);
});

/** Mover una tarea de proyecto se lleva a los suyos: el visor usa el par. */
test("mover la tarea mueve sus archivos", () => {
  const t = tira("mover");
  t.ensure(tarea("s1"));
  t.openContent(archivo("s1", "a.ts"));
  t.moveToProject("s1", "otro");
  assert.deepEqual(
    t.open().map((p) => p.project),
    ["otro", "otro"],
  );
});

/**
 * Lo guardado antes de que la tira fuera polimórfica no traía `clase` ni
 * `session`. Sin completarlo, quien actualice la app abre con la tira vacía —
 * un fallo que solo se ve una vez y ya no se puede reproducir.
 */
test("la tira guardada por la versión anterior se lee entera", () => {
  almacen.set(
    "harness.layout.pestanas.viejo",
    JSON.stringify({
      abiertas: [{ id: "s9", project: "p", titulo: "de antes" }],
      activa: "s9",
    }),
  );
  const t = createTabs();
  assert.equal(t.load("viejo"), "s9");
  const p = t.open()[0];
  assert.equal(p.clase, "tarea");
  assert.equal(p.session, "s9");
});

const { markedState, taskPriority } = await import("../../../../packages/design/src/taskState.ts");
const { compactGitKind, UNKNOWN_GIT, mergeRemoteGit, retainGitObservation } = await import("../../src/features/projects/taskGit.ts");

test("la atención gana a trabajo y fallo; fin de turno no significa tarea terminada", () => {
  const base = { aprobando: false, esperando: false, viva: false, outcome: "failed" as const };
  assert.equal(taskPriority({ ...base, aprobando: true, esperando: true, viva: true }), "approving");
  assert.equal(taskPriority({ ...base, esperando: true, viva: true }), "asked");
  assert.equal(taskPriority({ ...base, viva: true }), "working");
  assert.equal(taskPriority(base), "failed");
  assert.equal(taskPriority({ ...base, outcome: "delivered" }), null);
  assert.equal(taskPriority({ ...base, outcome: "interrupted", sinVer: true }), "interrupted", "detenida no es fallo y va antes que sin ver");
  assert.equal(taskPriority({ ...base, outcome: "interrupted", viva: true }), "working");
});

test("lo visto no lleva marca: ni entregada, ni detenida, ni gris", () => {
  const base = { aprobando: false, esperando: false, viva: false };
  assert.equal(markedState({ ...base, outcome: "delivered" }), null);
  assert.equal(markedState({ ...base, outcome: "delivered", sinVer: true }), "unseen");
  assert.equal(markedState({ ...base, outcome: "interrupted" }), null, "detenida y vista no se marca");
  assert.equal(markedState({ ...base, outcome: "interrupted", sinVer: true }), "unseen", "detenida sin ver es verde");
  assert.equal(markedState({ ...base, outcome: "failed" }), "failed");
});

test("compact Git retains known stale PRs but never invents an observation", () => {
  assert.equal(compactGitKind(), null);
  assert.equal(compactGitKind(UNKNOWN_GIT), null);
  assert.equal(compactGitKind({ ...UNKNOWN_GIT, kind: "none" }), null);
  const branch = { ...UNKNOWN_GIT, kind: "branch" as const, branch: "hija", shared_with: null };
  assert.equal(compactGitKind(branch), "branch");
  const pull = { ...branch, pull_known: true, pull: { number: 4, state: "merged" as const, head_sha: "abc" } };
  assert.equal(compactGitKind(pull), "pull");
  assert.equal(compactGitKind({ ...pull, stale: true }), "pull");
  assert.equal(compactGitKind({ ...pull, pull_known: false }), "branch");
  assert.equal(compactGitKind({ ...UNKNOWN_GIT, kind: "kn", alias: "cone-260911", kn: "draft" }), "kn");
  assert.equal(compactGitKind({ ...UNKNOWN_GIT, kind: "kn", alias: "cone-260911" }), "kn");
});

test("sidebar and tabs share local and remote polling without a third scan", async () => {
  const { watchSessionGit } = await import("../../src/features/projects/taskGit.ts");
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const originalInterval = globalThis.setInterval;
  let timers = 0;
  let calls = 0;
  const fake = new EventTarget();
  Object.assign(fake, { __TAURI_INTERNALS__: { transformCallback: () => 1, invoke: async () => { calls++; return {}; } } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: fake, writable: true });
  Object.defineProperty(globalThis, "document", { configurable: true, value: Object.assign(new EventTarget(), { hidden: false }), writable: true });
  globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => {
    timers++;
    return originalInterval(...args);
  }) as typeof setInterval;
  const sidebar = watchSessionGit("shared-observer-test");
  const tabs = watchSessionGit("shared-observer-test");
  try {
    assert.equal(timers, 2);
    assert.equal(calls, 0);
    assert.equal(sidebar.rows, tabs.rows);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(calls, 2);
  } finally {
    tabs.release();
    sidebar.release();
    globalThis.setInterval = originalInterval;
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument, writable: true });
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow, writable: true });
  }
});

test("remote metadata cannot overwrite a new HEAD, repository or newer result", () => {
  const row = { ...UNKNOWN_GIT, kind: "branch" as const, branch: "feature", head: "new", repository: "repo-a", checked_at: 20 };
  const old = { ...row, checked_at: 10, pull_known: true };
  assert.deepEqual(mergeRemoteGit({ s: row }, { s: old }), { s: row });
  assert.deepEqual(mergeRemoteGit({ s: row }, { s: { ...old, head: "old", checked_at: 30 } }), { s: row });
  assert.deepEqual(mergeRemoteGit({ s: row }, { s: { ...old, repository: "repo-b", checked_at: 30 } }), { s: row });
  assert.deepEqual(mergeRemoteGit({}, { s: row }), {});
  assert.equal(retainGitObservation({ s: row }, { s: old }).s.checked_at, 20);
  assert.equal(retainGitObservation({ s: row }, { s: { ...old, repository: "repo-b" } }).s.checked_at, 10);
});

test("slow remote requests do not block local reads or leak across workspaces", async () => {
  const { watchSessionGit } = await import("../../src/features/projects/taskGit.ts");
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const fake = new EventTarget();
  const doc = Object.assign(new EventTarget(), { hidden: false });
  let local = { s: { ...UNKNOWN_GIT, kind: "branch" as const, branch: "feature", head: "old", repository: "repo-a" } };
  const remote: { resolve: (value: typeof local) => void; snapshot: typeof local }[] = [];
  let localCalls = 0;
  let failLocal = false;
  Object.assign(fake, { __TAURI_INTERNALS__: { transformCallback: () => 1, invoke: async (_: string, args: { remote: boolean }) => {
    if (!args.remote) { localCalls++; if (failLocal) throw new Error("local read failed"); return structuredClone(local); }
    return new Promise<typeof local>(resolve => remote.push({ resolve, snapshot: structuredClone(local) }));
  } } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: fake, writable: true });
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc, writable: true });
  const watcher = watchSessionGit("remote-latency-test");
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  try {
    await tick();
    assert.equal(remote.length, 1);
    local.s.head = "new";
    watcher.refresh();
    await tick();
    assert.equal(localCalls, 2);
    assert.equal(watcher.rows().s.head, "new");
    remote[0].resolve(remote[0].snapshot);
    await tick();
    assert.equal(watcher.rows().s.head, "new");
    fake.dispatchEvent(new Event("focus"));
    await tick();
    assert.equal(remote.length, 2);
    failLocal = true;
    watcher.refresh();
    await tick();
    assert.equal(watcher.rows().s.stale, true);
    remote[1].resolve(remote[1].snapshot);
    await tick();
    assert.equal(watcher.rows().s.stale, true, "a remote response cannot hide a failed local read");
    failLocal = false;
    fake.dispatchEvent(new Event("focus"));
    await tick();
    assert.equal(remote.length, 3);
    local.s.repository = "repo-b";
    fake.dispatchEvent(new Event("harness:workspace"));
    assert.deepEqual(watcher.rows(), {});
    await tick();
    assert.equal(watcher.rows().s.repository, "repo-b");
    remote[2].resolve(remote[2].snapshot);
    await tick();
    assert.equal(watcher.rows().s.repository, "repo-b");
    doc.hidden = true;
    const before = localCalls;
    fake.dispatchEvent(new Event("focus"));
    await tick();
    assert.equal(localCalls, before);
  } finally {
    watcher.release();
    for (const request of remote) request.resolve(request.snapshot);
    await tick();
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow, writable: true });
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument, writable: true });
  }
});

test("the shared remote queue starts active work before background projects", async () => {
  const { watchSessionGit } = await import("../../src/features/projects/taskGit.ts");
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const requests: string[] = [];
  const finish: (() => void)[] = [];
  const fake = Object.assign(new EventTarget(), { __TAURI_INTERNALS__: { transformCallback: () => 1,
    invoke: async (_: string, args: { project: string; remote: boolean }) => {
      if (!args.remote) return { active: { ...UNKNOWN_GIT, kind: "branch", branch: "feature", head: "head" } };
      requests.push(args.project);
      return new Promise(resolve => finish.push(() => resolve({})));
    },
  } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: fake, writable: true });
  Object.defineProperty(globalThis, "document", { configurable: true, value: Object.assign(new EventTarget(), { hidden: false }), writable: true });
  const observers = ["background-1", "background-2", "selected"].map(project => watchSessionGit(project));
  try {
    observers[2].prioritize(["active"]);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(requests, ["selected", "background-1"]);
    finish[0]();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(requests, ["selected", "background-1", "background-2"]);
  } finally {
    for (const observer of observers) observer.release();
    for (const resolve of finish) resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow, writable: true });
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument, writable: true });
  }
});


test("a Git read that never answers frees its turn: the PR of a newer task still arrives", async (t) => {
  const { GIT_READ_DEADLINE, watchSessionGit } = await import("../../src/features/projects/taskGit.ts");
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const row = { ...UNKNOWN_GIT, kind: "branch" as const, branch: "feature", head: "a", repository: "repo" };
  const pull = { number: 317, state: "merged" as const, head_sha: "a" };
  const calls: string[] = [];
  let firstLocal = true;
  const fake = Object.assign(new EventTarget(), { __TAURI_INTERNALS__: { transformCallback: () => 1,
    invoke: async (_: string, args: { project: string; remote: boolean }) => {
      calls.push(`${args.project}:${args.remote ? "remote" : "local"}`);
      // Dos remotas colgadas ocupan los dos turnos de la cola compartida.
      if (args.remote && args.project.startsWith("hung-")) return new Promise(() => {});
      if (!args.remote && args.project === "hung-local" && firstLocal) { firstLocal = false; return new Promise(() => {}); }
      return args.remote ? { s: { ...row, pull, pull_known: true, checked_at: 2 } } : { s: { ...row, checked_at: 1 } };
    },
  } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: fake, writable: true });
  Object.defineProperty(globalThis, "document", { configurable: true, value: Object.assign(new EventTarget(), { hidden: false }), writable: true });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve)); };
  const watchers = [watchSessionGit("hung-a"), watchSessionGit("hung-b")];
  try {
    await flush();
    watchers.push(watchSessionGit("newer"), watchSessionGit("hung-local"));
    await flush();
    assert.ok(!calls.includes("newer:remote"), "la cola tenía turno libre: la prueba no cuelga nada");
    assert.equal(watchers[2].rows().s.pull, null);
    assert.equal(watchers[3].rows().s, undefined);
    // El barrido de cada 15 s pide otra lectura mientras la colgada sigue ocupada.
    watchers[3].refresh();
    await flush();
    t.mock.timers.tick(GIT_READ_DEADLINE);
    await flush();
    assert.ok(calls.includes("newer:remote"), "las remotas colgadas siguen ocupando la cola");
    assert.equal(watchers[2].rows().s.pull?.number, 317);
    assert.equal(watchers[3].rows().s?.branch, "feature", "la lectura local colgada congeló su carpeta");
  } finally {
    for (const watcher of watchers) watcher.release();
    t.mock.timers.reset();
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow, writable: true });
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument, writable: true });
  }
});

test("local progress paints before completion and rejects superseded channels", async () => {
  const { watchSessionGit } = await import("../../src/features/projects/taskGit.ts");
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  type Rows = Record<string, typeof UNKNOWN_GIT>;
  const reads: { progress: { onmessage: (rows: Rows) => void }; resolve: (rows: Rows) => void; priority: string[] }[] = [];
  const fake = Object.assign(new EventTarget(), { __TAURI_INTERNALS__: {
    transformCallback: () => 1,
    invoke: async (_: string, args: { remote: boolean; priority: string[]; progress: { onmessage: (rows: Rows) => void } }) => {
      if (args.remote) return {};
      return new Promise<Rows>(resolve => reads.push({ ...args, resolve }));
    },
  } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: fake, writable: true });
  Object.defineProperty(globalThis, "document", { configurable: true, value: Object.assign(new EventTarget(), { hidden: false }), writable: true });
  const watcher = watchSessionGit("progress-test");
  const row = { ...UNKNOWN_GIT, kind: "branch" as const, branch: "first", head: "a", repository: "repo" };
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  try {
    watcher.prioritize(["selected", "visible"]);
    await tick();
    assert.equal(reads.length, 1);
    assert.deepEqual(reads[0].priority, ["selected", "visible"]);
    reads[0].progress.onmessage({ first: row });
    assert.equal(watcher.rows().first.branch, "first");
    reads[0].progress.onmessage({ second: { ...row, branch: "second" } });
    assert.deepEqual(Object.keys(watcher.rows()), ["first", "second"]);
    reads[0].resolve({ first: row });
    await tick();
    assert.equal(watcher.rows().second, undefined);
    watcher.refresh(); await tick();
    reads[0].progress.onmessage({ first: { ...row, branch: "late" } });
    assert.equal(watcher.rows().first.branch, "first");
    fake.dispatchEvent(new Event("harness:workspace")); await tick();
    reads[1].progress.onmessage({ first: row });
    reads[1].resolve({ first: row }); await tick();
    assert.deepEqual(watcher.rows(), {});
    watcher.release();
    reads[2].progress.onmessage({ first: row });
    reads[2].resolve({ first: row }); await tick();
    assert.deepEqual(watcher.rows(), {});
  } finally {
    watcher.release();
    for (const read of reads) read.resolve({});
    await tick();
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow, writable: true });
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument, writable: true });
  }
});

test("remounting the tabs and the sidebar keeps the last Git rows instead of painting none", async () => {
  const { watchSessionGit } = await import("../../src/features/projects/taskGit.ts");
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const row = { ...UNKNOWN_GIT, kind: "branch" as const, branch: "feature", head: "a", repository: "repo" };
  const pending: (() => void)[] = [];
  let answer: Record<string, typeof row> = { s: row };
  const fake = Object.assign(new EventTarget(), { __TAURI_INTERNALS__: { transformCallback: () => 1,
    invoke: async (_: string, args: { remote: boolean }) => {
      if (args.remote) return {};
      const value = structuredClone(answer);
      return new Promise(resolve => pending.push(() => resolve(value)));
    },
  } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: fake, writable: true });
  Object.defineProperty(globalThis, "document", { configurable: true, value: Object.assign(new EventTarget(), { hidden: false }), writable: true });
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const answerAll = async () => { while (pending.length) pending.shift()!(); await tick(); };
  const watchers = [watchSessionGit("remount-test"), watchSessionGit("remount-test")];
  try {
    await tick();
    await answerAll();
    const seen = watchers[0].rows();
    assert.equal(seen.s.branch, "feature");
    // Cerrar una ventana: los viejos se sueltan antes de que pidan los nuevos.
    watchers.splice(0).forEach(w => w.release());
    watchers.push(watchSessionGit("remount-test"), watchSessionGit("remount-test"));
    assert.equal(watchers[0].rows(), seen, "the new strip paints what was already known");
    await tick();
    await answerAll();
    assert.equal(watchers[0].rows(), seen, "an equal read does not repaint");
    watchers.splice(0).forEach(w => w.release());
    answer = {};
    fake.dispatchEvent(new Event("harness:workspace"));
    watchers.push(watchSessionGit("remount-test"));
    assert.deepEqual(watchers[0].rows(), {}, "another workspace inherits nothing");
  } finally {
    watchers.forEach(w => w.release());
    fake.dispatchEvent(new Event("harness:workspace"));
    await answerAll();
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow, writable: true });
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument, writable: true });
  }
});

const { idProvisional } = await import("../../src/lib/taskDraft.ts");

// La tarea se pinta antes de que Rust le dé su id. Guardar ese id provisional
// devolvería al siguiente arranque una pestaña cuya tarea no está en el disco.
test("la pestaña de una tarea que aún no existe no se guarda", () => {
  const t = tira("provisional");
  const naciendo = idProvisional();
  t.ensure(tarea("s1"));
  t.ensure({ id: naciendo, project: "p", titulo: "arregla el cohete" });
  t.activate(naciendo);
  assert.equal(t.open().length, 2);
  const vuelta = tira("provisional");
  assert.deepEqual(vuelta.open().map((p) => p.id), ["s1"]);
  assert.equal(vuelta.active(), null);
});

test("la tarea que nace se queda en el sitio de su pestaña provisional", () => {
  const t = tira("nace");
  const naciendo = idProvisional();
  t.ensure({ id: naciendo, project: "p", titulo: "arregla el cohete" });
  t.ensure(tarea("s2"));
  t.activate(naciendo);
  t.commitDraft(naciendo, { id: "s1", project: "p", titulo: "arregla el cohete" });
  assert.deepEqual(t.open().map((p) => p.id), ["s1", "s2"]);
  assert.equal(t.active(), "s1");
  assert.deepEqual(tira("nace").open().map((p) => p.id), ["s1", "s2"]);
});

// `pintarNaciendo` conserva la provisional antes de activarla: como vista,
// lanzar la tarea cerraba la que se estaba mirando, y el siguiente clic del
// riel cerraba la tarea recién lanzada.
test("lanzar una tarea nueva no sustituye la vista de delante y queda conservada", () => {
  const t = createTabs({ transient: true });
  t.load("lanzar-conservada");
  t.ensure(tarea("s1"));
  t.activate("s1");
  const naciendo = idProvisional();
  t.ensure({ id: naciendo, project: "p", titulo: "arregla el cohete" });
  t.pin(naciendo);
  t.activate(naciendo);
  // Lo que hace el reparto al cambiar de activa: solo sustituye si la nueva es vista.
  if (!t.isPinned(naciendo)) t.replacePreviews([["s1", naciendo]], [naciendo]);
  assert.deepEqual(t.open().map((p) => p.id), ["s1", naciendo]);
  t.commitDraft(naciendo, { id: "s2", project: "p", titulo: "arregla el cohete" });
  assert.equal(t.isPinned("s2"), true, "la tarea creada hereda la conservación");
  t.ensure(tarea("s3"));
  t.activate("s3");
  t.replacePreviews([["s1", "s2", "s3"]], ["s3"]);
  assert.deepEqual(t.open().map((p) => p.id), ["s2", "s3"]);
  assert.deepEqual(tira("lanzar-conservada").open().map((p) => p.id), ["s2", "s3"]);
  assert.equal(tira("lanzar-conservada").isPinned("s2"), true);
});

// `enviar` conserva la pestaña de la tarea a la que se escribe, como editar un archivo.
test("mandar un mensaje conserva la pestaña de su tarea", () => {
  const t = createTabs({ transient: true });
  t.load("mandar-conserva");
  t.ensure(tarea("s1"));
  t.activate("s1");
  assert.equal(t.isPinned("s1"), false);
  t.pin("s1");
  t.ensure(tarea("s1"));
  assert.equal(t.isPinned("s1"), true);
  t.ensure(tarea("s2"));
  t.activate("s2");
  t.replacePreviews([["s1", "s2"]], ["s2"]);
  assert.deepEqual(t.open().map((p) => p.id), ["s1", "s2"]);
});

// La pestaña provisional existe antes que su tarea, igual que el archivo de
// vista previa. Sin exención, el primer refresco del historial la cierra y el
// foco vuelve a la tarea anterior.
test("sincronizar no cierra la pestaña de una tarea que aún nace", () => {
  const t = tira("sincro-provisional");
  const naciendo = idProvisional();
  t.ensure(tarea("s1"));
  t.ensure({ id: naciendo, project: "p", titulo: "cuéntame un cuento" });
  t.activate(naciendo);
  const fuera = t.sync((id) =>
    id === "s1" ? { project: "p", titulo: "s1" } : null,
  );
  assert.deepEqual(fuera, []);
  assert.deepEqual(t.open().map((p) => p.id), ["s1", naciendo]);
  assert.equal(t.active(), naciendo);
});

/** La tira de las pruebas de cierre en lote: s1 con dos archivos, s2 con uno, s3 sola. */
function tiraDeTres(ws: string) {
  const t = tira(ws);
  for (const s of ["s1", "s2", "s3"]) t.ensure(tarea(s));
  t.openContent(archivo("s1", "a.ts"));
  t.openContent(archivo("s1", "b.ts"));
  t.openContent(archivo("s2", "c.ts"));
  return t;
}

const sesiones = (t: ReturnType<typeof tira>) =>
  t.open().map((p) => (p.clase === "archivo" ? `${p.session}/${p.ruta}` : p.id));

test("cerrar en lote con la activa fuera no la mueve", () => {
  const t = tiraDeTres("lote-activa-fuera");
  t.activate("s3");
  t.closeMany(["s1", archivo("s2", "c.ts").id]);
  assert.deepEqual(sesiones(t), ["s2", "s3"]);
  assert.equal(t.active(), "s3");
});

test("cerrar en lote todo deja sin activa", () => {
  const t = tiraDeTres("lote-todo");
  t.activate(archivo("s1", "b.ts").id);
  const vecina = t.closeMany(t.open().map((p) => p.id));
  assert.equal(vecina, null);
  assert.deepEqual(t.open(), []);
  assert.equal(t.active(), null);
});

test("cerrar en lote escribe una sola vez y lo guardado sobrevive a recargar", () => {
  const t = tiraDeTres("lote-guardar");
  t.activate("s3");
  const ls = globalThis.localStorage;
  const setItem = ls.setItem;
  let escrituras = 0;
  ls.setItem = (k: string, v: string) => {
    escrituras++;
    setItem(k, v);
  };
  try {
    t.closeMany(["s1", "s2"]);
  } finally {
    ls.setItem = setItem;
  }
  assert.equal(escrituras, 1);
  const otra = createTabs();
  assert.equal(otra.load("lote-guardar"), "s3");
  assert.deepEqual(otra.open().map((p) => p.id), ["s3"]);
});

test("las demás desde un archivo dejan su tarea y cierran sus hermanos", () => {
  const t = tiraDeTres("demas-archivo");
  const id = archivo("s1", "b.ts").id;
  t.activate(id);
  t.closeMany(tabsToClose(t.open(), id, "demas"));
  assert.deepEqual(sesiones(t), ["s1", "s1/b.ts"]);
  assert.equal(t.active(), id);
});

test("a la derecha de una tarea empieza detrás de su bloque", () => {
  const t = tiraDeTres("derecha-tarea");
  t.closeMany(tabsToClose(t.open(), "s1", "derecha"));
  assert.deepEqual(sesiones(t), ["s1", "s1/a.ts", "s1/b.ts"]);
});

test("a la derecha de la última no hay nada que cerrar", () => {
  const t = tiraDeTres("derecha-ultima");
  assert.deepEqual(tabsToClose(t.open(), "s3", "derecha"), []);
  assert.deepEqual(tabsToClose(t.open(), archivo("s2", "c.ts").id, "derecha"), ["s3"]);
});

test("un archivo sin tarea conserva solo a sí mismo", () => {
  const t = tira("demas-huerfano");
  t.ensure(tarea("s1"));
  t.openContent(antesDeLaTarea("README.md"));
  const id = antesDeLaTarea("README.md").id;
  assert.deepEqual(tabsToClose(t.open(), id, "demas"), ["s1"]);
  t.closeMany(tabsToClose(t.open(), id, "demas"));
  assert.deepEqual(t.open().map((p) => p.id), [id]);
});

const todas = () => true;

test("reabrir devuelve la tarea con sus archivos en su sitio y delante", () => {
  const t = tiraDeTres("reabrir-bloque");
  t.activate(archivo("s1", "b.ts").id);
  t.closeMany(["s1"], { remember: true });
  assert.deepEqual(sesiones(t), ["s2", "s2/c.ts", "s3"]);
  const delante = t.reopen(todas);
  assert.deepEqual(sesiones(t), ["s1", "s1/a.ts", "s1/b.ts", "s2", "s2/c.ts", "s3"]);
  assert.equal(delante?.id, archivo("s1", "b.ts").id);
  assert.equal(t.canReopen(), false);
});

test("reabrir va del último cierre al primero", () => {
  const t = tiraDeTres("reabrir-orden");
  t.closeMany(["s3"], { remember: true });
  t.closeMany(["s2"], { remember: true });
  // Al cerrar s2 se miraba su archivo: vuelve ese, no la conversación.
  assert.equal(t.reopen(todas)?.id, archivo("s2", "c.ts").id);
  assert.equal(t.reopen(todas)?.id, "s3");
  assert.deepEqual(sesiones(t), ["s1", "s1/a.ts", "s1/b.ts", "s2", "s2/c.ts", "s3"]);
  assert.equal(t.reopen(todas), null);
});

// Mover una tarea a otro escritorio o borrarla también cierra su pestaña;
// deshacer eso la traería de vuelta a la tira equivocada o rota.
test("solo vuelve lo que se cerró a mano", () => {
  const t = tiraDeTres("reabrir-a-mano");
  t.close("s3");
  t.sync((id) => (id === "s1" ? { project: "p", titulo: "s1" } : null));
  assert.equal(t.canReopen(), false);
  assert.equal(t.reopen(todas), null);
});

test("lo que ya no existe se salta y cede al cierre anterior", () => {
  const t = tiraDeTres("reabrir-borrada");
  t.closeMany(["s3"], { remember: true });
  t.closeMany(["s2"], { remember: true });
  assert.equal(t.reopen((p) => p.session !== "s2")?.id, "s3");
  assert.deepEqual(sesiones(t), ["s1", "s1/a.ts", "s1/b.ts", "s3"]);
});

test("lo cerrado es de su tira: otro escritorio no lo reabre", () => {
  const t = createTabs();
  t.load("reabrir-tiras", "a");
  t.ensure(tarea("s1"));
  t.closeMany(["s1"], { remember: true });
  t.load("reabrir-tiras", "b");
  assert.equal(t.canReopen(), false);
  t.load("reabrir-tiras", "a");
  assert.equal(t.reopen(todas)?.id, "s1");
});

test("una tarea que aún nace no se recuerda al cerrarla", () => {
  const t = tira("reabrir-provisional");
  t.ensure({ id: idProvisional(), project: "p", titulo: "borrador" });
  t.closeMany(t.open().map((p) => p.id), { remember: true });
  assert.equal(t.canReopen(), false);
});

test("las vistas temporales se sustituyen sin cerrar el bloque de su tarea", () => {
  const t = createTabs({ transient: true });
  t.load("temporal-reemplazo");
  t.ensure(tarea("s1"));
  const a = archivo("s1", "a.ts");
  t.openContent(a);
  t.pin(a.id);
  t.ensure(tarea("s2"));
  t.activate("s2");
  t.replacePreviews([["s1", a.id, "s2"]], ["s2"]);
  assert.ok(t.open().some(p => p.id === a.id));
  assert.ok(t.isPinned("s1"), "el documento conservado protege su tarea");
  t.ensure(tarea("s3"));
  t.activate("s3");
  t.replacePreviews([["s1", a.id, "s2", "s3"]], ["s3"]);
  assert.equal(t.open().some(p => p.id === "s2"), false);
  assert.equal(t.open().some(p => p.id === "s3"), true);
});

test("conservar no cambia la identidad y protege ediciones sin guardar", () => {
  const t = createTabs({ transient: true });
  t.load("temporal-editor");
  const a = archivo("", "a.ts");
  t.openContent(a);
  const same = t.open()[0];
  t.setDirty(a.id, true);
  assert.equal(t.isPinned(a.id), true);
  t.openContent(archivo("", "b.ts"));
  t.replacePreviews([t.open().map(p => p.id)], [t.active()]);
  assert.equal(t.open()[0], same);
  assert.ok(t.dirty().has(a.id));
});

test("las tareas temporales vuelven temporales y las anteriores siguen conservadas", () => {
  const legacy = tira("temporal-legacy");
  legacy.ensure(tarea("anterior"));
  const t = createTabs({ transient: true });
  t.load("temporal-legacy");
  assert.equal(t.isPinned("anterior"), true);
  t.ensure(tarea("temporal"));
  t.activate("temporal");
  const restored = createTabs({ transient: true });
  assert.equal(restored.load("temporal-legacy"), "temporal");
  assert.deepEqual(restored.open().map(p => p.id), ["anterior", "temporal"]);
  assert.equal(restored.isPinned("anterior"), true);
  assert.equal(restored.isPinned("temporal"), false, "volver no la conserva");
  assert.deepEqual(restored.restorable(), ["anterior", "temporal"]);
  t.pin("temporal");
  restored.load("temporal-legacy");
  assert.equal(restored.isPinned("temporal"), true);
});

test("conservar un editor temporal conserva su tarea aunque ya se sustituyó su vista", () => {
  const t = createTabs({ transient: true });
  t.load("temporal-owner");
  t.ensure(tarea("s1"));
  const a = archivo("s1", "a.ts");
  t.openContent(a);
  t.replacePreviews([["s1", a.id]], [a.id]);
  assert.equal(t.open().some(p => p.id === "s1"), false);
  t.setDirty(a.id, true);
  assert.deepEqual(t.restorable(), ["s1"]);
  assert.ok(t.isPinned(a.id));
  const renamed = t.renameFiles("s1", "declarada", "a.ts", "b.ts")[0][1];
  assert.ok(t.isPinned(renamed));
  assert.equal(t.isPinned(a.id), false);
});

test("conservar una tarea provisional se propaga al id definitivo", () => {
  const t = createTabs({ transient: true });
  t.load("temporal-draft-id");
  const draft = idProvisional();
  t.ensure(tarea(draft));
  t.pin(draft);
  assert.deepEqual(t.restorable(), []);
  t.commitDraft(draft, tarea("real"));
  assert.equal(t.isPinned(draft), false);
  assert.deepEqual(t.restorable(), ["real"]);
});

test("reabrir una vista cerrada a mano la conserva", () => {
  const t = createTabs({ transient: true });
  t.load("temporal-reopen");
  t.ensure(tarea("s1"));
  t.closeMany(["s1"], { remember: true });
  t.reopen(() => true);
  assert.deepEqual(t.restorable(), ["s1"]);
});

/**
 * La pantalla es de la máquina, no de una tarea: una por máquina, y ni
 * sincronizar con el historial ni reiniciar la tratan como tarea.
 */
test("la pantalla de una máquina es una sola pestaña que no se guarda", () => {
  const t = tira("pantalla");
  t.ensure(tarea("s1"));
  t.openScreen("vm-1", "Pantalla de vm-1");
  t.openScreen("vm-1", "Pantalla de vm-1");
  t.openScreen("vm-2", "Pantalla de vm-2");
  assert.deepEqual(
    t.open().map((p) => p.id),
    ["s1", "pantalla\u0000vm-1", "pantalla\u0000vm-2"],
  );
  assert.equal(t.active(), "pantalla\u0000vm-2");
  t.sync((id) => (id === "s1" ? { project: "p", titulo: "uno" } : null));
  assert.equal(t.open().length, 3);
  assert.deepEqual(
    tira("pantalla").open().map((p) => p.id),
    ["s1"],
  );
});

/**
 * Una tarea abierta desde la barra lateral es provisional; si la pantalla
 * también lo fuera, al activarse en la misma ventana la sustituiría y la
 * conversación quedaría vacía al dividir.
 */
test("la pantalla nunca es provisional y no sustituye a la tarea", () => {
  const t = createTabs({ transient: true });
  t.load("pantalla-provisional");
  t.ensure(tarea("s1"));
  assert.equal(t.isPinned("s1"), false);
  t.openScreen("vm-1", "Pantalla de vm-1");
  assert.equal(t.isPinned("pantalla\u0000vm-1"), true);
  assert.deepEqual(t.open().map((p) => p.id), ["s1", "pantalla\u0000vm-1"]);
});

test("Git observations share one read per machine and keep routing explicit", async () => {
  const { watchSessionGit } = await import("../../src/features/projects/taskGit.ts");
  const { setMachineRoute } = await import("../../src/lib/invoke.ts");
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  let failure: unknown = null;
  const calls: { remote: boolean; machine?: string; workspace?: string }[] = [];
  const fake = Object.assign(new EventTarget(), { __TAURI_INTERNALS__: {
    transformCallback: () => 1,
    invoke: async (_: string, args: { remote: boolean }, options?: { headers?: Record<string, string> }) => {
      if (failure) throw failure;
      const machine = options?.headers?.["x-terminus-machine"];
      calls.push({ remote: args.remote, machine, workspace: options?.headers?.["x-terminus-workspace"] });
      return { s: { ...UNKNOWN_GIT, kind: "branch", branch: "feature", head: "head", repository: machine, checked_at: args.remote ? 2 : 1 } };
    },
  } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: fake, writable: true });
  Object.defineProperty(globalThis, "document", { configurable: true, value: Object.assign(new EventTarget(), { hidden: false }), writable: true });
  setMachineRoute((command, args, options) => fake.__TAURI_INTERNALS__.invoke(command, args as { remote: boolean }, { headers: Object.fromEntries(new Headers(options?.headers)) }));
  const mac = watchSessionGit("machine-scope-test", { workspace: "w", machine: "mac" });
  const again = watchSessionGit("machine-scope-test", { workspace: "w", machine: "mac" });
  const vm = watchSessionGit("machine-scope-test", { workspace: "w", machine: "vm" });
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  try {
    mac.prioritize(["s"]);
    vm.prioritize(["s"]);
    await tick(); await tick();
    assert.deepEqual(calls.filter(call => !call.remote).map(call => call.machine).sort(), ["mac", "vm"]);
    assert.ok(calls.every(call => call.workspace === "w"));
    assert.equal(mac.rows().s.repository, "mac");
    assert.equal(vm.rows().s.repository, "vm");
    const before = calls.length;
    again.prioritize(["s"]);
    await tick();
    assert.equal(calls.length, before, "otra vista de la misma tarea no duplica el recorrido");
    failure = { what: "Git unavailable", detail: "github_not_connected" };
    mac.refresh();
    await tick(); await tick();
    assert.deepEqual(mac.error(), failure, "the chat can show the engine failure");
    assert.equal(mac.rows().s.stale, true);
    failure = null;
    mac.refresh();
    await tick(); await tick();
    assert.equal(mac.error(), null, "a successful retry clears the failure");

  } finally {
    mac.release(); again.release(); vm.release();
    setMachineRoute(null);
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow, writable: true });
    Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument, writable: true });
  }
});


test("un guardado inválido no impide entrar a otro espacio ni borra las pestañas sanas", () => {
  for (const [index, raw] of ["null", "42", "true", "[]", '{"abiertas":null}', "{broken"].entries()) {
    const ws = `invalid-space-strip-${index}`;
    const tabs = createTabs();
    tabs.load(ws, "healthy");
    tabs.ensure(tarea("task"));
    tabs.activate("task");
    almacen.set(`harness.layout.pestanas.${ws}.broken`, raw);
    assert.equal(tabs.load(ws, "broken"), null);
    assert.deepEqual(tabs.open(), []);
    assert.equal(tabs.load(ws, "healthy"), "task");
    assert.deepEqual(tabs.open().map(tab => tab.id), ["task"]);
  }
});

test("Inbox es único por tira y efímero: cerrar y restaurar no modifica tareas", () => {
  const tabs = createTabs();
  tabs.load("inbox-ephemeral", "first");
  tabs.ensure(tarea("task"));
  tabs.openInbox("Inbox");
  tabs.openInbox("Inbox");
  assert.equal(tabs.open().filter(tab => tab.clase === "inbox").length, 1);
  const stored = JSON.parse(almacen.get("harness.layout.pestanas.inbox-ephemeral.first")!);
  assert.deepEqual(stored.abiertas.map((tab: { id: string }) => tab.id), ["task"]);
  assert.equal(stored.activa, null);
  assert.equal(tabs.open().find(tab => tab.clase === "inbox")?.session, "");
  tabs.load("inbox-ephemeral", "second");
  assert.deepEqual(tabs.open(), []);
  tabs.openInbox("Inbox");
  tabs.close("inbox");
  assert.deepEqual(tabs.open(), []);
  const restored = createTabs();
  restored.load("inbox-ephemeral", "first");
  assert.deepEqual(restored.open().map(tab => tab.id), ["task"]);
  assert.equal(restored.active(), null);
});


test("Difusiones es efímera y cerrar la vista conserva la tarea", () => {
  const tabs = tira("broadcasts-ephemeral");
  tabs.ensure(tarea("task"));
  tabs.openBroadcasts("Difusiones");
  tabs.openBroadcasts("Difusiones");
  assert.equal(tabs.open().filter(tab => tab.clase === "broadcasts").length, 1);
  const stored = JSON.parse(almacen.get("harness.layout.pestanas.broadcasts-ephemeral")!);
  assert.deepEqual(stored.abiertas.map((tab: { id: string }) => tab.id), ["task"]);
  assert.equal(stored.activa, null);
  tabs.close("broadcasts");
  assert.deepEqual(tabs.open().map(tab => tab.id), ["task"]);
  assert.equal(tabs.active(), "task");
  const restored = tira("broadcasts-ephemeral");
  assert.deepEqual(restored.open().map(tab => tab.id), ["task"]);
});
