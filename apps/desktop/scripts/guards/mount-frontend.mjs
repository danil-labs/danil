#!/usr/bin/env node
/**
 * **Que el front monte.** Arranca `dist/` de verdad y falla si el árbol no llega
 * a pintarse.
 *
 * Los guardas `mount-*` ejecutan el árbol en vez de leerlo, y esa es la clase
 * entera que cubre: **lo que solo se rompe al ejecutar**. Un prop compuesto con
 * `&&` dentro del JSX entrega `false` y no `null` —el compilador de Solid lo
 * booleaniza para memoizarlo—, así que el hijo lanza en el primer render y la
 * app abre en el esqueleto de `Setup`. `tsc` no puede verlo: para TypeScript esa
 * expresión es `T[] | null`, y la reescritura ocurre después, en Babel.
 *
 * **En jsdom y no en un navegador**, porque un guarda no puede abrirle una
 * ventana en la cara a nadie: con varias ramas en QA, una que aparece sola se
 * confunde con la que alguien está mirando. Lo que cuesta: jsdom no es WebKit ni
 * WebView2, así que esto afirma que **el árbol monta**, no que se vea bien.
 *
 * **El IPC va stubeado, y el stub es parte del guarda.** Sin
 * `__TAURI_INTERNALS__` el primer `invoke` rechaza y `Setup` no llega a montar
 * `App`, que es el código que hay que ejercitar. Un comando sin respuesta **no**
 * rompe el guarda: se rechaza igual que rechazaría un backend que falla. Se
 * arranca con la lista de superficies vacía a propósito, que es el instante en
 * que se rompió.
 */
import assert from "node:assert/strict";
import { sleep } from "../../tests/helpers/jsdom-app.mjs";
import { WITH_TASK, boot, keepActiveView } from "../../tests/helpers/mount-guard.mjs";

/**
 * **El esqueleto de `Setup` es el síntoma exacto**, no una pantalla más.
 *
 * Cuando el primer render de `App` lanza, la excepción sube por el `setEnv` de
 * `Setup.revisar`, la traga su `try`, y el árbol se queda a medias en el
 * `Skeleton` que ya estaba pintado. Eso es lo que se vio en producción: tres
 * barras grises y ni un error.
 */
const inSkeleton = (html) => html.includes("setup-card") && html.includes("aria-busy");

const t0 = Date.now();
const normal = await boot("listo", 1);

const broken = normal.failures.length > 0 || !normal.painted.trim() || inSkeleton(normal.painted);

if (!broken) {
  await sleep(1600);
  const storage = normal.w.document.querySelector('button[aria-label="Máquinas"]');
  if (normal.storageQueries.length || !storage) {
    console.error("Máquinas debe estar disponible sin barrer el disco con el panel cerrado.");
    process.exit(1);
  }
  normal.emit("harness:turno-cerrado", {});
  normal.emit("harness:turn", 0);
  normal.w.dispatchEvent(new normal.w.Event("focus"));
  await sleep(1800);
  if (normal.storageQueries.length) {
    console.error(
      `Con el panel cerrado no se vuelve a barrer el disco: ${normal.storageQueries.join(",")}.`,
    );
    process.exit(1);
  }
  storage.click();
  await sleep(200);
  assert.deepEqual(normal.storageQueries, [true], "abrir almacenamiento mide sólo el detalle seleccionado");
  assert.ok(normal.w.document.body.textContent.includes("1.0 GB"), "el panel muestra el tamaño lógico medido");
  storage.click();
  await sleep(50);
  const placeholder = normal.w.document.querySelector("textarea")?.getAttribute("placeholder");
  if (!placeholder?.startsWith("Pregunta algo")) {
    console.error(
      `El campo de escribir no invita a escribir: placeholder=${JSON.stringify(placeholder)}.`,
    );
    process.exit(1);
  }
  const separateSelector = normal.w.document.querySelector('select[title="Quién responde"]');
  const modelButton = normal.w.document.querySelector('button[title="Con qué modelo responde"]');
  modelButton?.dispatchEvent(new normal.w.MouseEvent("click", { bubbles: true }));
  await sleep(50);
  const modelGroups = [...normal.w.document.querySelectorAll('[role="group"]')]
    .map((groupEl) => groupEl.getAttribute("aria-label"));
  const modelNote = normal.w.document.querySelector('[role="option"]')?.getAttribute("title");
  assert.equal(modelNote, "en esta computadora, con Ollama", "a model note from the app goes through the catalogue");
  if (separateSelector || modelButton?.getAttribute("aria-label") !== "Modelo: GPT-5.6") {
    console.error(
      `El chat no arrancó en el modelo usable del selector único: modelo=${JSON.stringify(modelButton?.getAttribute("aria-label"))}, grupos=${JSON.stringify(modelGroups)}.`,
    );
    process.exit(1);
  }

  modelButton.click();
  const inputField = normal.w.document.querySelector("textarea");
  inputField.value = "Empieza la tarea";
  inputField.dispatchEvent(new normal.w.InputEvent("input", { bubbles: true }));
  await sleep(10);
  normal.w.document.querySelector('button[aria-label="Preguntar"]')?.click();
  await sleep(100);
  // Mandar el primer mensaje mueve la caja del centro al pie y la remonta: sin
  // recuperar el foco, encolar lo siguiente pide otro clic. Es el único
  // `focus()` automático que el compositor tiene derecho a hacer.
  if (normal.w.document.activeElement !== normal.w.document.querySelector("textarea")) {
    console.error("Tras mandar el primer mensaje el compositor no recuperó el foco.");
    process.exit(1);
  }
  const modelAfterStart = normal.w.document.querySelector(
    'button[aria-label="Modelo: GPT-5.6"]',
  );
  modelAfterStart?.dispatchEvent(new normal.w.MouseEvent("click", { bubbles: true }));
  await sleep(50);
  if (modelAfterStart?.disabled || !normal.w.document.querySelector('[role="group"]')) {
    console.error(
      "El modelo no se puede elegir para el siguiente turno mientras el actual responde.",
    );
    process.exit(1);
  }
  modelAfterStart?.dispatchEvent(new normal.w.MouseEvent("click", { bubbles: true }));

  /**
   * **La barra de arriba conduce las dos columnas.**
   *
   * Los dos conmutadores viven en la fila de los botones de la ventana y no
   * dentro de las columnas que colapsan: si esa barra no monta, la única forma
   * de recuperar el historial se va con ella y no queda nada en pantalla que lo
   * diga.
   */
  const hideButton = normal.w.document.querySelector(
    'button[aria-label="Ocultar el historial"]',
  );
  hideButton?.click();
  await sleep(50);
  const showButton = normal.w.document.querySelector(
    'button[aria-label="Mostrar el historial"]',
  );
  if (!hideButton || !showButton) {
    console.error(
      `La barra de ventana no conduce el historial: ocultar=${!!hideButton}, mostrar=${!!showButton}.`,
    );
    process.exit(1);
  }
  showButton.click();
  await sleep(50);

  // Abre el panel de archivos de la tarea para ejecutar también su render.
  const treeButton = normal.w.document.querySelector('button[aria-label="Archivos de la tarea"]');
  if (!treeButton) {
    console.error("Con una tarea abierta no aparece el botón de sus archivos.");
    process.exit(1);
  }
  treeButton.click();
  await sleep(300);
  const resizeHandle = normal.w.document.querySelector('[role="separator"][aria-label="Ancho del panel de archivos"]');
  const filesPanel = normal.w.document.querySelector("[data-task-files]");
  if (!resizeHandle || !filesPanel || normal.failures.length > 0) {
    console.error(`El panel de archivos de la tarea no montó: tirador=${!!resizeHandle}, tarjeta=${!!filesPanel}.`);
    for (const f of normal.failures.slice(0, 3)) {
      for (const l of String(f).split("\n").slice(0, 6)) console.error(`      ${l}`);
    }
    process.exit(1);
  }

  /**
   * El semáforo de Windows lo traen dos cabeceras —la del chasis y la del
   * panel derecho—, y solo una de las dos puede estar a la vista. Con la
   * columna abierta se veían los dos juegos, el del chasis a mitad de
   * pantalla. En macOS no se ve: ahí el semáforo es nativo.
   */
  const trafficLight = await boot(
    "listo",
    "window-controls",
    WITH_TASK,
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  );
  // Una columna cerrada mide cero y esconde lo suyo, pero sus nodos siguen en
  // el documento: contar por selector da dos con la columna cerrada. jsdom no
  // calcula geometría, y lo único que queda para filtrarlos es su ancho en
  // línea.
  const trafficLights = () =>
    [...trafficLight.w.document.querySelectorAll('button[aria-label="Cerrar Danil"]')]
      .filter((buttonEl) => !buttonEl.closest('[style*="width: 0px"]')).length;
  // El tirador es lo único que distingue abierta de cerrada: la cabecera de la
  // columna sigue en el documento colapsada, y su botón de cerrar con ella.
  const columnOpen = () =>
    Boolean(trafficLight.w.document.querySelector('[role="separator"][aria-label="Ancho del panel de archivos"]'));
  assert.equal(columnOpen(), false, "la columna nace cerrada");
  assert.equal(trafficLights(), 1, "con la columna cerrada el semáforo es el del chasis");
  trafficLight.w.document.querySelector('[data-sesion="s1"]').click();
  await sleep(150);
  trafficLight.w.document.querySelector('[aria-label="Archivos de la tarea"]').click();
  await sleep(300);
  assert.equal(columnOpen(), true, "el conmutador tiene que abrir el panel de archivos");
  assert.equal(trafficLights(), 1, "con la columna abierta el semáforo no se duplica");
  assert.deepEqual(trafficLight.failures, []);
  trafficLight.w.close();

  /**
   * **Lo que el hilo anuncia se lee en el centro, como una pestaña más.**
   *
   * Es el corte que juntó las dos tiras de pestañas en una
   * (`lib/tabs.ts`): un artefacto y un archivo dejaron de leerse dentro de
   * la columna —una tira metida en otra, a la mitad del ancho— y pasaron a
   * montarse como hermanos de la conversación. Un visor que lance ahí se lleva
   * **el espacio principal entero**, y eso `tsc` no lo ve: son props que solo
   * existen al abrir la pestaña. La fila es la de la tarjeta de entrega
   * (`chat/Delivery.tsx`), que arma la ruta con `session_folder`.
   */
  const treeReads = [];
  const watchedTrees = new Map();
  let externalPaths = ["src/example.ts"];
  const treeResponses = {
    ...WITH_TASK,
    list_live_sessions: [WITH_TASK.list_live_sessions[0], { ...WITH_TASK.list_live_sessions[0], id: "s2", title: "Segunda tarea" }],
    load_session: ({ id }) => ({ ...WITH_TASK.load_session, id }),
    list_task_trees: [{ key: "work", name: "Workspace", path: "/lab", kind: "git", branch: "dev", missing: false, dirty_before: null }],
    watch_task_tree: ({ session, changes }) => { watchedTrees.set(session, changes); return session; },
    unwatch_task_tree: ({ id }) => { watchedTrees.delete(id); },
    tree_files: ({ session }) => {
      treeReads.push(session);
      return { paths: externalPaths, folders: [{ path: ".venv", repo: false, lazy: true, ignored: true }], truncated: false };
    },
    tree_folder: ({ path, offset }) => {
      const total = path === ".venv" ? 450 : 0;
      const until = Math.min(total, offset + 300);
      const paths = Array.from({ length: until - offset }, (_, i) => `${path}/m${String(offset + i).padStart(4, "0")}.py`);
      return { paths, folders: [], next: until < total ? until : null, total };
    },
    tree_git_status: [],
    tree_summary: { base: "HEAD", files: [], added: 0, removed: 0 },
  };
  const treeApp = await boot("listo", "tree-persistence", treeResponses);
  const treeDocument = treeApp.w.document;
  const clickTree = (selector) => {
    const element = treeDocument.querySelector(selector);
    assert.ok(element, selector);
    element.click();
  };
  clickTree('[data-sesion="s1"]');
  await sleep(150);
  const previewDraftField = treeDocument.querySelector("textarea");
  previewDraftField.value = "borrador de la vista temporal";
  previewDraftField.dispatchEvent(new treeApp.w.Event("input", { bubbles: true }));
  clickTree('[data-sesion="s2"]');
  await sleep(150);
  assert.equal(treeDocument.querySelectorAll("[data-preview]").length, 1, "abrir otra tarea sustituye la temporal");
  assert.equal(treeDocument.querySelector('[role="tab"]'), null, "las aperturas sucesivas no acumulan pestañas");
  clickTree('[data-sesion="s1"]');
  await sleep(150);
  assert.equal(treeDocument.querySelector("textarea").value, "borrador de la vista temporal", "sustituir conserva el borrador de la tarea");
  const keepPreview = () => {
    const header = treeDocument.querySelector('[data-preview-header] [role="button"]');
    assert.ok(header, "una vista nueva tiene cabecera temporal fuera de la tira");
    header.dispatchEvent(new treeApp.w.MouseEvent("dblclick", { bubbles: true }));
  };
  assert.equal(treeDocument.querySelector('[role="tablist"] [data-preview]'), null);
  assert.equal(treeDocument.querySelector('[role="tab"]'), null, "abrir no conserva una pestaña");
  keepPreview();

  clickTree('[aria-label="Archivos de la tarea"]');
  await sleep(300);
  const venv = () => [...treeDocument.querySelectorAll('button[aria-expanded]')].find((button) => button.textContent.trim() === ".venv");
  assert.ok(venv(), "a heavy ignored folder shows folded");
  const inVenv = () => [...treeDocument.querySelectorAll("button[data-ruta]")].filter((b) => b.dataset.ruta.startsWith(".venv/")).length;
  assert.equal(inVenv(), 0, "a folded folder lists nothing until it is opened");
  venv().click();
  await sleep(150);
  assert.equal(inVenv(), 300, "opening a folded folder loads its first page");
  const moreButton = [...treeDocument.querySelectorAll("button")].find((b) => b.textContent.includes("Mostrar más"));
  assert.ok(moreButton, "a folded folder offers its next page");
  moreButton.click();
  await sleep(150);
  assert.equal(inVenv(), 450, "the next page is appended");
  assert.equal([...treeDocument.querySelectorAll("button")].some((b) => b.textContent.includes("Mostrar más")), false);
  venv().click();
  await sleep(50);
  assert.equal(venv().getAttribute("aria-expanded"), "false");
  const directory = [...treeDocument.querySelectorAll('button[aria-expanded]')].find((button) => button.textContent.trim() === "src");
  assert.ok(directory);
  directory.click();
  assert.deepEqual(treeReads, ["s1"]);
  clickTree('[data-sesion="s2"]');
  await sleep(150);
  keepPreview();
  clickTree('[aria-label="Archivos de la tarea"]');
  await sleep(300);
  clickTree('[role="tab"][data-pestana="0"]');
  await sleep(150);
  assert.deepEqual(treeReads, ["s1", "s2"], "switching tabs must reuse the loaded tree");
  assert.equal(directory.isConnected, true);
  assert.equal(directory.getAttribute("aria-expanded"), "true");
  clickTree('[aria-label="Archivos de la tarea"]');
  await sleep(50);
  clickTree('[aria-label="Archivos de la tarea"]');
  await sleep(150);
  assert.deepEqual(treeReads, ["s1", "s2"], "reopening the column must reuse the tree");
  treeApp.w.dispatchEvent(new treeApp.w.CustomEvent("harness:arboles", { detail: { session: "s2" } }));
  await sleep(100);
  assert.deepEqual(treeReads, ["s1", "s2"], "hidden trees defer changes");
  clickTree('[role="tab"][data-pestana="1"]');
  await sleep(150);
  assert.deepEqual(treeReads, ["s1", "s2", "s2"], "changed trees refresh when shown");
  treeApp.w.dispatchEvent(new treeApp.w.CustomEvent("harness:copia"));
  await sleep(150);
  assert.deepEqual(treeReads, ["s1", "s2", "s2", "s2"], "saving refreshes only the visible tree once");
  treeDocument.querySelector('[role="tab"][data-pestana="0"]').dispatchEvent(new treeApp.w.KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
  await sleep(100);
  assert.equal(directory.isConnected, false, "closing a task releases its tree");
  assert.equal(watchedTrees.has("s1"), false, "closing the task releases its filesystem watcher");
  externalPaths = ["src/example.ts", "testsync.md"];
  watchedTrees.get("s2").onmessage();
  await sleep(850);
  assert.ok([...treeDocument.querySelectorAll("button")].some((button) => button.textContent.trim() === "testsync.md"));
  externalPaths = ["src/example.ts"];
  watchedTrees.get("s2").onmessage();
  await sleep(850);
  assert.equal([...treeDocument.querySelectorAll("button")].some((button) => button.textContent.trim() === "testsync.md"), false);

  assert.equal(treeApp.failures.length, 0);
  treeApp.w.close();

  const closeAllViews = await boot("listo", "close-all-retained-views", WITH_TASK);
  const closeAllDoc = closeAllViews.w.document;
  closeAllDoc.querySelector('[data-sesion="s1"]').click();
  await sleep(150);
  keepActiveView(closeAllViews);
  closeAllDoc.querySelector('button[title="informe.md"]').click();
  await sleep(150);
  keepActiveView(closeAllViews);
  closeAllDoc.querySelector('[role="tab"]').dispatchEvent(new closeAllViews.w.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  await sleep(100);
  const closeAllAction = [...closeAllDoc.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent.trim() === "Cerrar todas");
  assert.ok(closeAllAction);
  closeAllAction.focus();
  closeAllAction.dispatchEvent(new closeAllViews.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await sleep(150);
  assert.equal(closeAllDoc.querySelector('[data-tira] [role="tab"], [data-preview]'), null, "cerrar todas no reabre la tarea propietaria de un documento");
  assert.deepEqual(closeAllViews.failures, []);
  closeAllViews.w.close();

  console.log(`El front monta — ${normal.painted.length} bytes en #root, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  process.exit(0);
}

/**
 * Segunda pasada: **hacer que el error salga.**
 *
 * La primera dice que no montó y no puede decir por qué, porque la excepción
 * murió dentro del `try` de `Setup`. Entrando por el botón «Entrar de todos
 * modos» el render ocurre dentro de un manejador de evento, y de ahí la
 * excepción sí llega a `window.onerror` con su mensaje.
 */
const manual = await boot("falta", 3);
const enterButton = [...manual.w.document.querySelectorAll(".setup-actions button")].at(-1);
if (enterButton) {
  enterButton.dispatchEvent(new manual.w.MouseEvent("click", { bubbles: true }));
  await sleep(500);
}

console.error("\n  El front no monta. `App` no llegó a pintarse.\n");
const thrown = [...manual.failures, ...normal.failures];
if (thrown.length) {
  console.error("  Lo que lanzó al primer render:\n");
  for (const f of thrown.slice(0, 3)) {
    for (const l of String(f).split("\n").slice(0, 6)) console.error(`      ${l}`);
    console.error("");
  }
} else {
  console.error("  Y nada lanzó a la vista. Corre `pnpm desktop:dev` y mira la consola.\n");
}
console.error(
  "  El empaquetado está minificado, así que el rastro no nombra archivos.\n" +
    "  Para verlo con nombres: `pnpm exec vite build --sourcemap` y repetir.\n",
);
process.exit(1);
