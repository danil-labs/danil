#!/usr/bin/env node
/** El riel: filas de git, cierre con turnos vivos, selección, grupos, recientes y clonado. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cause, sleep } from "../../tests/helpers/jsdom-app.mjs";
import { TASK_AFTER_QUEUE, UNGROUPED, openAddProject, openFromSearch, boot, bootByFolder, searchWindow, gitRow, keepActiveView, mount, task } from "../../tests/helpers/mount-guard.mjs";

let gitLocalCalls = 0;
// Cada árbol montado antes conserva sus relojes y llama a ESTE stub: su
// `invoke` resuelve `window.__TAURI_INTERNALS__` contra el global de ahora.
// Se cuenta lo que nace de cada gesto, o sus tics entran en la cuenta.
let gitDeltaCalls = 0;
let rejectGit = false;
let releaseRemote;
let blockRemote = true;
let gitRows = {
  p: gitRow("feature/parent", { pull: { number: 12, state: "merged", head_sha: "old" }, pull_known: true }),
  shared: gitRow("feature/parent", { shared_with: "p" }),
  own: gitRow("feature/child", { pull: { number: 13, state: "draft", head_sha: "abc" }, pull_known: true }),
  local: gitRow(null, { kind: "none" }),
  native: gitRow(null, { kind: "unknown" }),
};
const vocabulary = (id, prefix) => ({ change: { clave: `providers.${id}.change` }, change_short: { clave: `providers.${id}.change_short` },
  change_prefix: prefix, checks: { clave: `providers.${id}.checks` } });
const sidebarResponses = { ...TASK_AFTER_QUEUE,
  list_git_hosts: [{ id: "github", name: "GitHub", connected: null, summary: { clave: "providers.github.summary" }, vocabulary: vocabulary("github", "#") },
    { id: "gitlab", name: "GitLab", connected: null, summary: { clave: "providers.gitlab.summary" }, vocabulary: vocabulary("gitlab", "!") }],
  list_live_sessions: [task("p", null, "delivered"), task("shared", "p", null), task("own", "p", "failed"), task("local", "p", null), { ...task("native", "p", null), title: "/root/prueba_sidebar", subagent: "native-id" }],
  list_session_git: ({ remote }) => { if (!remote) { gitLocalCalls++; if (cause.getStore() === "delta") gitDeltaCalls++; } if (remote && blockRemote) return new Promise(resolve => { releaseRemote = resolve; }); return rejectGit ? Promise.reject(new Error("offline")) : structuredClone(gitRows); },
};
const sidebar = await boot("listo", 4, sidebarResponses);
const row = id => sidebar.w.document.querySelector(`[data-sesion="${id}"]`);
// La fila del riel dice el PR; la rama y el resto van en su `title` y en la tarjeta flotante.
const rowGit = id => row(id)?.querySelector("[data-session-pr]")?.getAttribute("title") ?? "";
assert.match(row("p").textContent, /Tarea p.*#12/s);
assert.match(rowGit("p"), /feature\/parent.*#12/);
assert.ok(row("p").querySelector('[data-session-pr] svg.lucide-git-branch'));
assert.equal(row("p").querySelector('[aria-label="Resultado entregado"]'), null,
  "el fallo delegado tiene prioridad sobre la entrega del coordinador en el indicador común");
assert.equal(row("own"), null, "la delegación no llena el sidebar");
assert.equal(row("p").querySelectorAll('[aria-label="Fallo o interrupción"]').length, 1,
  "una subtarea fallida ocupa el único indicador del coordinador");
// El riel no lista las subtareas; el buscador global sí las encuentra.
await searchWindow(sidebar, "Tarea");
for (const childTask of ["own", "shared", "local"]) {
  assert.ok(sidebar.w.document.querySelector(`[data-global-search] [data-search-key="task:${childTask}"]`), "la búsqueda conserva acceso a las subtareas");
}
sidebar.w.document.querySelector('[data-global-search] input[role="combobox"]').dispatchEvent(new sidebar.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
await sleep(80);
assert.equal(row("own"), null);
assert.equal(row("p").querySelectorAll('[aria-label="Fallo o interrupción"]').length, 1,
  "buscar conserva el único estado común del coordinador");
assert.equal(row("p").querySelector('[aria-label="Resultado entregado"]'), null);
blockRemote = false; releaseRemote(gitRows); await sleep(100);
gitRows.shared = gitRow("feature/parent", { shared_with: "p", pull_known: true });
gitRows.p = gitRow("renamed", { pull: { number: 12, state: "merged", head_sha: "abc" }, pull_known: true });
sidebarResponses.list_live_sessions = sidebarResponses.list_live_sessions.map(s => ({ ...s, updated_at: 2 }));
sidebar.emit("session", { project: "", session: "p", workspace: "w" });
await sleep(350);
assert.match(rowGit("p"), /renamed/);
assert.ok(row("p").querySelector('.text-brand-purple > svg.lucide-git-merge'));
assert.doesNotMatch(row("p").textContent, /HEAD distinto/);
rejectGit = true;
sidebar.w.dispatchEvent(new sidebar.w.Event("focus"));
await sleep(100);
assert.match(rowGit("p"), /renamed.*#12/);
assert.doesNotMatch(row("p").textContent, /obsoleta|Integrado/);
assert.equal(row("p").querySelector('svg.lucide-clock'), null);
assert.match(row("p").innerHTML, /Último estado conocido/);
assert.ok(row("p").querySelector(".text-neutral-500 > svg.lucide-git-merge"));
rejectGit = false;
gitRows.p = gitRow(null, { kind: "none" });
sidebar.w.dispatchEvent(new sidebar.w.Event("focus"));
await sleep(100);
assert.equal(row("p").querySelector("[data-session-git]"), null);
const revision = createHash("sha256").update("0:reply:Respuesta nueva").digest("hex");
sidebarResponses.load_session = ({ id }) => ({ ...TASK_AFTER_QUEUE.load_session, id, turns: [{ role: "agent", id: "reply", text: "Respuesta nueva" }] });
sidebarResponses.list_live_sessions = sidebarResponses.list_live_sessions.map(s => ({ ...s, result_revision: revision }));
let focused = false;
sidebar.w.document.hasFocus = () => focused;
sidebar.emit("session", { project: "", session: "p", workspace: "w" });
await sleep(350);
assert.equal(row("p").querySelector('[aria-label="Respuesta nueva sin leer"]'), null);
assert.ok(row("p").querySelector('[aria-label="Fallo o interrupción"]'),
  "una respuesta del coordinador no oculta el fallo pendiente de su subtarea");
assert.equal(row("p").querySelector('svg.lucide-mail'), null);
row("p").click();
await sleep(160);
const tab = id => [...sidebar.w.document.querySelectorAll(':is([role="tab"], [data-preview-header] [role="button"])')].find(el => el.textContent.includes(id === "native" ? "prueba sidebar" : `Tarea ${id}`));
assert.doesNotMatch(tab("p").getAttribute("aria-label"), /sin leer/);
assert.equal(tab("p").querySelector("svg.lucide-git-branch"), null);
focused = true;
sidebar.w.dispatchEvent(new sidebar.w.Event("focus"));
await sleep(120);
assert.doesNotMatch(tab("p").getAttribute("aria-label"), /sin leer/);
assert.ok(row("p").querySelector('[aria-label="Fallo o interrupción"]'),
  "ver el resultado del coordinador conserva la atención delegada");
sidebar.emit("chat", { kind: "done", project: "", session: "p", workspace: "w", ok: true });
sidebar.emit("chat", { kind: "done", project: "", session: "p", workspace: "w", ok: true });
await sleep(150);
assert.doesNotMatch(tab("p").getAttribute("aria-label"), /sin leer/);
keepActiveView(sidebar);
await openFromSearch(sidebar, "Tarea own", "own");
assert.ok(tab("own").querySelector('[aria-label="Fallo o interrupción"] .signal-dot[data-tone="error"]'));
assert.ok(tab("own").querySelector("svg.lucide-git-pull-request-draft"));
assert.equal(tab("own").querySelector("svg.lucide-git-pull-request"), null);
assert.match(tab("own").title, /feature\/child.*#13/);
await openFromSearch(sidebar, "Tarea shared", "shared");
assert.ok(tab("shared").querySelector("svg.lucide-git-branch"));
assert.match(tab("shared").title, /compartidas con la tarea padre/);
await openFromSearch(sidebar, "prueba", "native");
assert.equal(tab("native").querySelector("svg.lucide-git-branch"), null);
assert.doesNotMatch(tab("native").textContent, /\/root\//);
assert.doesNotMatch(tab("native").title, /feature\/parent|compartidas/);
gitRows.p = gitRow("feature/parent", { pull: { number: 12, state: "merged", head_sha: "old" }, pull_known: true });
sidebar.w.dispatchEvent(new sidebar.w.Event("focus"));
await sleep(100);
assert.ok(tab("p").querySelector("svg.lucide-git-branch"));
assert.match(tab("p").title, /HEAD distinto/);
rejectGit = true;
sidebar.w.dispatchEvent(new sidebar.w.Event("focus"));
await sleep(100);
assert.ok(tab("p").querySelector("svg.lucide-git-branch"));
assert.equal(tab("p").querySelector("svg.lucide-git-pull-request"), null);
assert.doesNotMatch(tab("p").title, /obsoleta|Integrado/);
rejectGit = false;
for (const [state, icon, color] of [
  ["open", "git-pull-request", "text-success-strong"],
  ["draft", "git-pull-request-draft", "text-neutral-500"],
  ["closed", "git-pull-request-closed", "text-error-strong"],
  ["merged", "git-merge", "text-brand-purple"],
]) {
  gitRows.p = gitRow("feature/parent", { pull: { number: 12, state, head_sha: "abc" }, pull_known: true });
  sidebar.w.dispatchEvent(new sidebar.w.Event("focus"));
  await sleep(100);
  for (const surface of [row("p"), tab("p")]) {
    assert.ok(surface.querySelector(`.${color} > svg.lucide-${icon}`), state);
    assert.equal(surface.querySelectorAll(`svg.lucide-${icon}`).length, 1);
    assert.equal(surface.querySelector("svg.lucide-clock"), null);
  }
  assert.doesNotMatch(row("p").textContent, /PR abierto|Borrador|Cerrado|Integrado/);
}
for (const [kn, icon, color, label] of [
  ["clean", "file", "text-neutral-500", /Sin cambios/],
  ["draft", "file-pen-line", "text-neutral-500", /Borrador sin guardar/],
  ["saved", "file-check", "text-brand-purple", /Guardado en la carpeta/],
]) {
  gitRows.p = gitRow(null, { kind: "kn", kn, alias: "cone-260911" });
  sidebar.w.dispatchEvent(new sidebar.w.Event("focus"));
  await sleep(100);
  assert.ok(tab("p").querySelector(`.${color} > svg.lucide-${icon}`), kn);
  for (const surface of [row("p"), tab("p")]) assert.equal(surface.querySelector("svg.lucide-git-branch"), null);
  // Git/kn conserva su sección y color; el detalle queda en la etiqueta.
  assert.ok(row("p").querySelector(`[data-session-pr].${color} svg.lucide-${icon}`), kn);
  if (kn === "draft") {
    assert.match(rowGit("p"), /Cone/);
    assert.doesNotMatch(row("p").querySelector("[data-session-pr]").textContent, /Cone/);
  }
  assert.match(tab("p").title, label);
}
gitRows.p = gitRow(null, { kind: "kn", kn: "draft", alias: "gbsxhmdk" });
sidebar.w.dispatchEvent(new sidebar.w.Event("focus"));
await sleep(100);
assert.match(rowGit("p"), /gbsxhmdk/);
assert.doesNotMatch(row("p").textContent, /desconocido/);
// La pestaña lleva checks y revisión; la tarjeta del riel, UNA señal por
// prioridad: cambios pedidos › checks que fallan › en curso › aprobado › en verde.
for (const [checks, review, visible, overrides, signal] of [
  ["success", "approved", true, {}, "approved"],
  ["pending", "changes_requested", true, {}, "changes_requested"],
  ["failure", "approved", true, {}, "failure"],
  ["pending", "approved", true, {}, "pending"],
  ["success", "unreviewed", true, {}, "success"],
  ["success", "approved", true, { state: "draft" }, null],
  ["unknown", "unknown", false, {}, null],
  ["none", "unreviewed", false, {}, null],
  ["success", "approved", false, { head_sha: "old" }, null],
  ["success", "approved", false, { state: "merged" }, null],
  ["success", "approved", false, { state: "closed" }, null],
  ["success", "approved", true, { stale: true }, "stale"],
]) {
  const { stale = false, ...pullOverrides } = overrides;
  gitRows.p = gitRow("feature/parent", { pull: { number: 12, state: "open", head_sha: "abc", checks, review, ...pullOverrides }, pull_known: true, stale });
  sidebar.w.dispatchEvent(new sidebar.w.Event("focus"));
  await sleep(100);
  const surface = tab("p");
  // Sin revisión registrada la pestaña no pinta ícono de revisión.
  const reviewVisible = visible && (review === "approved" || review === "changes_requested");
  assert.equal(!!surface.querySelector("[data-git-checks]"), visible, JSON.stringify(overrides));
  assert.equal(!!surface.querySelector("[data-git-review]"), reviewVisible, JSON.stringify({ review, ...overrides }));
  if (visible) {
    assert.ok(surface.querySelector(`[data-git-checks="${checks}"]`));
    if (reviewVisible) assert.ok(surface.querySelector(`[data-git-review="${review}"]`));
  }
  const signals = [...row("p").querySelectorAll("[data-session-pr] [data-git-signal]")].map((el) => el.dataset.gitSignal);
  assert.deepEqual(signals, signal ? [signal] : [], `${checks}/${review} ${JSON.stringify(overrides)}`);
  assert.equal(row("p").querySelector("[data-git-checks], [data-git-review]"), null, "la tarjeta no repite las dos señales");
  if (signal === "pending") {
    assert.ok(row("p").querySelector('[data-git-signal="pending"] svg.lucide-circle-dashed'), "checks pendientes: el círculo punteado de la flotante");
    assert.equal(row("p").querySelector("[data-session-pr] svg[data-spinner]"), null, "el único loader de la tarjeta es el de «trabajando»");
  }
  if (signal === "stale") {
    assert.ok(row("p").querySelector('[data-git-signal="stale"] svg.lucide-clock'), "desactualizado: solo el reloj");
    assert.ok(row("p").querySelector("[data-session-pr].text-neutral-500"), "desactualizado: el chip entero en gris");
  }
  assert.equal(!!row("p").querySelector("[data-session-pr] [data-pr-number].text-error-strong"), signal === "failure", "el número va en rojo si los checks fallan");
  if (stale) {
    assert.match(tab("p").title, /Último estado conocido/);
    assert.ok(tab("p").querySelector('[data-git-checks].text-neutral-500[data-git-stale]'));
  }
  if (overrides.head_sha) assert.match(tab("p").title, /otro commit/);
  if (checks === "unknown") assert.match(tab("p").title, /Comprobaciones: sin dato/);
  if (overrides.state === "draft") assert.ok(tab("p").querySelector('.text-neutral-500 > svg.lucide-git-pull-request-draft'));
}
// GitLab nombra lo suyo: `!12`, «Pipeline» y «MR», dichos por el motor.
gitRows.p = gitRow("feature/parent", { pull: { git_host: "gitlab", number: 12, state: "merged", head_sha: "abc", checks: "success", review: "approved" }, pull_known: true });
sidebar.w.dispatchEvent(new sidebar.w.Event("focus"));
await sleep(100);
assert.match(tab("p").title, /MR integrado/);
assert.match(tab("p").title, /!12/);
assert.doesNotMatch(tab("p").title, /#12/);
gitRows.p = gitRow("feature/parent", { pull: { number: 12, state: "merged", head_sha: "abc" }, pull_known: true });
sidebar.w.dispatchEvent(new sidebar.w.Event("focus"));
await sleep(100);
sidebar.emit("chat", { kind: "started", session: "p", workspace: "w" });
await sleep(100);
const workingDot = tab("p").querySelector('.signal-dot[data-tone="working"]');
assert.ok(workingDot);
assert.ok([...workingDot.classList].every((name) => !name.includes("animate")), "the working indicator stays visible without blinking");
assert.equal(row("p").querySelectorAll("[data-task-orbit]").length, 1, "una tarea sin encargado conserva identidad con órbita");
assert.equal(row("p").querySelector('[data-task-orbit] [data-session-agent]'), null, "sin encargado no hay una cara inventada");
assert.equal(row("p").querySelectorAll('[data-task-orbit] svg:not([data-spinner])').length, 0, "sin encargado el centro queda vacío");
assert.equal(row("p").querySelectorAll('[data-session-preview] [data-session-provider]').length, 1, "el proveedor conserva su sección fija debajo");
assert.equal(tab("p").querySelector("svg[data-spinner]"), null);
sidebar.emit("question", { session: "p", workspace: "w", turno: "question-turn", preguntas: [{ id: "choose", question: "¿Qué opción?", options: [], free_text: true }] });
await sleep(100);
assert.match(tab("p").getAttribute("aria-label"), /Te preguntó algo/);
assert.ok(row("p").querySelector('[data-session-status] [aria-label="Te preguntó algo"]'));
assert.ok(tab("p").querySelector("svg.lucide-git-merge"));
assert.equal(tab("p").querySelector("svg[data-spinner]"), null);
assert.equal(tab("p").querySelector("svg.lucide-git-branch"), null);
// Un delta del chat no refresca git. Se cuenta lo que nace del delta y no lo
// que cae en una ventana de tiempo: el refresco que deja «started» al
// repriorizar aterriza cuando la máquina puede, y ninguna ventana lo esquiva.
// La espera previa deja a git sin nada en vuelo: un refresco del delta con
// una llamada en curso se pegaría a su `pending` y saldría de otra cadena.
for (let locales = -1; locales !== gitLocalCalls; ) {
  locales = gitLocalCalls;
  await sleep(150);
}
cause.run("delta", () => sidebar.emit("chat", { kind: "delta", session: "p", workspace: "w", text: "Sigue trabajando" }));
await sleep(200);
assert.equal(gitDeltaCalls, 0, "un delta del chat no refresca git");
assert.deepEqual(sidebar.failures, []);
assert.equal(sidebar.w.document.querySelector("[data-project-sessions]"), null);
for (const modifier of ["metaKey", "ctrlKey", "native"]) {
  row("p").click();
  await sleep(100);
  keepActiveView(sidebar);
  assert.equal(tab("p").getAttribute("aria-selected"), "true");
  const beforeClose = sidebar.commands.length;
  if (modifier === "native") sidebar.emit("close-tab", null);
  else {
    const key = new sidebar.w.KeyboardEvent("keydown", { key: "w", [modifier]: true, bubbles: true, cancelable: true });
    sidebar.w.document.querySelector("textarea").dispatchEvent(key);
    assert.equal(key.defaultPrevented, true);
  }
  await sleep(100);
  assert.equal(tab("p"), undefined);
  assert.ok(row("p"));
  assert.equal(sidebar.commands.slice(beforeClose).some(c => ["request_close", "stop_turn", "delete_session"].includes(c)), false);
}
// Cerrar nunca cancela; salir usa el motor conectado y conserva el cliente ante errores.
{
  let liveOnes = [];
  let listError = false;
  let stopError = false;
  let stopScope;
  const closingApp = await boot("listo", "cierre-con-vivos", {
    ...TASK_AFTER_QUEUE,
    list_live_turns: () => listError ? Promise.reject(new Error("list failed")) : liveOnes,
    pending_requests: () => ({ questions: [], permissions: [{ id: "durable-r", revision: 1, request_id: "r", tool: "Write", target: "hola.txt" }] }),
    stop_turn: (_args, options) => {
      stopScope = options?.headers?.["x-terminus-workspace"];
      return stopError ? Promise.reject(new Error("stop failed")) : null;
    },
    quit_completely: null,
    window_to_background: null,
    tray_update: null,
    tray_notify: null,
  });
  closingApp.w.localStorage.setItem("harness.layout.close.live_turns", JSON.stringify("stop"));
  closingApp.emit("close-requested", null);
  await sleep(100);
  assert.ok(closingApp.commands.includes("window_to_background"), "cerrar sin agentes conserva el cliente");
  assert.equal(closingApp.commands.includes("quit_completely"), false);
  liveOnes = [{ session: "p", workspace: "otro", project: "q", started_at: Date.now() }];
  const beforeImport = closingApp.commands.length;
  closingApp.emit("close-requested", null);
  await sleep(150);
  assert.equal(closingApp.w.document.querySelector("[data-close-guard]"), null);
  assert.ok(closingApp.commands.slice(beforeImport).includes("window_to_background"));
  assert.equal(closingApp.commands.slice(beforeImport).includes("stop_turn"), false, "la preferencia antigua no cancela al cerrar");
  closingApp.emit("tray-quit", null);
  closingApp.emit("tray-quit", null);
  await sleep(150);
  const dialog = () => closingApp.w.document.querySelector("[data-close-guard]");
  const button = (text) => [...dialog().querySelectorAll("button")].find(b => b.textContent.includes(text));
  assert.ok(dialog(), "salir explícitamente pregunta por las tareas del cliente");
  assert.match(dialog().textContent, /espera tu respuesta/);
  assert.equal(closingApp.commands.includes("quit_completely"), false);
  stopError = true;
  button("Detenerlas y salir").click();
  await sleep(150);
  assert.equal(stopScope, "otro", "la parada conserva el workspace del turno");
  assert.ok(dialog());
  assert.match(dialog().textContent, /No se pudo completar la salida/);
  assert.equal(closingApp.commands.includes("quit_completely"), false, "una parada fallida no cierra el cliente");
  button("Cancelar").click();
  listError = true;
  const beforeFailure = closingApp.commands.length;
  closingApp.emit("tray-quit", null);
  await sleep(150);
  assert.ok(dialog(), "una consulta fallida se muestra dentro del diálogo");
  assert.equal(closingApp.commands.slice(beforeFailure).includes("quit_completely"), false);
  button("Seguir en segundo plano").click();
  await sleep(150);
  assert.equal(dialog(), null);
  assert.ok(closingApp.commands.slice(beforeFailure).includes("window_to_background"));
  listError = false;
  stopError = false;
  closingApp.emit("tray-quit", null);
  await sleep(150);
  button("Detenerlas y salir").click();
  await sleep(150);
  assert.equal(closingApp.commands.filter(c => c === "quit_completely").length, 1);
  assert.deepEqual(closingApp.failures, []);
  closingApp.w.close();
  const idle = await boot("listo", "salir-sin-turnos", { ...TASK_AFTER_QUEUE, tray_update: null, quit_completely: null });
  idle.emit("tray-quit", null);
  idle.emit("tray-quit", null);
  await sleep(150);
  assert.equal(idle.commands.filter(c => c === "quit_completely").length, 1);
  assert.equal(idle.commands.includes("stop_turn"), false);
  assert.deepEqual(idle.failures, []);
  idle.w.close();
}
// Abrir una tarea que ya contestaba con una herramienta en curso lanzaba
// «Stale read from <Match>» en el hilo; Solid abortaba esa actualización
// y la fila abierta de la barra se quedaba marcada para siempre.
const selectionApp = await boot("listo", "seleccion-viva", {
  ...TASK_AFTER_QUEUE,
  list_live_sessions: [task("viva", null, null), task("otra", null, null)],
  list_session_git: {},
  load_session: ({ id }) => ({ ...TASK_AFTER_QUEUE.load_session, id, turns: [{ role: "user", text: "Hazlo" }, { role: "agent", text: "Hecho.", duration_ms: 1000 }] }),
});
const rowOf = id => selectionApp.w.document.querySelector(`[data-sesion="${id}"]`);
const marked = () => [...selectionApp.w.document.querySelectorAll('[data-sesion][aria-current="true"]')].map(el => el.dataset.sesion);
selectionApp.emit("chat", { kind: "started", session: "viva", workspace: "w", project: "" });
selectionApp.emit("chat", { kind: "tool", session: "viva", workspace: "w", project: "", text: "Bash", target: "ls", id: "item_1" });
await sleep(50);
rowOf("viva").click();
await sleep(160);
assert.deepEqual(marked(), ["viva"]);
rowOf("otra").click();
await sleep(160);
assert.deepEqual(marked(), ["otra"], "la marca de la barra sigue a la tarea abierta");
rowOf("viva").click();
await sleep(160);
assert.deepEqual(marked(), ["viva"]);
assert.deepEqual(selectionApp.failures, []);
selectionApp.w.close();
const groupedResponses = {
  ...TASK_AFTER_QUEUE,
  list_projects: [{ id: "folder", name: "Carpeta", sources: [], portfolio: null }],
  list_live_sessions: ({ project }) => project === "folder" ? sidebarResponses.list_live_sessions : [],
  list_session_git: {},
};
const flat = await mount("listo", "5-flat", groupedResponses, undefined, UNGROUPED);
assert.equal(flat.w.document.querySelector("[data-folder-group]"), null, "sin agrupar no hay filas de carpeta");
// `p` falló (por su delegada) y no pide nada: su segunda línea es la normal.
assert.equal(flat.w.document.querySelector('[data-sesion="p"] [data-session-request]'), null, "una fallida no enseña su último mensaje");
assert.ok(flat.w.document.querySelector('[data-sesion="p"] [data-folder-chip="folder"]'), "la carpeta va como dato de la fila");
assert.deepEqual(flat.failures, []);
flat.w.close();
const grouped = await bootByFolder("listo", 5, groupedResponses);
const guide = grouped.w.document.querySelector('[data-sidebar-group="folder"]');
assert.ok(guide);
assert.ok(guide.querySelector('[data-sesion="p"]'));
assert.equal(guide.querySelector('[data-sesion="shared"]'), null, "la rama nace plegada");
const folderToggle = grouped.w.document.querySelector('[data-destino="folder"] button[aria-expanded]');
assert.ok(folderToggle);
const projectRow = folderToggle.parentElement;
assert.ok(projectRow.classList.contains("grid-cols-[20px_minmax(0,1fr)_auto_auto]"));
assert.equal(projectRow.children.length, 4);
assert.equal(projectRow.lastElementChild.getAttribute("aria-label"), "Nueva tarea en Carpeta");
folderToggle.click(); await sleep(30);
assert.equal(grouped.w.document.querySelector('[data-sidebar-group="folder"] [data-sesion]'), null);
folderToggle.click(); await sleep(30);
assert.ok(grouped.w.document.querySelector('[data-sidebar-group="folder"] [data-sesion="p"]'));
assert.deepEqual(grouped.failures, []);
const newTaskClick = await boot("listo", "new-task-click", TASK_AFTER_QUEUE);
let newTaskRequests = 0;
newTaskClick.w.addEventListener("harness:tarea-nueva", () => newTaskRequests++);
newTaskClick.w.document.querySelector('[data-sesion="s1"]').click();
await sleep(100);
keepActiveView(newTaskClick);
for (const collapsed of [false, true]) {
  const taskTab = newTaskClick.w.document.querySelector('[role="tab"]');
  taskTab.click();
  await sleep(50);
  assert.ok(newTaskClick.w.document.querySelector('[role="tab"][aria-selected="true"]'));
  if (collapsed) newTaskClick.w.document.querySelector('button[aria-label="Ocultar el historial"]').click();
  await sleep(50);
  newTaskClick.w.document.querySelector('button[aria-label="Nueva tarea"]').click();
  await sleep(50);
  assert.equal(newTaskRequests, collapsed ? 2 : 1, "the tooltip must preserve the new-task click exactly once");
  assert.equal(newTaskClick.w.document.querySelector('[role="tab"][aria-selected="true"]'), null);
  assert.ok(newTaskClick.w.document.querySelector("textarea"));
  // La caja flota: sin agente también va centrada mientras el hilo está vacío.
  // Se lee la clase que decide el sitio, no una medida que jsdom no hace.
  const centeredComposer = (doc) => {
    const layers = [...doc.querySelectorAll("[class*='inset-0']")].filter((el) =>
      /justify-(center|end)/.test(el.className),
    );
    return layers.some((el) => el.className.includes("justify-center"));
  };
  assert.equal(centeredComposer(newTaskClick.w.document), true, "la tarea nueva en blanco centra la caja");
  const newTask = newTaskClick.w.document.querySelector("[data-borrador]");
  assert.ok(newTask?.textContent.includes("Nueva tarea"), "la tarea nueva sin lanzar se ve en la tira");
  newTask.querySelector("button").click();
  await sleep(50);
  assert.equal(newTaskClick.w.document.querySelector("[data-borrador]"), null, "cerrarla vuelve a la pestaña anterior");
  assert.ok(newTaskClick.w.document.querySelector('[role="tab"][aria-selected="true"]'));
}
assert.deepEqual(newTaskClick.failures, []);
assert.equal(newTaskClick.commands.includes("delete_session"), false);
const folders = [{ id: "p1", name: "Carpeta A", kind: "folder", portfolio: "g1", sources: [] }];
let recentPreview = "";
let recentChild = false;
let recentTitle = "Tarea reciente";
const taskRenames = [];
let cloneRequest;
let finishClone;
let rejectClone;
let cloneCancellations = 0;
let holdRepositoryReply = false;
let finishRepositoryReply;
const sidebarControls = await bootByFolder("listo", "sidebar-controls", {
  ...TASK_AFTER_QUEUE,
  list_agent_profiles: { Giskard: { display_name: "Giskard PO", body: "moon" } },
  list_projects: () => structuredClone(folders),
  list_live_sessions: ({ project }) => project === "p1" ? [
    { ...TASK_AFTER_QUEUE.list_live_sessions[0], launched_by: null, agent: "executor" },
    { ...TASK_AFTER_QUEUE.list_live_sessions[0], id: "agent-root", launched_by: "agent-chat", launcher_name: "Giskard", agent: "Giskard" },
    { ...TASK_AFTER_QUEUE.list_live_sessions[0], id: "orphan-root", launched_by: "deleted-chat", launcher_name: null },
    { ...TASK_AFTER_QUEUE.list_live_sessions[0], id: "old-root" },
    { ...TASK_AFTER_QUEUE.list_live_sessions[0], id: "same-author", launched_by: "another-topic", launcher_name: "Giskard", agent: "Giskard" },
  ] : project === "" ? [{ ...TASK_AFTER_QUEUE.list_live_sessions[0], id: "recent", title: recentTitle, last_message: recentPreview },
    ...(recentChild ? [{ ...TASK_AFTER_QUEUE.list_live_sessions[0], id: "recent-child", parent: "recent" }] : [])] : [],
  rename_session: args => { taskRenames.push(args); recentTitle = args.title; },
  rename_project: ({ id, name }) => { folders[0].name = name; },
  get_project_directory: "/lab",
  list_project_repositories: ({ workspace }) => {
    assert.equal(workspace, "w");
    return [{ name: "acme/app", url: "git@github.com:acme/app.git", git_host: "github", last_used: 2 },
      { name: "legacy/offline", url: "https://git.example.org/legacy/offline.git", git_host: null, last_used: 1 }];
  },
  list_git_hosts: [{ id: "github", name: "GitHub", connected: { identity: { user: "acme" } } },
    { id: "bitbucket", name: "Bitbucket", connected: { identity: { user: "team" } } }],
  git_host_areas: ({ id, scope }) => { assert.equal(scope, "w"); return [{ key: id === "github" ? "acme" : "team", name: id === "github" ? "acme" : "team" }]; },
  git_host_projects: ({ id, scope }) => {
    assert.equal(scope, "w");
    if (id === "bitbucket") throw { what: "Sin red en Bitbucket", detail: "offline" };
    if (holdRepositoryReply) return new Promise(resolve => { finishRepositoryReply = resolve; });
    return [{ name: "app", slug: "app", clone_url: "https://github.com/acme/app.git" },
      { name: "new", slug: "new", clone_url: "https://github.com/acme/new.git" }];
  },
  clone_project: args => {
    cloneRequest = args;
    return new Promise((resolve, reject) => { finishClone = resolve; rejectClone = reject; });
  },
  cancel_project_clone: ({ operation }) => {
    assert.equal(operation, cloneRequest.operation);
    cloneCancellations++;
    rejectClone({ what: "Clonado cancelado.", detail: "cancelled by test" });
  },
  create_project: ({ name }) => { const p = { id: "loose", name, kind: "folder", portfolio: null, sources: [] }; folders.push(p); return p; },
});
const controlsDoc = sidebarControls.w.document;
assert.equal(controlsDoc.querySelector("[data-task-author]"), null, "el riel no agrupa por agente, tampoco «Recientes»");
assert.equal(controlsDoc.querySelector('[data-tasks-header] button[aria-pressed]'), null, "no hay botón de agrupar");

assert.equal(controlsDoc.querySelector("[data-session-origin]"), null);
const savedTaskRow = controlsDoc.querySelector('[data-sesion="recent"]');
const sidebarViewport = savedTaskRow.closest("[data-arrastre-scroll]");
// El riel enseña solo lo que abrió la persona: lo que lanzó un agente es de su lanzador, esté o no en la lista.
assert.equal(controlsDoc.querySelector('[data-sidebar-tasks] [data-sesion="agent-root"]'), null);
assert.equal(controlsDoc.querySelector('[data-sidebar-tasks] [data-sesion="orphan-root"]'), null);
assert.ok(controlsDoc.querySelector('[data-destino="p1"]'));
assert.equal(controlsDoc.querySelector('[data-portfolio]'), null);
sidebarViewport.scrollTop = 120;
await sleep(80);
assert.equal(controlsDoc.querySelector('[data-sesion="recent"]'), savedTaskRow);
controlsDoc.querySelector('[data-destino="p1"] button[aria-haspopup="menu"]').click();
await sleep(50);
[...controlsDoc.querySelectorAll('[role="menuitem"]')].find(item => item.textContent === "Nuevo agente").click();
await sleep(50);
assert.match(controlsDoc.querySelector('[role="dialog"]').textContent, /Nuevo agente/);
[...controlsDoc.querySelectorAll('[role="dialog"] button')].find(button => button.textContent === "Cancelar").click();
await sleep(50);
controlsDoc.querySelector('[data-destino="p1"] [data-folder-open]').dispatchEvent(new sidebarControls.w.MouseEvent("dblclick", { bubbles: true }));
assert.ok(controlsDoc.querySelector('[data-destino="p1"] input'));
const folderEditor = controlsDoc.querySelector('[data-destino="p1"] input');
await sleep(30);
folderEditor.value = "Borrador de carpeta";
folderEditor.dispatchEvent(new sidebarControls.w.Event("input", { bubbles: true }));
folderEditor.setSelectionRange(3, 7);
folders[0].working_directory = "/lab/updated";
sidebarControls.emit("cli-changed", { workspace: "w", command: "task.send" });
await sleep(350);
assert.equal(controlsDoc.querySelector('[data-destino="p1"] input'), folderEditor, "un aviso del agente no remonta la carpeta en edición");
assert.equal(controlsDoc.activeElement, folderEditor);
assert.equal(folderEditor.value, "Borrador de carpeta");
assert.equal(folderEditor.selectionStart, 3);
assert.equal(folderEditor.selectionEnd, 7);
controlsDoc.querySelector('[data-destino="p1"] input').dispatchEvent(new sidebarControls.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
controlsDoc.querySelector('[data-sesion="recent"]').dispatchEvent(new sidebarControls.w.MouseEvent("dblclick", { bubbles: true }));
await sleep(30);
const taskEditor = controlsDoc.querySelector('[data-sesion="recent"] input');
assert.ok(taskEditor);
taskEditor.value = "Borrador de tarea";
taskEditor.dispatchEvent(new sidebarControls.w.Event("input", { bubbles: true }));
taskEditor.setSelectionRange(2, 5);
recentPreview = "El agente sigue trabajando";
recentChild = true;
sidebarControls.emit("chat", { kind: "started", workspace: "w", session: "recent" });
sidebarControls.emit("session", { workspace: "w", project: "", session: "recent" });
await sleep(350);
assert.equal(controlsDoc.querySelector('[data-sesion="recent"] input'), taskEditor, "actualizar el mensaje de la tarea no recrea su editor");
assert.equal(controlsDoc.activeElement, taskEditor);
assert.equal(taskEditor.value, "Borrador de tarea");
assert.equal(taskEditor.selectionStart, 2);
assert.equal(taskEditor.selectionEnd, 5);
assert.ok(controlsDoc.querySelector('[data-sesion="recent"] [data-session-status] [aria-label$="Está trabajando"]'), "la fila se actualiza sin recrear su editor");
assert.deepEqual(taskRenames, [], "refrescar no guarda un nombre a medio escribir");
taskEditor.dispatchEvent(new sidebarControls.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
assert.deepEqual(taskRenames, [], "Escape descarta el borrador aunque el agente esté trabajando");
controlsDoc.querySelector('[data-sesion="recent"]').dispatchEvent(new sidebarControls.w.MouseEvent("dblclick", { bubbles: true }));
await sleep(30);
const confirmedEditor = controlsDoc.querySelector('[data-sesion="recent"] input');
confirmedEditor.value = "Nombre confirmado";
confirmedEditor.dispatchEvent(new sidebarControls.w.Event("input", { bubbles: true }));
confirmedEditor.closest("form").dispatchEvent(new sidebarControls.w.Event("submit", { bubbles: true, cancelable: true }));
await sleep(50);
assert.deepEqual(taskRenames, [{ project: "", id: "recent", title: "Nombre confirmado" }], "confirmar guarda una sola vez durante el turno");
sidebarControls.emit("chat", { kind: "done", workspace: "w", session: "recent", ok: true });
assert.ok(controlsDoc.querySelector('[data-sesion="recent"]'));
await openAddProject(sidebarControls);
const repositorySearch = controlsDoc.querySelector('input[placeholder="Buscar proyecto"]');
assert.ok(repositorySearch);
const sourceButtons = [...controlsDoc.querySelectorAll('[role="dialog"] button')];
assert.ok(sourceButtons[0].textContent.includes("Git URL"));
assert.ok(sourceButtons[1].textContent.includes("GitHub"));
assert.ok(sourceButtons[2].textContent.includes("Bitbucket"));
assert.ok(sourceButtons[3].textContent.includes("Explorar carpeta"));
assert.ok(sourceButtons[4].textContent.includes("Empezar vacía"));
assert.equal(sourceButtons.filter(b => b.textContent.includes("acme/app")).length, 1);
assert.ok(sourceButtons.some(b => b.textContent.includes("legacy/offline")), "un fallo del proveedor no oculta el historial local");
repositorySearch.value = "ACME";
repositorySearch.dispatchEvent(new sidebarControls.w.Event("input", { bubbles: true }));
assert.ok([...controlsDoc.querySelectorAll('[role="dialog"] button')].some(b => b.textContent.includes("acme/new")), "la búsqueda global encuentra un repo accesible aún no cargado");
[...controlsDoc.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.includes("acme/app")).click();
await sleep(50);
controlsDoc.querySelector('[role="dialog"] form').dispatchEvent(new sidebarControls.w.Event("submit", { bubbles: true, cancelable: true }));
await sleep(50);
assert.equal(cloneRequest.gitHost, "github");
assert.equal(cloneRequest.url, "https://github.com/acme/app.git");
finishClone({ id: "provider-clone", name: "App", kind: "git", sources: [] });
await sleep(100);
holdRepositoryReply = true;
await openAddProject(sidebarControls);
controlsDoc.dispatchEvent(new sidebarControls.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
await sleep(50);
holdRepositoryReply = false;
await openAddProject(sidebarControls);
finishRepositoryReply([{ name: "stale", slug: "stale", clone_url: "https://github.com/acme/stale.git" }]);
await sleep(50);
const newRepositorySearch = controlsDoc.querySelector('input[placeholder="Buscar proyecto"]');
newRepositorySearch.value = "stale";
newRepositorySearch.dispatchEvent(new sidebarControls.w.Event("input", { bubbles: true }));
assert.ok(!controlsDoc.querySelector('[role="dialog"]').textContent.includes("acme/stale"), "una respuesta del selector cerrado no entra al nuevo");
newRepositorySearch.value = "";
newRepositorySearch.dispatchEvent(new sidebarControls.w.Event("input", { bubbles: true }));
await sleep(50);
[...controlsDoc.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.includes("Empezar vacía")).click();
await sleep(50);
const folderName = controlsDoc.querySelector('[role="dialog"] input');
folderName.value = "Carpeta suelta";
folderName.dispatchEvent(new sidebarControls.w.Event("input", { bubbles: true }));
folderName.closest("form").dispatchEvent(new sidebarControls.w.Event("submit", { bubbles: true, cancelable: true }));
await sleep(100);
// Agrupando por carpeta, la recién creada aparece ya, sin tareas, y se sigue en «Nueva tarea» dentro de ella.
for (let i = 0; i < 80 && !controlsDoc.querySelector('[data-folder-group="loose"] [data-folder-open]'); i++) await sleep(25);
const dropOnRail = controlsDoc.querySelector('[data-sidebar-group="loose"]');
assert.ok(dropOnRail, "una carpeta recién creada y sin tareas aparece en el riel");
assert.equal(dropOnRail.querySelector("[data-folder-empty]")?.textContent, "Sin tareas todavía");
assert.ok(dropOnRail.querySelector('button[aria-label="Nueva tarea en Carpeta suelta"]'), "con su «+»");
assert.equal(dropOnRail.querySelector("[data-folder-open]").dataset.active, "true", "y marcada mientras se mira su «Nueva tarea»");
assert.match(controlsDoc.querySelector('button[aria-label="Proyecto"]')?.textContent ?? "", /Carpeta suelta/, "«Nueva tarea» queda en la carpeta recién creada");
assert.deepEqual(sidebarControls.failures, []);
const openClone = async () => {
  await openAddProject(sidebarControls);
  [...controlsDoc.querySelectorAll('[role="dialog"] button')].find(button => button.textContent.includes("Git URL")).click();
  await sleep(50);
  const input = controlsDoc.querySelector('[role="dialog"] input');
  input.value = "https://example.invalid/repo.git";
  input.dispatchEvent(new sidebarControls.w.Event("input", { bubbles: true }));
  input.closest("form").dispatchEvent(new sidebarControls.w.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(50);
};
await openClone();
assert.equal(cloneRequest.workspace, "w");
assert.equal(cloneRequest.gitHost, null);
assert.equal(controlsDoc.querySelector('[role="progressbar"]'), null);
cloneRequest.progress.onmessage({ phase: "receiving", percent: 42 });
await sleep(50);
assert.equal(controlsDoc.querySelector('[role="progressbar"]').getAttribute("aria-valuenow"), "42");
[...controlsDoc.querySelectorAll('[role="dialog"] button')].find(button => button.textContent === "Continuar en segundo plano").click();
await sleep(100);
assert.equal(controlsDoc.querySelector('[role="dialog"]'), null);
assert.equal(cloneCancellations, 0);
// El clon escondido vive en el riel, con el nombre que va a tener la carpeta
// y su avance. Sin `data-destino` ni fila de proyecto: no hay proyecto hasta
// que git termina, y soltarle una tarea o abrirlo no llevaría a ningún sitio.
const cloneRow = [...controlsDoc.querySelectorAll("aside button")].find(button => button.textContent.includes("Clonando…") && button.textContent.includes("Recibiendo"));
assert.ok(cloneRow);
assert.ok(cloneRow.textContent.includes("repo"));
assert.ok(cloneRow.textContent.includes("42 %"));
assert.equal(cloneRow.closest("[data-destino]"), null);
cloneRow.click();
await sleep(50);
[...controlsDoc.querySelectorAll('[role="dialog"] button')].find(button => button.textContent === "Cancelar").click();
await sleep(100);
assert.equal(cloneCancellations, 1);
assert.ok(controlsDoc.querySelector('[role="dialog"]').textContent.includes("Clonado cancelado."));
// Cancelado y con el diálogo escondido, el riel sigue diciendo que ese clon
// falló: sin la fila, el intento desaparece de la lista sin dejar rastro.
assert.ok([...controlsDoc.querySelectorAll("aside button")].some(button => button.textContent.includes("Clonado fallido")));
[...controlsDoc.querySelectorAll('[role="dialog"] button')].find(button => button.textContent === "Atrás").click();
await sleep(50);
assert.equal([...controlsDoc.querySelectorAll("aside button")].some(button => button.textContent.includes("Clonado fallido")), false);
controlsDoc.dispatchEvent(new sidebarControls.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
await sleep(50);
await openClone();
finishClone({ id: "clone", name: "Cloned", kind: "git", sources: [] });
await sleep(100);
assert.equal(controlsDoc.querySelector('[role="dialog"]'), null);
assert.deepEqual(sidebarControls.failures, []);

// Los árboles montados conservan sus relojes: el proceso no termina solo.
process.exit(0);
