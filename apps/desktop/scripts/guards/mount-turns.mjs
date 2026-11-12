#!/usr/bin/env node
/** Lanzar y seguir un turno: rama base, estado autoritativo, respuestas en vuelo e historia. */
import assert from "node:assert/strict";
import { sleep } from "../../tests/helpers/jsdom-app.mjs";
import { TASK_AFTER_QUEUE, RESPONSES, boot, bootByFolder, keepActiveView } from "../../tests/helpers/mount-guard.mjs";

const branchSubmissions = [];
let finishBranchRefresh;
let finishBranchDetails;
const localBranches = { selected: "refs/heads/dev", fetched_at: null, branches: [
  { reference: "refs/heads/dev", name: "dev", remote: false, commit: "abc", ahead: 1, behind: 0 },
  { reference: "refs/remotes/origin/dev", name: "origin/dev", remote: true, commit: "def", ahead: null, behind: null },
] };
const branchPicker = await bootByFolder("listo", "task-base-picker", {
  ...RESPONSES,
  list_projects: [{ id: "git-project", name: "Laboratorio", kind: "git", working_directory: "/lab", sources: [] }],
  list_live_sessions: TASK_AFTER_QUEUE.list_live_sessions,
  load_session: TASK_AFTER_QUEUE.load_session,
  load_queue: [],
  list_models: { ...RESPONSES.list_models, models: [
    ...RESPONSES.list_models.models,
    { id: "gpt-alternate", label: "GPT Alternate", gratis: null, note: null, efforts: ["low", "high"], default_effort: "low" },
  ] },
  project_base_branches: ({ refresh, details }) => details
    ? new Promise(resolve => { finishBranchDetails = () => resolve(localBranches); })
    : refresh
    ? new Promise(resolve => { finishBranchRefresh = () => resolve(localBranches); })
    : localBranches,
  send_message: args => { branchSubmissions.push(args); return "branch-task"; },
});
const branchDoc = branchPicker.w.document;
branchDoc.querySelector('[data-destino="git-project"] [data-folder-open]').click();
await sleep(100);
[...branchDoc.querySelectorAll("header button")].find(b => b.textContent.trim() === "Nueva tarea").click();
await sleep(100);
await sleep(50);
const branchButton = branchDoc.querySelector('button[aria-label="Rama base"]');
const projectButton = branchDoc.querySelector('button[aria-label="Proyecto"]');
assert.ok(projectButton.parentElement.contains(branchButton), "project and branch share the context row");
assert.equal(branchButton.closest("form"), null);
assert.equal(branchButton.textContent.trim(), "dev");
branchDoc.querySelector('button[aria-label="Rama base"]').click();
await sleep(100);
assert.equal(typeof finishBranchDetails, "function");
assert.equal(branchDoc.querySelector('button[aria-label="Rama base"]').textContent.trim(), "dev");
assert.ok([...branchDoc.querySelectorAll("button")].some(button => button.textContent === "dev"));
const mentionReads = branchPicker.commands.filter(command => command === "list_mentions").length;
const typingPrompt = branchDoc.querySelector("textarea");
for (let index = 0; index < 100; index += 1) {
  typingPrompt.value = `Texto ${index}`;
  typingPrompt.dispatchEvent(new branchPicker.w.Event("input", { bubbles: true }));
}
await sleep(30);
assert.equal(branchPicker.commands.filter(command => command === "list_mentions").length, mentionReads);
[...branchDoc.querySelectorAll("button")].find(button => button.textContent.includes("Actualizar ramas")).click();
await sleep(30);
assert.equal(typeof finishBranchRefresh, "function");
assert.equal(branchDoc.querySelector('button[aria-label="Rama base"]').disabled, false);
[...branchDoc.querySelectorAll("button")].find(b => b.textContent === "origin").click();
await sleep(30);
[...branchDoc.querySelectorAll("button")].find(b => b.textContent === "origin/dev").click();
await sleep(50);
assert.equal(branchDoc.querySelector('button[aria-label="Rama base"]').textContent.trim(), "origin/dev");
branchDoc.querySelector('button[aria-label^="Modelo: GPT-5.6"]').click();
await sleep(30);
[...branchDoc.querySelectorAll('[role="option"]')].find(button => button.textContent.includes("GPT Alternate")).click();
await sleep(30);
if (!branchDoc.querySelector('[role="group"][aria-label="Cuánto piensa antes de responder"]')) {
  branchDoc.querySelector('button[aria-label^="Modelo: GPT Alternate"]').click();
  await sleep(30);
}
[...branchDoc.querySelectorAll('[role="group"][aria-label="Cuánto piensa antes de responder"] button')].find(button => button.textContent.trim() === "Alto").click();
await sleep(30);
branchDoc.querySelector('[data-sesion="s1"]').click();
await sleep(100);
assert.ok(branchDoc.querySelector('button[aria-label^="Modelo: GPT-5.6"]'));
branchDoc.querySelector('[data-destino="git-project"] button[title="Nueva tarea en Laboratorio"]').click();
await sleep(100);
assert.equal(branchDoc.querySelector("textarea").value, "Texto 99");
assert.equal(branchDoc.querySelector('button[aria-label="Rama base"]').textContent.trim(), "origin/dev");
assert.ok(branchDoc.querySelector('button[aria-label="Modelo: GPT Alternate. Razonamiento: Alto"]'), "el razonamiento elegido sigue en la caja");
const branchPrompt = branchDoc.querySelector("textarea");
finishBranchRefresh();
finishBranchDetails();
await sleep(30);
assert.equal(branchDoc.querySelector('button[aria-label="Rama base"]').textContent.trim(), "origin/dev");
branchPrompt.value = "Comprueba la rama";
branchPrompt.dispatchEvent(new branchPicker.w.Event("input", { bubbles: true }));
branchPrompt.closest("form").dispatchEvent(new branchPicker.w.Event("submit", { bubbles: true, cancelable: true }));
await sleep(100);
assert.equal(branchSubmissions[0]?.baseRef, "refs/remotes/origin/dev");
assert.equal(branchSubmissions[0]?.model, "gpt-alternate");
assert.equal(branchSubmissions[0]?.effort, "high");
branchDoc.querySelector('[data-destino="git-project"] [data-folder-open]').click();
await sleep(100);
[...branchDoc.querySelectorAll("header button")].find(b => b.textContent.trim() === "Nueva tarea").click();
await sleep(100);
assert.equal(branchDoc.querySelector('button[aria-label="Rama base"]').textContent.trim(), "dev");
const defaultPrompt = branchDoc.querySelector("textarea");
defaultPrompt.value = "Usa la predeterminada del proyecto";
defaultPrompt.dispatchEvent(new branchPicker.w.Event("input", { bubbles: true }));
defaultPrompt.closest("form").dispatchEvent(new branchPicker.w.Event("submit", { bubbles: true, cancelable: true }));
await sleep(100);
assert.equal(branchSubmissions[1]?.baseRef, null, "automatic default is resolved by the backend, not stored as a task override");
assert.deepEqual(branchPicker.failures, []);
const deadBase = { selected: "refs/heads/borrada", fetched_at: null, branches: [
  { reference: "refs/heads/dev", name: "dev", remote: false, commit: "abc", ahead: null, behind: null },
] };
const missingBase = await bootByFolder("listo", "task-base-missing", {
  ...RESPONSES,
  list_live_sessions: TASK_AFTER_QUEUE.list_live_sessions,
  list_projects: [{ id: "git-project", name: "Laboratorio", kind: "git", working_directory: "/lab", sources: [] }],
  project_base_branches: () => deadBase,
});
const missingDoc = missingBase.w.document;
missingDoc.querySelector('[data-destino="git-project"] [data-folder-open]').click();
await sleep(100);
[...missingDoc.querySelectorAll("header button")].find(b => b.textContent.trim() === "Nueva tarea").click();
await sleep(100);
const missingButton = missingDoc.querySelector('button[aria-label="Rama base"]');
assert.equal(missingButton.textContent.trim(), "borrada");
assert.ok(missingButton.className.includes("text-error-strong"), "a saved base that no longer exists is painted with the error token");
assert.ok([...missingDoc.querySelectorAll("span")].some(span => span.textContent === "La rama base ya no existe. Elige otra antes de iniciar la tarea."));
missingButton.click();
await sleep(100);
assert.ok([...missingDoc.querySelectorAll("button")].some(button => button.textContent === "dev"));
assert.deepEqual(missingBase.failures, []);
const fastTurn = await boot("listo", "done-before-ack", {
  ...RESPONSES,
  turn_authors: () => new Promise(() => {}),
  list_live_sessions: [{ ...TASK_AFTER_QUEUE.list_live_sessions[0], id: "fast-turn", project: null }],
  load_session: { ...TASK_AFTER_QUEUE.load_session, id: "fast-turn", turns: [
    { role: "assistant", text: "Respuesta terminada antes del acuse", when: 1, author: { kind: "codex", name: null, verified_by: null, account: null } },
  ] },
  send_message: () => {
    fastTurn.emit("chat", { workspace: "w", session: "fast-turn", kind: "done", text: "", ok: false });
    return "fast-turn";
  },
});
const fastPrompt = fastTurn.w.document.querySelector("textarea");
fastPrompt.value = "Prueba de cierre temprano";
fastPrompt.dispatchEvent(new fastTurn.w.Event("input", { bubbles: true }));
fastPrompt.closest("form").dispatchEvent(new fastTurn.w.Event("submit", { bubbles: true, cancelable: true }));
await sleep(100);
assert.equal(fastTurn.commands.includes("send_message"), true);
assert.equal(fastTurn.w.document.querySelector('button[aria-label="Detener turno"]'), null);
assert.ok(fastTurn.w.document.body.textContent.includes("Respuesta terminada antes del acuse"));
assert.deepEqual(fastTurn.failures, []);

// Lo que llega con el turno ya cerrado no se pinta bajo «Trabajando», y la
// fila vieja de que una tarea lanzada terminó ya no se pinta.
const lateNotice = await boot("listo", "late-notice", {
  ...TASK_AFTER_QUEUE,
  load_session: { ...TASK_AFTER_QUEUE.load_session, turns: [
    { role: "agent", id: "answer", text: "Revisé todo." },
    { role: "system", text: "Se guardó el árbol.", meta: null },
    { role: "system", text: "La tarea «Revisión» terminó: listo.", meta: "task_completed",
      from_task: { folder: "", task: "child", title: "Revisión", provider: "claude" } },
  ] },
});
const lateDoc = lateNotice.w.document;
lateDoc.querySelector('[data-sesion="s1"]').click();
await sleep(150);
assert.ok(lateDoc.body.textContent.includes("Revisé todo."));
assert.ok(!lateDoc.body.textContent.includes("La tarea «Revisión» terminó: listo."));
assert.equal(lateDoc.querySelector('button[aria-label="Abrir la tarea «Revisión»"]'), null);
lateNotice.emit("chat", { kind: "notice", session: "s1", workspace: "w", text: "La tarea «Otra» terminó." });
await sleep(100);
assert.doesNotMatch(lateDoc.body.textContent, /Trabajando/);
assert.deepEqual(lateNotice.failures, []);

// La fila que dejó un traspaso de CLI es un separador propio al reabrir, no un
// paso de sistema escondido dentro de «Work».
const handoverRow = await boot("listo", "provider-handover-row", {
  ...TASK_AFTER_QUEUE,
  load_session: { ...TASK_AFTER_QUEUE.load_session, turns: [
    { role: "agent", id: "before", text: "Antes." },
    { role: "system", id: "handover", meta: "provider_handover",
      text: "La tarea pasó de Claude a Codex. Codex abre una sesión nueva y recibe la conversación como texto." },
    { role: "agent", id: "after", text: "Después." },
  ] },
});
const handoverDoc = handoverRow.w.document;
handoverDoc.querySelector('[data-sesion="s1"]').click();
await sleep(150);
const handoverLine = handoverDoc.querySelector("[data-provider-handover]");
assert.ok(handoverLine, "la fila del traspaso se pinta al reabrir la tarea");
assert.ok(handoverLine.textContent.includes("pasó de Claude a Codex"));
assert.ok(handoverDoc.body.textContent.includes("Antes."));
assert.ok(handoverDoc.body.textContent.includes("Después."));
assert.deepEqual(handoverRow.failures, []);

// Un `!` con un traspaso confirmado corre y contesta con el CLI de la sesión;
// el pendiente no se gasta y el siguiente mensaje normal sí lo consiente.
const shellCalls = [];
const answerCalls = [];
const handoverCalls = [];
let shellApp;
const shellWithPending = await boot("listo", "shell-with-handover", {
  ...TASK_AFTER_QUEUE,
  machine_list: [{ id: "local", local: true, active: true, on: true, hosts: true, features: ["provider_handoff_v1"] }],
  load_session: { ...TASK_AFTER_QUEUE.load_session, can_hand_over: true, hand_over_blocked: null },
  list_surfaces: [
    { id: "codex", provider: "codex", label: "Codex", catalogo: "todo", usable: true, marca: null, porque: null },
    { id: "claude", provider: "claude", label: "Claude Code", catalogo: "todo", usable: true, marca: null, porque: null },
  ],
  set_session_provider: (args) => { handoverCalls.push(args); return null; },
  run_shell_command: (args) => {
    shellCalls.push(args);
    shellApp.emit("chat", { workspace: "w", session: "s1", kind: "shell_started", text: args.command, id: "shell-1", target: "/tmp" });
    return { session: "s1", turn: { role: "shell", id: "shell-turn", text: args.command } };
  },
  answer_shell_output: (args) => { answerCalls.push(args); return true; },
});
shellApp = shellWithPending;
const shellDoc = shellWithPending.w.document;
shellDoc.querySelector('[data-sesion="s1"]').click();
await sleep(150);
shellDoc.querySelector('button[aria-label^="Modelo:"]').click();
await sleep(50);
[...shellDoc.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === "Claude Code")?.click();
await sleep(50);
shellDoc.querySelector('[role="listbox"] [role="option"]')?.click();
await sleep(120);
const confirmHandover = [...shellDoc.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent.trim() === "Cambiar");
assert.ok(confirmHandover, "la confirmación del traspaso se abre");
confirmHandover.click();
await sleep(100);
const shellInput = shellDoc.querySelector("textarea");
shellInput.value = "!echo hola";
shellInput.dispatchEvent(new shellWithPending.w.Event("input", { bubbles: true }));
shellInput.closest("form").dispatchEvent(new shellWithPending.w.Event("submit", { bubbles: true, cancelable: true }));
await sleep(120);
assert.equal(shellCalls.length, 1);
assert.equal(shellCalls[0].provider, undefined, "un ! de una tarea abierta no manda provider");
shellWithPending.emit("chat", { workspace: "w", session: "s1", kind: "shell_done", id: "shell-1", text: "", meta: "0" });
await sleep(300);
assert.equal(answerCalls.length, 1);
assert.equal(answerCalls[0].provider, "codex", "la salida del ! la contesta el CLI de la sesión");
assert.equal(answerCalls[0].model, "gpt-5.6", "la salida del ! usa el modelo de la sesión");
shellWithPending.emit("chat", { workspace: "w", session: "s1", kind: "done", text: "", ok: true });
await sleep(200);
const afterShell = shellDoc.querySelector("textarea");
afterShell.value = "Sigue";
afterShell.dispatchEvent(new shellWithPending.w.Event("input", { bubbles: true }));
afterShell.closest("form").dispatchEvent(new shellWithPending.w.Event("submit", { bubbles: true, cancelable: true }));
await sleep(150);
assert.equal(handoverCalls.length, 1, "el pendiente sobrevive al !");
assert.equal(handoverCalls[0].provider, "claude");
assert.deepEqual(shellWithPending.failures, []);

// El chip guarda en la tarea el modelo que la persona elige del CLI de la
// sesión (`session_model_v1`), con su esfuerzo. Con un traspaso confirmado, el
// modelo del otro CLI no se guarda: lo guarda su primer turno.
const sessionModelCalls = [];
const chipApp = await boot("listo", "session-model-chip", {
  ...TASK_AFTER_QUEUE,
  machine_list: [{ id: "local", local: true, active: true, on: true, hosts: true, features: ["provider_handoff_v1", "session_model_v1"] }],
  load_session: { ...TASK_AFTER_QUEUE.load_session, can_hand_over: true, hand_over_blocked: null },
  list_models: { ...RESPONSES.list_models, models: [
    ...RESPONSES.list_models.models,
    { id: "gpt-alternate", label: "GPT Alternate", gratis: null, note: null, efforts: ["low", "high"], default_effort: "low" },
  ] },
  list_surfaces: [
    { id: "codex", provider: "codex", label: "Codex", catalogo: "todo", usable: true, marca: null, porque: null },
    { id: "claude", provider: "claude", label: "Claude Code", catalogo: "todo", usable: true, marca: null, porque: null },
  ],
  set_session_provider: () => null,
  set_session_model: (args) => { sessionModelCalls.push(args); return null; },
});
const chipDoc = chipApp.w.document;
const pickModel = async (label) => {
  chipDoc.querySelector('button[aria-label^="Modelo:"]').click();
  await sleep(50);
  const option = [...chipDoc.querySelectorAll('[role="listbox"] [role="option"]')].find((o) => o.textContent.includes(label));
  assert.ok(option, `el chip ofrece ${label}`);
  option.click();
  await sleep(120);
};
chipDoc.querySelector('[data-sesion="s1"]').click();
await sleep(150);
await pickModel("GPT Alternate");
assert.equal(sessionModelCalls.length, 1, "elegir un modelo del CLI de la tarea lo guarda");
assert.equal(sessionModelCalls[0].id, "s1");
assert.equal(sessionModelCalls[0].model, "gpt-alternate");
assert.ok("effort" in sessionModelCalls[0], "modelo y esfuerzo viajan juntos");
chipDoc.querySelector('button[aria-label^="Modelo:"]').click();
await sleep(50);
[...chipDoc.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === "Claude Code")?.click();
await sleep(50);
chipDoc.querySelector('[role="listbox"] [role="option"]')?.click();
await sleep(120);
const confirmChip = [...chipDoc.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent.trim() === "Cambiar");
assert.ok(confirmChip, "la confirmación del traspaso se abre");
confirmChip.click();
await sleep(100);
await pickModel("GPT Alternate");
assert.equal(sessionModelCalls.length, 1, "con un traspaso confirmado, el modelo del otro CLI no se guarda en la tarea");
assert.deepEqual(chipApp.failures, []);

let activeTurns = [];
let finishPendingTurn;
let registeredTurns = [];
let hiddenTurnOutcome = null;
const pendingTurnApp = await boot("listo", "reconcile-during-inflight-send", {
  ...TASK_AFTER_QUEUE,
  list_live_sessions: () => [{ ...TASK_AFTER_QUEUE.list_live_sessions[0], outcome: hiddenTurnOutcome }, { ...TASK_AFTER_QUEUE.list_live_sessions[0], id: "s2", title: "Otra tarea" }],
  load_session: ({ id }) => ({ ...TASK_AFTER_QUEUE.load_session, id }),
  list_active_turns: () => registeredTurns,
  send_message: () => new Promise(resolve => { finishPendingTurn = resolve; }),
});
const pendingDoc = pendingTurnApp.w.document;
pendingDoc.querySelector('[data-sesion="s1"]').click();
await sleep(80);
const pendingInput = pendingDoc.querySelector("textarea");
pendingInput.value = "Trabaja un rato";
pendingInput.dispatchEvent(new pendingTurnApp.w.Event("input", { bubbles: true }));
pendingInput.closest("form").dispatchEvent(new pendingTurnApp.w.Event("submit", { bubbles: true, cancelable: true }));
await sleep(50);
assert.equal(typeof finishPendingTurn, "function");
pendingTurnApp.w.dispatchEvent(new pendingTurnApp.w.Event("focus"));
await sleep(50);
assert.ok(pendingDoc.querySelector('button[aria-label="Detener turno"]'), "preparation must not look finished before registration");
registeredTurns = ["s1", "s2"];
pendingTurnApp.w.dispatchEvent(new pendingTurnApp.w.Event("focus"));
await sleep(50);
pendingDoc.querySelector('[data-sesion="s2"]').click();
await sleep(80);
assert.ok(pendingDoc.querySelector('button[aria-label="Detener turno"]'), "recover another live task while send_message remains pending");
registeredTurns = ["s1"];
pendingTurnApp.w.dispatchEvent(new pendingTurnApp.w.Event("focus"));
await sleep(80);
assert.equal(pendingDoc.querySelector('button[aria-label="Detener turno"]'), null, "recover a missed finish while another send remains pending");
finishPendingTurn("s1");
await sleep(80);
const hiddenRow = () => pendingDoc.querySelector('[data-sesion="s1"]');
assert.ok(hiddenRow().querySelector('[aria-label$="Está trabajando"]'));
pendingTurnApp.emit("chat", { kind: "delta", session: "s1", workspace: "w", text: "Respuesta parcial" });
pendingTurnApp.w.dispatchEvent(new pendingTurnApp.w.Event("focus"));
await sleep(80);
assert.ok(hiddenRow().querySelector('[aria-label$="Está trabajando"]'), "streaming and reconciliation preserve activity in a hidden task");
hiddenTurnOutcome = "delivered";
registeredTurns = [];
pendingTurnApp.w.dispatchEvent(new pendingTurnApp.w.Event("focus"));
await sleep(80);
// Entregada y vista, la tarea se queda donde estaba, entre las «Tareas».
assert.equal(pendingDoc.querySelector('[data-sidebar-section="settled"]'), null, "no hay sección «Asentadas»");
assert.equal(hiddenRow().querySelector('[aria-label$="Está trabajando"]'), null);
// En la tarjeta del riel una entregada no lleva ícono: vista se apaga, sin ver lleva el punto verde.
assert.ok(hiddenRow().dataset.apagada === "true" || hiddenRow().querySelector('[aria-label="Terminó y no la has abierto"]'), "recovering a missed done refreshes the hidden task result");
assert.deepEqual(pendingTurnApp.failures, []);
pendingTurnApp.w.close();

let finishTranscript;
let finishActiveRead;
const liveReplies = {
  ...TASK_AFTER_QUEUE,
  list_active_turns: () => activeTurns,
  stop_turn: null,
};
const liveState = await boot("listo", "authoritative-turn-state", liveReplies);
const liveDoc = liveState.w.document;
liveDoc.querySelector('[data-sesion="s1"]').click();
await sleep(80);
activeTurns = ["s1"];
liveState.emit("chat", { kind: "started", session: "s1", workspace: "w" });
await sleep(30);
assert.ok(liveDoc.querySelector('button[aria-label="Detener turno"]'));
liveState.emit("chat", { kind: "tool", session: "s1", workspace: "w", id: "sin-cierre", text: "Bash", target: "pnpm verify" });
liveState.emit("chat", { kind: "delta", session: "s1", workspace: "w", text: "Respuesta final" });
await sleep(30);
assert.match(liveDoc.body.textContent, /Ejecutando 1 comando/);
liveReplies.load_session = () => new Promise(resolve => { finishTranscript = resolve; });
activeTurns = [];
liveState.emit("chat", { kind: "done", session: "s1", workspace: "w", ok: true });
await sleep(30);
assert.equal(liveDoc.querySelector('button[aria-label="Detener turno"]'), null, "done stops activity before transcript loads");
assert.doesNotMatch(liveDoc.body.textContent, /Ejecutando 1 comando/, "a finished turn cannot keep a tool running while its transcript loads");
assert.match(liveDoc.body.textContent, /Ejecutó 1 comando/);
finishTranscript(TASK_AFTER_QUEUE.load_session);
await sleep(30);
liveReplies.load_session = TASK_AFTER_QUEUE.load_session;
activeTurns = ["s1"];
liveState.emit("chat", { kind: "started", session: "s1", workspace: "w" });
await sleep(30);
activeTurns = [];
liveState.w.dispatchEvent(new liveState.w.Event("focus"));
await sleep(50);
assert.equal(liveDoc.querySelector('button[aria-label="Detener turno"]'), null, "authoritative registry recovers a lost done event");
liveReplies.list_active_turns = () => new Promise(resolve => { finishActiveRead = resolve; });
liveState.w.dispatchEvent(new liveState.w.Event("focus"));
await sleep(20);
activeTurns = ["s1"];
liveState.emit("chat", { kind: "started", session: "s1", workspace: "w" });
finishActiveRead([]);
await sleep(30);
assert.ok(liveDoc.querySelector('button[aria-label="Detener turno"]'), "an old snapshot cannot stop a newly started turn");
liveReplies.list_active_turns = () => [];
liveDoc.querySelector('button[aria-label="Detener turno"]').click();
await sleep(60);
assert.equal(liveDoc.querySelector('button[aria-label="Detener turno"]'), null);
assert.ok(!liveDoc.body.textContent.includes("No se pudo detener"));
assert.deepEqual(liveState.failures, []);

// El registro ve el cierre antes que el done: la cola retenida sin desenlace sale cuando el done llega.
{
  let activeIds = [];
  const sends = [];
  const app = await boot("listo", "late-done-releases-queue", {
    ...TASK_AFTER_QUEUE,
    list_active_turns: () => activeIds,
    save_queue: null,
    load_queue: [],
    queue_ready: false,
    send_message: (args) => { sends.push(args.prompt); return "s1"; },
  });
  const doc = app.w.document;
  doc.querySelector('[data-sesion="s1"]').click();
  await sleep(80);
  activeIds = ["s1"];
  app.emit("chat", { kind: "started", session: "s1", workspace: "w" });
  await sleep(30);
  const inputField = doc.querySelector("textarea");
  inputField.value = "Pendiente";
  inputField.dispatchEvent(new app.w.Event("input", { bubbles: true }));
  inputField.closest("form").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(50);
  activeIds = [];
  app.w.dispatchEvent(new app.w.Event("focus"));
  await sleep(80);
  assert.equal(sends.length, 0, "a turn closed without its outcome keeps the queue");
  app.emit("chat", { kind: "done", session: "s1", workspace: "w", ok: true });
  await sleep(200);
  assert.deepEqual(sends, ["Pendiente"], "the late done releases the queue");
  assert.deepEqual(app.failures, []);
  app.w.close();
}
// Y si la sesión vuelve a verse viva, el done ok es de otro turno: la cola sigue retenida.
{
  let activeIds = [];
  const sends = [];
  const app = await boot("listo", "later-turn-keeps-draft", {
    ...TASK_AFTER_QUEUE,
    list_active_turns: () => activeIds,
    save_queue: null,
    load_queue: [],
    queue_ready: false,
    send_message: (args) => { sends.push(args.prompt); return "s1"; },
  });
  const doc = app.w.document;
  doc.querySelector('[data-sesion="s1"]').click();
  await sleep(80);
  activeIds = ["s1"];
  app.emit("chat", { kind: "started", session: "s1", workspace: "w" });
  await sleep(30);
  const inputField = doc.querySelector("textarea");
  inputField.value = "Pendiente";
  inputField.dispatchEvent(new app.w.Event("input", { bubbles: true }));
  inputField.closest("form").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(50);
  activeIds = [];
  app.w.dispatchEvent(new app.w.Event("focus"));
  await sleep(80);
  activeIds = ["s1"];
  app.w.dispatchEvent(new app.w.Event("focus"));
  await sleep(80);
  activeIds = [];
  app.emit("chat", { kind: "done", session: "s1", workspace: "w", ok: true });
  await sleep(200);
  assert.deepEqual(sends, [], "a later turn's done does not release the draft of one that closed without outcome");
  assert.deepEqual(app.failures, []);
  app.w.close();
}

{
  for (const child of [false, true]) {
    const stops = [];
    const escapeApp = await boot("listo", `escape-${child}`, {
      ...TASK_AFTER_QUEUE,
      load_session: { ...TASK_AFTER_QUEUE.load_session, subagent: child ? "native-child" : null, parent: child ? "parent" : null },
      stop_turn: (args) => { stops.push(args); },
      list_active_turns: ["s1"],
    });
    const document = escapeApp.w.document;
    document.querySelector('[data-sesion="s1"]').click();
    await sleep(80);
    escapeApp.emit("chat", { kind: "started", session: "s1", workspace: "w" });
    await sleep(30);
    const input = document.querySelector("textarea");
    input.focus();
    input.dispatchEvent(new escapeApp.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(50);
    assert.deepEqual(stops, [{ project: "", session: "s1" }], "Escape reaches the viewed task");
    assert.deepEqual(escapeApp.failures, []);
    escapeApp.w.close();
  }
}

for (const attachment of ["/tmp/Captura México.png", "/tmp/notes.pdf"]) {
  let accept;
  let reject;
  const calls = [];
  const queued = { id: "attached", text: "", provider: "codex", model: null, effort: null, attachments: [attachment] };
  const app = await boot("listo", `steer-attachment-${attachment}`, {
    ...TASK_AFTER_QUEUE, load_queue: [queued], save_queue: null, queue_ready: false,
    list_active_turns: ["s1"],
    inject_message: (args) => { calls.push(args); return new Promise((resolve, fail) => { accept = resolve; reject = fail; }); },
  });
  const doc = app.w.document;
  doc.querySelector('[data-sesion="s1"]').click();
  await sleep(100);
  app.emit("chat", { kind: "started", session: "s1", workspace: "w" });
  app.emit("chat", { kind: "tool", session: "s1", workspace: "w", id: "build", text: "Bash", target: "build" });
  await sleep(50);
  const button = () => doc.querySelector('button[title="Mandar ahora"]');
  assert.ok(button(), "attachments can steer a running tool");
  button().click();
  await sleep(50);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].attachments, [attachment]);
  assert.equal(calls[0].prompt, "");
  assert.equal(button().disabled, true);
  reject("chat.steer.unconfirmed");
  await sleep(50);
  assert.ok(button(), "failed delivery keeps the attachment queued for retry");
  assert.equal(button().disabled, false);
  button().click();
  await sleep(50);
  accept(null);
  await sleep(80);
  assert.equal(button(), null, "confirmed delivery removes the attachment from the queue");
  assert.equal(calls.length, 2);
  assert.deepEqual(app.failures, []);
  app.w.close();
}

let acknowledgeSteer;
let injections = 0;
const steerReplies = { ...TASK_AFTER_QUEUE, load_queue: [], save_queue: null, queue_ready: true,
  list_live_sessions: [TASK_AFTER_QUEUE.list_live_sessions[0], { ...TASK_AFTER_QUEUE.list_live_sessions[0], id: "s2", title: "Segunda tarea" }],
  load_session: ({ id }) => ({ ...TASK_AFTER_QUEUE.load_session, id }),
  list_active_turns: ["s1"],
  inject_message: () => { injections++; return new Promise(resolve => { acknowledgeSteer = resolve; }); },
};
const steerState = await boot("listo", "pending-steer", steerReplies);
steerState.w.document.querySelector('[data-sesion="s1"]')?.click();
await sleep(150);
steerState.emit("chat", { kind: "started", session: "s1", workspace: "w" });
steerState.emit("chat", { kind: "tool", session: "s1", workspace: "w", id: "steer-command", text: "Bash", target: "sleep 30" });
await sleep(50);
const steerStatus = steerState.w.document.querySelector('[role="status"][aria-label="El agente está trabajando"]');
assert.match(steerStatus?.textContent ?? "", /Ejecutando/);
assert.doesNotMatch(steerStatus?.textContent ?? "", /sleep 30/);
const steerInput = steerState.w.document.querySelector("textarea");
steerInput.value = "Corrige durante el turno";
steerInput.dispatchEvent(new steerState.w.Event("input", { bubbles: true }));
steerInput.closest("form").dispatchEvent(new steerState.w.Event("submit", { bubbles: true, cancelable: true }));
await sleep(100);
const sendNow = steerState.w.document.querySelector('button[title="Mandar ahora"]');
assert.ok(sendNow);
assert.equal(steerInput.disabled, false, "tool execution keeps the composer editable");
assert.equal(sendNow.disabled, false, "tool execution allows native steering before the command finishes");
sendNow.click();
sendNow.click();
await sleep(50);
assert.equal(injections, 1, "double click must not inject the queued message twice");
assert.equal(sendNow.disabled, true);
const pendingRow = sendNow.closest("li");
assert.ok([...pendingRow.querySelectorAll("button")].every(button => button.disabled));
steerState.w.document.querySelector('[data-sesion="s2"]').click();
await sleep(100);
steerReplies.list_active_turns = [];
steerState.emit("chat", { kind: "done", session: "s1", workspace: "w", ok: true });
await sleep(150);
assert.equal(steerState.commands.filter(command => command === "send_message").length, 0, "done before steering ACK must not dispatch the same message");
acknowledgeSteer(null);
await sleep(100);
steerState.w.document.querySelector('[data-sesion="s1"]').click();
await sleep(150);
assert.equal(steerState.w.document.querySelector('button[title="Mandar ahora"]'), null);
assert.equal(steerState.commands.filter(command => command === "send_message").length, 0);
assert.deepEqual(steerState.failures, []);

// El menú del proyecto no ofrece un historial de tareas, y nadie pide las
// archivadas por proyecto.
const historyApp = await bootByFolder("listo", 6, {
  ...TASK_AFTER_QUEUE,
  list_projects: [{ id: "p1", name: "Laboratorio", node: null, sources: [], working_directory: "/lab", created_at: 1, updated_at: 1, sessions: 1, kind: "folder" }],
});
historyApp.w.document.querySelector('button[aria-label="Acciones del proyecto «Laboratorio»"]')?.click();
await sleep(50);
const actions = [...historyApp.w.document.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent?.trim());
assert.ok(actions.length > 0, "el menú del proyecto se abre");
assert.equal(actions.includes("Historial de tareas"), false, "el menú del proyecto ya no ofrece el historial");
await sleep(150);
assert.equal(historyApp.commands.includes("list_archived"), false, "la ventana no pide las archivadas por proyecto");
assert.equal(historyApp.commands.includes("list_sessions"), false, "la ventana no pide la lista completa");
assert.deepEqual(historyApp.failures, []);
const tabOfTitle = (app, titleText) => [...app.w.document.querySelectorAll(':is([role="tab"], [data-preview-header] [role="button"])')].find((tab) => tab.textContent?.includes(titleText));

let archivedOnDisk = false;
const liveQuestion = { ...TASK_AFTER_QUEUE.list_live_sessions[0], archived: false };
const archiveApp = await boot("listo", "archivar-cierra", {
  ...TASK_AFTER_QUEUE,
  list_live_sessions: ({ open }) => [
    ...(!archivedOnDisk ? [liveQuestion] : open?.includes("s1") ? [{ ...liveQuestion, archived: true }] : []),
    { ...liveQuestion, id: "s2", title: "Segunda tarea" },
  ],
});
archiveApp.w.document.querySelector('[data-sesion="s1"]').click();
await sleep(150);
keepActiveView(archiveApp);
archiveApp.w.document.querySelector('[data-sesion="s2"]').click();
await sleep(150);
assert.ok(tabOfTitle(archiveApp, "Una tarea"));
archivedOnDisk = true;
archiveApp.emit("session", { project: "", session: "s1", workspace: "w" });
await sleep(500);
assert.equal(tabOfTitle(archiveApp, "Una tarea"), undefined, "archivar una tarea viva cierra su pestaña");
assert.ok(tabOfTitle(archiveApp, "Segunda tarea"), "la otra pestaña sigue");
assert.equal(archiveApp.commands.includes("list_sessions"), false);
assert.deepEqual(archiveApp.failures, []);
const removedFromMenu = new Set();
const menuActions = [];
const fromAnotherTask = await boot("listo", "actions-from-another-task", {
  ...TASK_AFTER_QUEUE,
  list_live_sessions: () => ["s1", "s2", "s3"]
    .filter(id => !removedFromMenu.has(id))
    .map(id => ({ ...liveQuestion, id, title: `Tarea ${id}` })),
  task_blockers: () => ({ unsaved: [], not_finished: false }),
  set_task_archived: args => { menuActions.push(["archive", args]); removedFromMenu.add(args.id); },
  machine_list: [{ id: "local", local: true, active: true, on: true, hosts: true, features: ["task_lifecycle_v1"] }],
  task_lifecycle_preview: args => ({ members: [{ project: args.project, id: args.id, title: `Tarea ${args.id}`, working: false, files: [], inspection: { status: "complete" } }], consent: "reviewed-menu-family" }),
  task_lifecycle_apply: args => {
    menuActions.push(["delete", args]);
    removedFromMenu.add(args.id);
    return { status: "complete", applied: [{ project: args.project, id: args.id }], failures: [] };
  },
});
const menuDoc = fromAnotherTask.w.document;
const selectedTask = () => menuDoc.querySelector('[data-sesion][aria-current="true"]')?.getAttribute("data-sesion");
const menuItem = label => [...menuDoc.querySelectorAll('[role="menuitem"]')].find(el => el.textContent.trim() === label);
const openTaskMenu = id => menuDoc.querySelector(`[data-sesion="${id}"] [aria-haspopup="menu"]`).click();
menuDoc.querySelector('[data-sesion="s1"]').click();
await sleep(100);
openTaskMenu("s2");
await sleep(30);
menuItem("Archivar tarea").click();
await sleep(100);
assert.equal(selectedTask(), "s1", "archivar desde el menú no abre la tarea archivada");
assert.deepEqual(menuActions[0], ["archive", { project: "", id: "s2", archived: true }]);
openTaskMenu("s3");
await sleep(30);
menuItem("Borrar la tarea").click();
await sleep(30);
assert.equal(selectedTask(), "s1", "pedir el borrado no abre la tarea elegida");
menuDoc.querySelector('[role="alertdialog"] button').click();
await sleep(100);
assert.equal(selectedTask(), "s1", "confirmar el borrado conserva la tarea abierta");
assert.equal(menuActions.length, 1, "the first confirmation only opens the family review");
const deletionReview = menuDoc.querySelector('[role="dialog"]');
assert.ok(deletionReview);
assert.equal(deletionReview.querySelector('input[type="checkbox"]'), null, "a task without losses asks for no acceptance");
[...deletionReview.querySelectorAll('button')].find(button => button.textContent.trim() === "Borrar la tarea").click();
await sleep(100);
assert.equal(selectedTask(), "s1", "applying the reviewed deletion preserves the open task");
assert.deepEqual(menuActions[1], ["delete", { project: "", id: "s3", action: "delete", consent: "reviewed-menu-family", discard: true }]);
assert.deepEqual(fromAnotherTask.failures, []);
let recreated = false;
let rejectRecreation = true;
const resumeCalls = [];
const retired = await boot("listo", "retired-worktree", {
  ...TASK_AFTER_QUEUE,
  task_history: () => ({ ...TASK_AFTER_QUEUE.task_history, available: recreated, recreatable: !recreated }),
  recreate_task_work: (args) => {
    resumeCalls.push(args);
    if (rejectRecreation) return Promise.reject(new Error("repository unavailable"));
    recreated = true;
  },
});
retired.w.document.querySelector('[data-sesion="s1"]').click();
await sleep(100);
assert.equal(retired.w.document.querySelector("textarea"), null);
const resumeButton = () => [...retired.w.document.querySelectorAll("button")].find(b => b.textContent === "Volver a escribir");
assert.ok(resumeButton());
assert.equal(resumeCalls.length, 0);
resumeButton().click();
await sleep(100);
assert.equal(retired.w.document.querySelector("textarea"), null);
assert.ok(resumeButton());
rejectRecreation = false;
resumeButton().click();
await sleep(150);
assert.deepEqual(resumeCalls, [{ project: "", id: "s1" }, { project: "", id: "s1" }]);
assert.ok(retired.w.document.querySelector("textarea"));
assert.equal(retired.commands.includes("send_message"), false);
assert.deepEqual(retired.failures, []);

// Los árboles montados conservan sus relojes: el proceso no termina solo.
process.exit(0);
