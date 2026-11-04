#!/usr/bin/env node
/** La columna de workspaces, la barra de título, terminar una tarea, enlaces locales y el alta. */
import assert from "node:assert/strict";
import { sleep } from "../../tests/helpers/jsdom-app.mjs";
import { TASK_AFTER_QUEUE, RESPONSES, boot, bootByFolder, gitRow, keepActiveView, mount, task } from "../../tests/helpers/mount-guard.mjs";

/**
 * La columna de workspaces cambia con un clic y cada cuadro dice lo más
 * urgente de su workspace. «Sin ver» se limpia al abrir la tarea, no al entrar.
 */
let attention = [
  { workspace: "w", tasks: [{ session: "s1", project: "pa", state: "unseen" }, { session: "s2", project: "pa", state: "failed" }] },
  { workspace: "w2", tasks: [{ session: "x", project: "q", state: "unseen" }, { session: "y", project: "q", state: "asked" }, { session: "z", project: "q", state: "approving" }] },
  { workspace: "w3", tasks: [{ session: "k", project: "q", state: "unseen" }, { session: "j", project: "q", state: "asked" }] },
  { workspace: "w4", tasks: [{ session: "n", project: "q", state: "state_from_a_newer_service" }] },
];
const seen = [];
const columnChanges = [];
const columnSpaces = { workspaces: [
  { id: "w", name: "Acme Corp", context_root: null },
  { id: "w2", name: "Beta", context_root: null },
  { id: "w3", name: "gamma-labs", context_root: null },
  { id: "w4", name: "Delta", context_root: null },
], active: "w" };
const columnApp = await bootByFolder("listo", "workspace-column", { ...TASK_AFTER_QUEUE,
  list_workspaces: () => structuredClone(columnSpaces),
  workspaces_startup: () => structuredClone(columnSpaces),
  list_projects: () => [{ id: "pa", name: "Proyecto", kind: "folder", working_directory: "/lab", sources: [] }],
  list_live_sessions: ({ project }) => project === "pa" ? [task("s1", null, "delivered"), task("s2", null, "failed"), task("s3", null, "delivered")] : [],
  load_session: ({ id }) => ({ ...TASK_AFTER_QUEUE.load_session, id, turns: [] }),
  list_workspace_attention: () => structuredClone(attention),
  mark_task_seen: ({ workspace, session }) => { seen.push([workspace, session]); },
  set_active_workspace: ({ id }) => { columnChanges.push(id); columnSpaces.active = id; },
});
await sleep(300);
const doc = columnApp.w.document;
const tile = (id) => doc.querySelector(`[data-workspace-column] [data-workspace-tile="${id}"]`);
assert.deepEqual([...doc.querySelectorAll("[data-workspace-column] [data-workspace-tile]")].map((b) => b.textContent.trim()),
  ["AC", "B", "GL", "D"], "la columna lista cada workspace con sus iniciales");
assert.equal(tile("w").getAttribute("aria-current"), "true", "el activo lleva la marca de selección");
assert.equal(tile("w2").getAttribute("aria-current"), null);
assert.equal(doc.querySelector("[data-title-bar] [data-workspace-name]"), null, "la franja de la ventana ya no nombra el workspace: se cambia en la columna");
assert.equal(doc.querySelector('button[aria-label^="Workspace: "]'), null, "el menú de workspace del pie del riel se fue");
assert.equal(tile("w").dataset.attention, "failed", "fallo sin ver gana a terminada sin ver");
assert.ok(tile("w").querySelector('[data-attention-badge="failed"] .signal-dot[data-tone="error"]'));
assert.equal(tile("w2").dataset.attention, "approving", "un permiso gana a todo");
assert.ok(tile("w2").querySelector('.signal-dot[data-tone="warning"]'));
assert.equal(tile("w2").getAttribute("aria-label"), "Beta: Aquí dentro esperan que apruebes una acción");
assert.equal(tile("w3").dataset.attention, "asked", "una pregunta gana a terminada sin ver");
assert.ok(tile("w3").querySelector('.signal-dot[data-tone="warning"]'));
assert.equal(tile("w4").dataset.attention, undefined, "un estado que la ventana no conoce no se pinta");
const columnRow = (id) => doc.querySelector(`[data-sesion="${id}"]`);
// La tarjeta del riel: sin ver es el punto verde; vista no lleva punto y se apaga.
assert.ok(columnRow("s1").querySelector('[aria-label="Terminó y no la has abierto"] .task-card-badge .signal-dot[data-tone="success"]'), "la fila dice terminada sin ver");
assert.equal(columnRow("s3").dataset.apagada, "true", "una entregada ya vista se apaga, en su sitio");
assert.equal(columnRow("s3").querySelector(".task-card-badge"), null, "y no lleva punto, ni gris");
const foldEl = doc.querySelector('button[aria-label="Plegar «Proyecto»"]');
foldEl.click();
await sleep(50);
const projectEl = [...doc.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Proyecto") && b.querySelector('[aria-label="Una subtarea falló o se interrumpió"]'));
assert.ok(projectEl, "el proyecto plegado agrega el fallo sin ver de dentro");
doc.querySelector('button[aria-label="Desplegar «Proyecto»"]').click();
await sleep(50);
assert.deepEqual(seen, [], "entrar al workspace no marca nada como visto");
columnRow("s1").click();
await sleep(250);
assert.deepEqual(seen, [["w", "s1"]], "abrir la tarea la marca como vista");
attention = [{ ...attention[0], tasks: [attention[0].tasks[1]] }, ...attention.slice(1)];
columnApp.emit("attention", structuredClone(attention));
await sleep(50);
assert.equal(columnRow("s1").querySelector('[aria-label="Terminó y no la has abierto"]'), null, "y la marca se limpia con el evento");
assert.equal(columnRow("s1").dataset.apagada, "true");
columnApp.emit("attention", [{ workspace: "w", tasks: [{ session: "s1", project: "pa", state: "unseen" }] }]);
await sleep(80);
assert.deepEqual(seen, [["w", "s1"], ["w", "s1"]], "un turno que cierra con la tarea delante no queda sin ver");
tile("w2").click();
await sleep(300);
assert.deepEqual(columnChanges, ["w2"], "un clic cambia de workspace");
assert.equal(tile("w2").getAttribute("aria-current"), "true");
tile("w2").dispatchEvent(new columnApp.w.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
await sleep(80);
assert.ok([...doc.querySelectorAll('[role="menuitem"]')].some((b) => b.textContent.trim() === "Administrar workspaces"), "administrar sigue alcanzable desde el cuadro");
assert.ok(doc.querySelector('[data-workspace-column] button[aria-label="Agregar workspace"]'), "y crear uno, desde la columna");
columnSpaces.workspaces = columnSpaces.workspaces.slice(0, 1);
columnApp.w.dispatchEvent(new columnApp.w.CustomEvent("harness:workspace"));
await sleep(300);
assert.ok(doc.querySelector("[data-workspace-column]"), "con uno solo la columna se queda: es el único sitio para cambiar de workspace");
assert.deepEqual(columnApp.failures, []);
/**
 * Con un solo workspace la columna sigue a la vista y crea el segundo. En macOS solo la franja
 * de la ventana se aparta del semáforo, y no nombra ninguna build.
 */
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";
const LONG_NAME = "Software y Servicios Danil, Consultoría de Gobierno de Agentes";
const singleWorkspace = { workspaces: [{ id: "w", name: LONG_NAME, context_root: null }], active: "w" };
const estrellas = [];
const soloApp = await boot("listo", "title-bar-one", { ...TASK_AFTER_QUEUE,
  list_workspaces: () => structuredClone(singleWorkspace),
  workspaces_startup: () => structuredClone(singleWorkspace),
  list_workspace_attention: () => [{ workspace: "w", tasks: [{ session: "s1", project: "", state: "asked" }] }],
  "plugin:window|title": "Terminus · una-rama",
  site_open_external: (args) => { estrellas.push(args.url); return null; },
}, MAC);
await sleep(300);
const d1 = soloApp.w.document;
const titleBar = d1.querySelector("[data-title-bar]");
assert.ok(d1.querySelector("[data-workspace-column]"), "con un solo workspace la columna sigue");
assert.ok(titleBar.classList.contains("pl-[84px]"), "en macOS la franja se aparta del semáforo");
assert.equal(d1.querySelectorAll(".pl-\\[84px\\]").length, 1, "y ninguna otra cabecera reserva su hueco");
assert.equal(d1.querySelector("[data-window-branch]"), null, "la franja no nombra la build");
const estrella = () => titleBar.querySelector("[data-github-star]");
assert.equal(titleBar.lastElementChild.lastElementChild, estrella(), "la invitación a la estrella cierra la franja por la derecha");
assert.equal(estrella().querySelector("button").textContent.trim(), "Star en GitHub");
estrella().querySelector("button").click();
await sleep(50);
assert.deepEqual(estrellas, ["https://github.com/danil-labs/danil"]);
assert.equal(estrella(), null, "abrir el repositorio retira la invitación");
assert.ok(d1.querySelector('[data-workspace-column-foot] button[aria-label="Configuración"]'), "Configuración vive al pie de la columna");
const setupRequests = [];
soloApp.w.addEventListener("harness:new-workspace", () => setupRequests.push(1));
d1.querySelector('[data-workspace-column] button[aria-label="Agregar workspace"]').click();
await sleep(100);
const createOne = [...d1.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent.trim() === "Crear workspace");
assert.ok(createOne, "el «+» ofrece crear uno");
createOne.click();
await sleep(150);
assert.equal(setupRequests.length, 1, "Crear workspace pide el alta desde la columna");
assert.deepEqual(soloApp.failures, []);
/**
 * Ocultar el riel vive a la izquierda de Agentes y Tareas. Oculto, lo trae de vuelta la fila de
 * las pestañas y la fila del título sigue igual. En pantalla completa no hay semáforo que apartar.
 */
const collapsedApp = await boot("listo", "title-bar-collapsed", { ...TASK_AFTER_QUEUE,
  list_workspaces: () => structuredClone(singleWorkspace),
  workspaces_startup: () => structuredClone(singleWorkspace),
  "plugin:window|is_fullscreen": true,
}, MAC);
await sleep(300);
const d2 = collapsedApp.w.document;
const hideRail = d2.querySelector('button[aria-label="Ocultar el historial"]');
assert.equal(hideRail.parentElement.querySelector('button[aria-label="Proyectos"]'), null, "el encabezado del riel no repite «Proyectos»: ya lo dice la sección de abajo");
assert.equal(d2.querySelector("[data-sidebar-search]"), null, "el riel no lleva buscador");
const searchButton = () => d2.querySelector("[data-title-bar] [data-global-search-open]");
assert.equal(searchButton()?.getAttribute("aria-keyshortcuts"), "Meta+K", "la lupa de la franja dice su atajo");
assert.equal(d2.querySelector("[data-title-bar]").classList.contains("pl-[84px]"), false, "en pantalla completa la fila no reserva el semáforo");
hideRail.click();
await sleep(100);
assert.ok(searchButton(), "con el riel oculto, la lupa sigue en la franja");
collapsedApp.w.dispatchEvent(new collapsedApp.w.KeyboardEvent("keydown", { key: "k", code: "KeyK", metaKey: true, bubbles: true }));
await sleep(100);
assert.ok(d2.querySelector("[data-global-search]"), "⌘K abre el buscador");
d2.querySelector('[data-global-search] input[role="combobox"]').dispatchEvent(new collapsedApp.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
await sleep(100);
assert.equal(d2.querySelector("[data-global-search]"), null, "Escape lo cierra");
assert.ok(d2.querySelector('[data-title-bar] button[aria-label="Mostrar el historial"]'), "con el riel oculto, el mismo botón de la franja lo trae de vuelta");
assert.equal(d2.querySelector("[data-window-branch]"), null, "sin título de ventana no se nombra ninguna build");
const ocultarEstrella = d2.querySelector('[data-title-bar] [data-github-star] button[aria-label="Ocultar invitación"]');
assert.ok(ocultarEstrella, "la invitación se puede ocultar sin abrir GitHub");
ocultarEstrella.click();
await sleep(20);
assert.equal(d2.querySelector("[data-github-star]"), null, "la X la retira en esta máquina");
assert.ok(!collapsedApp.commands.includes("site_open_external"));
d2.querySelector('button[aria-label="Mostrar el historial"]').click();
await sleep(100);
assert.ok(d2.querySelector('button[aria-label="Ocultar el historial"]'));
assert.deepEqual(collapsedApp.failures, []);
/**
 * En Windows los tres botones de la ventana cierran la fila del título, una sola vez, con el árbol
 * de trabajo abierto o cerrado. La app de producción no pinta ningún rótulo de build.
 */
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0";
const windowsApp = await boot("listo", "title-bar-windows", { ...TASK_AFTER_QUEUE,
  "plugin:window|title": "Danil",
  check_environment: () => ({ ready: true, blocked: false, reason: null, items: [], bootstrap: [], engineBuild: "0.2.73 b1fed68" }),
  list_dependencies: [],
  list_language_packs: [], list_bundled_language_packs: [],
}, WINDOWS);
await sleep(300);
const d3 = windowsApp.w.document;
const minimizeButton = () => [...d3.querySelectorAll('button[aria-label="Minimizar"]')];
assert.equal(minimizeButton().length, 1, "un solo juego de botones de ventana");
assert.ok(minimizeButton()[0].closest("[data-title-bar]"), "y vive en la fila del título");
assert.equal(d3.querySelector("[data-window-branch]"), null, "la app de producción no nombra su build");
assert.equal(d3.querySelector("[data-title-bar]").classList.contains("pl-[84px]"), false, "fuera de macOS no hay semáforo");
d3.querySelector('[data-sesion="s1"]').click();
await sleep(250);
d3.querySelector('button[aria-label="Archivos de la tarea"]')?.click();
await sleep(300);
assert.ok(d3.querySelector("[data-task-files]"), "el panel de archivos abre");
assert.equal(minimizeButton().length, 1, "con el panel abierto siguen siendo uno");
assert.ok(minimizeButton()[0].closest("[data-title-bar]"));
d3.querySelector('button[aria-label="Configuración"]')?.click();
await sleep(150);
d3.querySelector("#cfg-tab-machines").click();
await sleep(50);
[...d3.querySelectorAll("button")].find((b) => b.textContent.trim() === "Estado del entorno").click();
await sleep(200);
assert.equal(d3.body.textContent.split("Motor 0.2.73 b1fed68").length, 2, "el build del motor aparece una sola vez en Estado del entorno");
assert.deepEqual(windowsApp.failures, []);
/**
 * Un turno vivo sobrevive al cambio de workspace, y su reloj también.
 *
 * La ventana pierde los hilos en memoria y deja de recibir los eventos del
 * cliente anterior. Sin preguntar quién contesta al volver, el rótulo de
 * espera vuelve a cero y un turno que cerró al otro lado se queda pintado
 * como vivo, con la caja en «Detener».
 */
let activeWs = "w";
let inFlight = [];
const crossingSpaces = () => ({ workspaces: [
  { id: "w", name: "Cliente A", context_root: null },
  { id: "w2", name: "Cliente B", context_root: null },
], active: activeWs });
const crossingApp = await boot("listo", 20, { ...TASK_AFTER_QUEUE,
  workspaces_startup: () => crossingSpaces(),
  list_workspaces: () => crossingSpaces(),
  list_projects: () => [{ id: activeWs === "w" ? "pa" : "pb", name: "Proyecto", kind: "folder", working_directory: "/lab", sources: [] }],
  list_live_sessions: () => [task("s1", null, null)],
  load_session: ({ id }) => ({ ...TASK_AFTER_QUEUE.load_session, id, turns: [] }),
  list_live_turns: () => inFlight,
  list_active_turns: () => inFlight.filter((turn) => turn.workspace === activeWs).map((turn) => turn.session),
});
const crossingBody = () => crossingApp.w.document.body.textContent;
const turnClock = () => (crossingBody().match(/·\s([\dms ]+?)\s*(?:Fuentes|$)/) ?? [])[1] ?? null;
const waitingLabel = () => !!crossingApp.w.document.querySelector('[role="status"][aria-label="El agente está trabajando"]');
const moveTo = async (destination) => {
  activeWs = destination;
  crossingApp.w.dispatchEvent(new crossingApp.w.CustomEvent("harness:workspace"));
  await sleep(300);
};
crossingApp.w.document.querySelector('[data-sesion="s1"]').click();
await sleep(250);
crossingApp.emit("chat", { kind: "started", session: "s1", workspace: "w" });
crossingApp.emit("chat", { kind: "delta", session: "s1", workspace: "w", text: "Voy por la mitad" });
await sleep(150);
assert.ok(waitingLabel(), "el turno arranca y el rótulo de espera aparece");
assert.match(crossingBody(), /Voy por la mitad/);
// El turno lleva un minuto largo corriendo cuando se vuelve a mirarlo: es lo
// que el registro del backend sabe y la ventana no puede deducir.
inFlight = [{ session: "s1", workspace: "w", project: "pa", started_at: Date.now() - 95_000 }];
await moveTo("w2");
crossingApp.w.document.querySelector('[data-sesion="s1"]').click();
await sleep(100);
crossingApp.emit("chat", { kind: "delta", session: "s1", workspace: "w", text: " y sigo desde el otro workspace" });
assert.doesNotMatch(crossingBody(), /Voy por la mitad|sigo desde el otro workspace/, "a matching session ID in another workspace cannot share its live transcript");
assert.equal(waitingLabel(), false, "en el otro cliente no se pinta el turno de este");
await moveTo("w");
crossingApp.w.document.querySelector('[data-sesion="s1"]').click();
await sleep(300);
assert.ok(waitingLabel(), "al volver, la tarea sigue contestando");
assert.match(crossingBody(), /Voy por la mitad y sigo desde el otro workspace/, "lo que llegó por eventos mientras se miraba otro cliente no está en disco todavía");
assert.match(turnClock() ?? "", /1m 3\ds/, "el reloj cuenta desde que arrancó el turno, no desde que se repintó");
// Y el cierre que llega mirando el otro cliente: el filtro por workspace lo
// descarta, y la única forma de enterarse es volver a preguntar.
inFlight = [];
await moveTo("w2");
crossingApp.emit("chat", { kind: "done", session: "s1", workspace: "w", ok: true });
await sleep(150);
await moveTo("w");
await sleep(250);
assert.equal(waitingLabel(), false, "un turno que cerró al otro lado deja de decir que trabaja");
assert.deepEqual(crossingApp.failures, []);
const finishCalls = [];
const finishedIds = new Set();
let rejectFinish = true;
let settleFinish;
const finishRows = () => [
  { ...task("merged", null, "delivered"), archived: finishedIds.has("merged") },
  { ...task("child", "merged", "delivered"), subagent: "native-child", archived: finishedIds.has("child") },
  task("saved", null, "delivered"), task("pending", null, null),
  task("local", null, "delivered"), task("local-pending", null, null),
];
const finishApp = await boot("listo", "finish-task", {
  ...TASK_AFTER_QUEUE,
  list_projects: [{ id: "finish-project", name: "Finalización", node: null, sources: [], working_directory: "/lab", created_at: 1, updated_at: 1, sessions: 3, kind: "folder" }],
  list_live_sessions: ({ project }) => project === "finish-project" ? finishRows() : [],
  list_session_git: () => ({
    merged: gitRow("feature/done", { pull: { number: 42, state: "merged", head_sha: "abc" }, pull_known: true }),
    child: gitRow(null, { kind: "unknown", shared_with: "merged" }),
    saved: gitRow(null, { kind: "kn", kn: "saved" }),
    pending: gitRow("feature/pending", { pull: { number: 43, state: "open", head_sha: "abc" }, pull_known: true }),
    local: gitRow("feature/local", { has_remote: false, merged_locally: true }),
    "local-pending": gitRow("feature/local-pending", { has_remote: false }),
  }),
  task_blockers: () => ({ unsaved: [], not_finished: false }),
  finish_task: args => {
    finishCalls.push(args);
    return new Promise((resolve, reject) => {
      settleFinish = () => {
        if (rejectFinish) { reject(new Error("Trabajo pendiente")); return; }
        finishedIds.add(args.id);
        if (args.id === "merged") finishedIds.add("child");
        resolve();
      };
    });
  },
});
const finishButton = id => finishApp.w.document.querySelector(`[data-sesion="${id}"] [data-session-finish]`);
assert.ok(finishButton("merged"));
assert.ok(finishButton("saved"));
assert.equal(finishButton("pending"), null);
assert.ok(finishButton("local"), "Sin remoto, la rama integrada en su base local también se finaliza");
assert.equal(finishButton("local-pending"), null);
assert.ok(!finishButton("merged").closest(".opacity-0"));
finishButton("merged").click();
await sleep(100);
// Sale de la barra en el clic, sin esperar al motor, y el cohete despega en ese
// mismo gesto: si lo rechaza, la fila vuelve con el error.
assert.equal(finishButton("merged"), null);
assert.ok(finishApp.w.document.querySelector("[data-finish-celebration]"), "El cohete sale con la fila, no cuando contesta el motor");
assert.equal(finishCalls.length, 1);
settleFinish();
await sleep(100);
assert.equal(finishButton("merged").getAttribute("aria-busy"), "false");
assert.equal(finishButton("merged").querySelector(".finish-task-flame"), null);
assert.equal(finishButton("merged").disabled, false);
assert.match(finishApp.w.document.body.textContent, /Trabajo pendiente/);
const finishToast = [...finishApp.w.document.querySelectorAll('[role="alert"]')].find(el => el.textContent.includes("Trabajo pendiente"));
assert.ok(finishToast, "El error de finalizar aparece en un toast");
assert.equal(finishToast.closest('[data-sesion]'), null);
finishToast.querySelector("button").click();
await sleep(50);
assert.doesNotMatch(finishApp.w.document.body.textContent, /Trabajo pendiente/);
assert.ok(finishButton("merged"));
assert.equal(finishApp.w.document.querySelector('[role="alertdialog"]'), null);
rejectFinish = false;
// La hija vive bajo su coordinador: el riel no la lista y su botón no está en él.
assert.equal(finishButton("child"), null);
// La barra ya no guarda un grupo de archivadas: la hija finalizada se va del todo.
assert.equal(finishApp.w.document.querySelector('button[aria-label="Desplegar la tarea archivada"]'), null);
finishButton("merged").click();
await sleep(50);
settleFinish();
await sleep(150);
assert.deepEqual(finishCalls, [{ project: "finish-project", id: "merged" }, { project: "finish-project", id: "merged" }]);
// Finalizada, la madre también sale de la barra; lo archivado vive en el historial.
assert.equal(finishApp.w.document.querySelector('[data-sesion="merged"]'), null);
assert.equal(finishApp.w.document.querySelector('button[aria-label="Desplegar la tarea archivada"]'), null);
assert.deepEqual(finishApp.failures, []);

// El sondeo del entorno no puede retener el primer pintado. `Setup` decide
// con `setup_required`, que es un stat; lo caro va detrás y aquí no llega.
const silentApp = await boot("mudo", "entorno-en-segundo-plano");
// `window_ready` sale del `onMount` de `App`: que se haya pedido ES que
// montó. La compuerta en blanco no llega a pintar ni su primer hijo.
assert.ok(silentApp.commands.includes("window_ready"), "la app monta sin esperar al sondeo");
assert.ok(silentApp.w.document.querySelector("#root").children.length > 0);
assert.ok(
  silentApp.commands.includes("setup_required"),
  "y la compuerta es la barata, no el reporte",
);
assert.ok(
  silentApp.commands.includes("check_environment"),
  "el sondeo se sigue pidiendo, solo que nadie lo espera",
);
assert.deepEqual(silentApp.failures, []);

// El primer frame, mientras `setup_required` no contesta. Sin la foto del sidebar
// es «Preparando Terminus»; con ella, a quien ya usa Terminus no le parpadea el alta.
const unanswered = { ...RESPONSES, setup_required: () => new Promise(() => {}) };
const newOne = await mount("listo", "primer-frame-sin-foto", unanswered);
await sleep(100);
assert.equal(newOne.w.document.querySelector("[data-setup-skeleton]")?.dataset.setupSkeleton, "preparing");
assert.ok(newOne.w.document.body.textContent.includes("Preparando Danil"), "sin foto el primer frame no es la preparación");
const sidebarSnapshot = JSON.stringify({ workspace: "w", projects: [], sessions: {}, spaces: [], desk: null });
const known = await mount("listo", "primer-frame-con-foto", unanswered, undefined, {
  "harness:shell-cache": JSON.stringify({ version: 2, last: "w", workspaces: { w: { saved: Date.now(), snapshot: sidebarSnapshot } } }),
});
await sleep(100);
assert.ok(known.w.document.querySelector("#root").children.length > 0, "con foto el primer frame queda en blanco");
assert.ok(!known.w.document.body.textContent.includes("Preparando Danil"), "con foto el alta parpadea a quien ya usa Terminus");
assert.notEqual(known.w.document.querySelector("[data-setup-skeleton]")?.dataset.setupSkeleton, "preparing");
assert.deepEqual([...newOne.failures, ...known.failures], []);

const blockerCalls = [];
const discarded = [];
const blockedFinishes = [];
let blockers = { unsaved: [{ session: "blocked", title: "Tarea blocked", files: ["src/a.ts"] }], not_finished: false };
const blockedApp = await boot("listo", "task-blockers", {
  ...TASK_AFTER_QUEUE,
  list_projects: [{ id: "blocked-project", name: "Avisos", node: null, sources: [], working_directory: "/lab", created_at: 1, updated_at: 1, sessions: 1, kind: "folder" }],
  list_live_sessions: ({ project }) => project === "blocked-project" ? [task("blocked", null, "delivered"), task("sin-integrar", null, "delivered")] : [],
  list_session_git: () => ({
    blocked: gitRow("feature/done", { pull: { number: 44, state: "merged", head_sha: "abc" }, pull_known: true }),
    "sin-integrar": gitRow("feature/otra", { pull: { number: 45, state: "merged", head_sha: "abc" }, pull_known: true }),
  }),
  task_blockers: args => { blockerCalls.push(args); return blockers; },
  discard_task_changes: args => {
    discarded.push(args);
    // La primera vez apareció un archivo con el aviso abierto; la segunda ya no queda nada.
    blockers = discarded.length === 1
      ? { unsaved: [{ session: "blocked", title: "Tarea blocked", files: ["llego-despues.txt"] }], not_finished: false }
      : { unsaved: [], not_finished: false };
    return null;
  },
  finish_task: args => { blockedFinishes.push(args); return null; },
});
const blockedFinish = () => blockedApp.w.document.querySelector('[data-sesion="blocked"] [data-session-finish]');
assert.ok(blockedFinish());
blockedFinish().click();
await sleep(100);
assert.deepEqual(blockerCalls, [{ project: "blocked-project", id: "blocked", finish: true }]);
assert.deepEqual(blockedFinishes, [], "no se mata un turno ni se toma un candado antes de que la persona decida");
const changesNotice = blockedApp.w.document.querySelector('[role="dialog"]');
assert.ok(changesNotice, "los cambios sin guardar avisan, no dan error");
assert.match(changesNotice.textContent, /src\/a\.ts/, "el aviso nombra el archivo que estorba");
const discardButton = [...changesNotice.querySelectorAll("button")].find(b => b.textContent.trim() === "Descartar y continuar");
assert.ok(discardButton, "el aviso lleva la salida, y borrar se pide explícitamente");
discardButton.click();
await sleep(150);
assert.deepEqual(discarded, [{ project: "blocked-project", id: "blocked", files: ["src/a.ts"] }], "se descarta solo lo que el aviso enseñó");
assert.deepEqual(blockedFinishes, [], "lo que apareció con el aviso abierto para el gesto");
const noticeAgain = blockedApp.w.document.querySelector('[role="dialog"]');
assert.ok(noticeAgain, "lo nuevo se enseña en el aviso, no en un error plegado");
assert.match(noticeAgain.textContent, /llego-despues\.txt/);
assert.doesNotMatch(noticeAgain.textContent, /src\/a\.ts/);
[...noticeAgain.querySelectorAll("button")].find(b => b.textContent.trim() === "Descartar y continuar").click();
await sleep(150);
assert.deepEqual(discarded.at(-1), { project: "blocked-project", id: "blocked", files: ["llego-despues.txt"] });
assert.deepEqual(blockedFinishes, [{ project: "blocked-project", id: "blocked" }]);
assert.equal(blockedApp.w.document.querySelector('[role="dialog"]'), null);
// Finalizada, sale de la barra y no vuelve: el siguiente aviso va en otra tarea.
assert.equal(blockedFinish(), null);
blockers = { unsaved: [], not_finished: true };
blockedApp.w.document.querySelector('[data-sesion="sin-integrar"] [data-session-finish]').click();
await sleep(100);
const unintegratedNotice = blockedApp.w.document.querySelector('[role="dialog"]');
assert.ok(unintegratedNotice);
assert.equal([...unintegratedNotice.querySelectorAll("button")].find(b => b.textContent.trim() === "Descartar y continuar"), undefined,
  "una rama sin integrar no la arregla borrar archivos");
assert.ok([...unintegratedNotice.querySelectorAll("button")].some(b => b.textContent.trim() === "Archivar tarea"),
  "y la salida que sí conserva el trabajo se ofrece ahí");
assert.deepEqual(blockedFinishes.length, 1);
assert.deepEqual(blockedApp.failures, []);

const localPath = "/Users/prueba/Library/Application Support/Terminus/exchange/finalizar-tarea.html";
const localPreviews = [];
const localLinks = await boot("listo", "local-file-links", {
  ...TASK_AFTER_QUEUE,
  load_session: {
    ...TASK_AFTER_QUEUE.load_session,
    turns: [{ role: "assistant", text: `[**Abrir mockup HTML**](<${localPath}>)\n\n[No ejecutar](javascript:alert%281%29)` }],
  },
  preview_file: (args) => {
    localPreviews.push(args);
    return { ...RESPONSES.preview_file, rel: args.rel };
  },
  artifact_history: () => Promise.reject("artifacts.history.not_in_workspace"),
});
localLinks.w.document.querySelector('[data-sesion="s1"]')?.click();
await sleep(150);
const localButton = [...localLinks.w.document.querySelectorAll("button, a")]
  .find(el => el.textContent.trim() === "Abrir mockup HTML");
assert.ok(localButton, "El enlace local debe conservar un control para abrirlo");
assert.equal(localButton.tagName, "BUTTON", "El menú nativo no debe navegar a una ruta local");
assert.equal(localPreviews.length, 0, "El archivo no se lee antes del clic");
assert.ok(![...localLinks.w.document.querySelectorAll("button, a")]
  .some(el => el.textContent.trim() === "No ejecutar"));
localButton.click();
await sleep(150);
assert.deepEqual(localPreviews, [{ path: localPath, rel: localPath }]);
assert.ok([...localLinks.w.document.querySelectorAll(':is([role="tab"], [data-preview-header] [role="button"])')]
  .some(el => el.textContent.trim() === "finalizar-tarea.html"));
assert.ok(localLinks.w.document.querySelector(".preview-path"));
assert.ok(!localLinks.commands.includes("open_external"));
assert.ok(!localLinks.commands.includes("site_open"));
assert.deepEqual(localLinks.failures, []);
assert.ok(!localLinks.commands.includes("artifact_history"),
  "un archivo fuera de la carpeta de la tarea no tiene cadena de versiones que leer");
assert.doesNotMatch(localLinks.w.document.body.textContent, /historial de este documento/);

const codeLinks = await boot("listo", "local-file-links-code", {
  ...TASK_AFTER_QUEUE,
  list_task_trees: [{ key: "work", name: "lab", path: "/lab", kind: "git", branch: "dev", missing: false, dirty_before: null }],
  load_session: {
    ...TASK_AFTER_QUEUE.load_session,
    turns: [{ role: "assistant", text: `[Afuera](<${localPath}>) · [Adentro](</lab/public/landing.html>)` }],
  },
  preview_file: (args) => ({ ...RESPONSES.preview_file, kind: "html", text: "<h1>Hola</h1>", rel: args.rel }),
  tree_show: { kind: "text", text: "<h1>Hola</h1>\n", data_url: null, bytes: 15, truncated: false },
  tree_patch: "",
  artifact_history: () => Promise.reject("artifacts.history.not_in_workspace"),
});
codeLinks.w.document.querySelector('[data-sesion="s1"]')?.click();
await sleep(150);
const buttonEl = (textValue) => [...codeLinks.w.document.querySelectorAll("button")].find(el => el.textContent.trim() === textValue);
keepActiveView(codeLinks);
buttonEl("Afuera").click();
await sleep(200);
const codeView = () => codeLinks.w.document.querySelector('[role="group"][aria-label="Cómo se ve el archivo"]');
assert.ok(codeView(), "en una tarea de código, un archivo de fuera abre en la vista de código");
assert.equal(codeLinks.w.document.querySelector(".preview-path"), null);
// La conversación solo está montada mientras se ve. Se vuelve a su pestaña para pulsar el otro enlace.
[...codeLinks.w.document.querySelectorAll(':is([role="tab"], [data-preview-header] [role="button"])')].find((el) => el.textContent.includes("Una tarea"))?.click();
await sleep(150);
buttonEl("Adentro").click();
await sleep(200);
assert.ok(codeLinks.commands.includes("tree_show"), "un archivo dentro del repositorio abre en su árbol, donde se escribe");
assert.ok(!codeLinks.commands.includes("artifact_history"));
assert.doesNotMatch(codeLinks.w.document.body.textContent, /historial de este documento/);
assert.deepEqual(codeLinks.failures, []);

/**
 * El primer arranque sin workspace: nace «Personal», se conecta una IA por los
 * eventos de su login, una de clave abre su panel y «Personaliza» renombra en
 * su sitio antes de entrar a la app.
 */
let setupActive = null;
const setupCreated = [];
const setupRenames = [];
const setupKeys = [];
let setupSession = false;
const setupSpaces = () => ({
  workspaces: setupActive ? [{ id: "n", name: "Personal", context_root: null }] : [],
  active: setupActive,
  migrations: [],
});
const setupApp = await boot("listo", "alta", {
  ...RESPONSES,
  list_workspaces: setupSpaces,
  workspaces_startup: setupSpaces,
  list_language_packs: [], list_bundled_language_packs: [],
  list_providers: [
    { id: "codex", label: "Codex", available: true, sin_cuenta: false, source: "del sistema", system_broken: false, api_key: null, inferencia: "con_cuenta" },
    { id: "grok", label: "Grok", available: true, sin_cuenta: false, source: null, system_broken: false, api_key: "https://console.x.ai", inferencia: "con_cuenta" },
  ],
  list_surfaces: [],
  add_workspace: ({ name }) => { setupCreated.push(name); return { id: "n", name }; },
  set_active_workspace: ({ id }) => { setupActive = id; },
  set_workspace_language: null,
  rename_workspace: ({ id, name }) => { setupRenames.push(name); return { id, name }; },
  list_accounts: ({ provider: agent }) => ({
    provider: agent, env_var: "", shared_credential: null, secret_note: null, active: null,
    accounts: agent === "codex" && setupSession
      ? [{ id: "a1", label: "", created_at: 1, identity: "yo@norte.mx", authenticated_at: 2 }]
      : [],
  }),
  add_account: ({ provider: agent }) => ({ id: agent === "codex" ? "a1" : "k1", label: "", created_at: 1, identity: null, authenticated_at: null }),
  login_account: null,
  set_api_key: ({ key }) => { setupKeys.push(key); },
  connect_api_key: ({ provider, key }) => { setupKeys.push(key); return { id: `k-${provider}`, label: "", created_at: 1, identity: null, authenticated_at: 1 }; },
  account_status: ({ id }) => ({ id, authenticated: id === "a1", detail: "" }),
  set_active_account: () => { setupSession = true; },
  discard_account: true,
  list_git_hosts: [],
  list_known_mcp: [],
  list_mcp_providers: [],
  list_integrations: { workspace: "n", plugins: [] },
});
const setupDoc = setupApp.w.document;
const setupTitle = () => setupDoc.querySelector("h1")?.textContent?.trim();
const setupButton = (textValue) => [...setupDoc.querySelectorAll("button")].find((b) => b.textContent?.trim() === textValue);
await sleep(500);
assert.equal(setupTitle(), "Conecta tu cuenta de Danil", "sin workspace el alta pregunta primero por la cuenta");
assert.deepEqual(setupCreated, [], "nada se crea antes de responder");
setupDoc.querySelector("[data-account-welcome-local]").click();
await sleep(500);
assert.equal(setupTitle(), "Conecta tu IA.", "sin cuenta el alta sigue conectando la IA");
assert.deepEqual(setupCreated, ["Personal"], "el workspace por omisión se llama Personal");
assert.ok(setupDoc.body.textContent.includes("Encontramos en tu computadora"), "lo instalado en el sistema va arriba");
assert.ok(setupButton("Continuar")?.disabled, "sin una IA conectada no se avanza");
setupButton("Conectar").click();
await sleep(80);
setupApp.emit("account", { account: "a1", kind: "done", text: "" });
await sleep(150);
assert.ok(setupDoc.body.textContent.includes("yo@norte.mx"), setupDoc.body.textContent.slice(0, 800));
assert.ok(!setupButton("Continuar")?.disabled, "con Codex conectado se puede seguir");
setupButton("Conectar").click();
await sleep(80);
const setupKey = setupDoc.querySelector('input[type="password"]');
assert.ok(setupKey, "una IA de clave abre su panel en la tarjeta");
setupKey.value = "xai-123456789012";
setupKey.dispatchEvent(new setupApp.w.InputEvent("input", { bubbles: true }));
await sleep(20);
[...setupDoc.querySelectorAll("button")].filter((b) => b.textContent?.trim() === "Conectar").at(-1).click();
await sleep(150);
assert.deepEqual(setupKeys, ["xai-123456789012"]);
setupButton("Continuar").click();
await sleep(150);
assert.equal(setupTitle(), "Personaliza Danil.");
const setupName = setupDoc.querySelector('input[aria-label="Workspace"]');
setupName.value = "Norte";
setupName.dispatchEvent(new setupApp.w.InputEvent("input", { bubbles: true }));
setupName.dispatchEvent(new setupApp.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
await sleep(80);
assert.deepEqual(setupRenames, ["Norte"], "el nombre se cambia en su sitio");
setupButton("Empezar").click();
await sleep(200);
assert.ok(!setupDoc.body.textContent.includes("Personaliza Danil."), "empezar entra a la app");
assert.deepEqual(setupCreated, ["Personal"], "el alta no crea otro workspace");
assert.deepEqual(setupApp.failures, []);

// Los árboles montados conservan sus relojes: el proceso no termina solo.
process.exit(0);
