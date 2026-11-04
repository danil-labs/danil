#!/usr/bin/env node
/** La caja de una tarea abierta: menciones, cola, bifurcación, vista previa y adjuntos. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { sleep } from "../../tests/helpers/jsdom-app.mjs";
import { WITH_TASK, RESPONSES, NO_USABLE, boot, task } from "../../tests/helpers/mount-guard.mjs";

const mentionSends = [];
const target = { kind: "task", projectId: "project", sessionId: "login-task" };
const secondTarget = { ...target, sessionId: "other-login" };
const mentionApp = await boot("listo", "task-mentions", {
  ...RESPONSES,
  list_projects: [{ id: "scoring", name: "Revamp de scoring", node: null, sources: [], portfolio: "pf", created_at: 1, updated_at: 1, sessions: 0, kind: "folder" }],
  list_task_mentions: [
    { target, title: "Corregir login", projectName: "App", alias: "vega", branch: "fix/login", available: true, archived: false, updatedAt: 10 },
    { target: secondTarget, title: "Corregir login", projectName: "App", alias: "vega-two", branch: "fix/other", available: true, archived: false, updatedAt: 9 },
    { target: { ...target, sessionId: "gone" }, title: "Login anterior", projectName: "App", alias: "old", branch: "", available: false, archived: false, updatedAt: 1 },
    { target: { ...target, sessionId: "archived" }, title: "Login archivado", projectName: "App", alias: "archived", branch: "fix/login", available: true, archived: true, updatedAt: 20 },
  ],
  send_message: args => { mentionSends.push(args); return "mention-session"; },
});
const mentionField = mentionApp.w.document.querySelector("textarea");
const writeMention = (text, inputType = "insertText") => {
  mentionField.value = text;
  mentionField.selectionStart = text.length;
  mentionField.selectionEnd = text.length;
  mentionField.dispatchEvent(new mentionApp.w.InputEvent("input", { bubbles: true, inputType }));
  mentionField.dispatchEvent(new mentionApp.w.KeyboardEvent("keyup", { bubbles: true, key: "n" }));
};
writeMention("🦊 revisa @login");
await sleep(120);
const taskButton = [...mentionApp.w.document.querySelectorAll("button")].find(b => b.textContent.includes("Corregir login") && b.textContent.includes("fix/login"));
assert.ok(taskButton, "task search must include session titles and aliases");
for (let el = taskButton.closest("ul")?.parentElement?.parentElement; el; el = el.parentElement)
  assert.equal(el.classList.contains("overflow-hidden"), false, "The suggestion menu must not live inside a clipping container: it is drawn above the composer and would be cut off");
assert.equal([...mentionApp.w.document.querySelectorAll("button")].some(b => b.textContent.includes("Login archivado")), false, "Archived tasks must not appear in mention suggestions");
const unavailable = [...mentionApp.w.document.querySelectorAll("button")].find(b => b.textContent.includes("Login anterior"));
assert.equal(unavailable?.disabled, false, "A task without a worktree remains addressable");
taskButton.dispatchEvent(new mentionApp.w.MouseEvent("mousedown", { bubbles: true }));
await sleep(30);
assert.equal(mentionField.value, "🦊 revisa @fix/login ");
assert.equal(mentionApp.w.document.querySelector("[data-kind='mention']")?.textContent, "@fix/login");
const selected = mentionField.value;
mentionField.dispatchEvent(new mentionApp.w.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "z", metaKey: true }));
assert.equal(mentionField.value, "🦊 revisa @login");
mentionField.dispatchEvent(new mentionApp.w.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "z", metaKey: true, shiftKey: true }));
assert.equal(mentionField.value, selected);
writeMention(selected.replace("login", "acceso"));
assert.equal(mentionApp.w.document.querySelector("[data-kind='mention']"), null);
writeMention(selected, "historyUndo");
assert.equal(mentionApp.w.document.querySelector("[data-kind='mention']")?.textContent, "@fix/login");
writeMention(mentionField.value + "@login");
await sleep(30);
const otherButton = [...mentionApp.w.document.querySelectorAll("button")].find(b => b.textContent.includes("Corregir login") && b.textContent.includes("fix/other"));
otherButton.dispatchEvent(new mentionApp.w.MouseEvent("mousedown", { bubbles: true }));
const beforeDelete = mentionField.value;
const firstStart = beforeDelete.indexOf("@");
const firstEnd = firstStart + "@fix/login ".length;
mentionField.selectionStart = firstStart;
mentionField.selectionEnd = firstEnd;
mentionField.dispatchEvent(new mentionApp.w.InputEvent("beforeinput", { bubbles: true, inputType: "deleteContentBackward" }));
mentionField.value = beforeDelete.slice(0, firstStart) + beforeDelete.slice(firstEnd);
mentionField.dispatchEvent(new mentionApp.w.InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
writeMention(mentionField.value + " y elimina @anterior");
await sleep(100);
const taskWithoutWorktree = [...mentionApp.w.document.querySelectorAll("button")].find(b => b.textContent.includes("Login anterior"));
assert.ok(taskWithoutWorktree && !taskWithoutWorktree.disabled);
taskWithoutWorktree.dispatchEvent(new mentionApp.w.MouseEvent("mousedown", { bubbles: true }));
writeMention(`${mentionField.value}c`);
assert.equal(mentionField.selectionStart, mentionField.value.length, "The first key typed after picking a task must leave the cursor after it");
writeMention(`${mentionField.value} en @revamp`);
await sleep(60);
const folderButton = [...mentionApp.w.document.querySelectorAll("button[aria-selected]")].find(b => b.textContent.includes("Revamp de scoring") && b.textContent.includes("Proyecto"));
assert.ok(folderButton, "Working folders are offered as mentions");
folderButton.dispatchEvent(new mentionApp.w.MouseEvent("mousedown", { bubbles: true }));
await sleep(30);
assert.ok(mentionField.value.endsWith(" @Revamp-de-scoring "), mentionField.value);
mentionField.closest("form").dispatchEvent(new mentionApp.w.Event("submit", { bubbles: true, cancelable: true }));
await sleep(100);
assert.equal(mentionSends.length, 1);
assert.equal(mentionSends[0].taskMentions.length,  3);
assert.deepEqual(mentionSends[0].taskMentions[2].target, { kind: "folder", projectId: "scoring" });
assert.equal(mentionSends[0].taskMentions[1].target.sessionId, "gone");
assert.deepEqual(mentionSends[0].taskMentions[0].target, secondTarget);
const sentMention = mentionSends[0].taskMentions[0];
assert.equal(mentionSends[0].prompt.slice(sentMention.start, sentMention.end), sentMention.text);
assert.deepEqual(mentionSends[0].sources, []);
assert.deepEqual(mentionApp.failures, []);
mentionApp.w.close();

const queuedSends = [];
const injected = [];
const queueFiles = new Map();
const queuedApp = await boot("listo", "background-queue", {
  ...WITH_TASK,
  list_live_sessions: [
    WITH_TASK.list_live_sessions[0],
    { ...WITH_TASK.list_live_sessions[0], id: "s2", title: "Segunda tarea" },
    { ...WITH_TASK.list_live_sessions[0], id: "s3", title: "Buzón del arquitecto" },
  ],
  load_session: ({ id }) => ({ ...WITH_TASK.load_session, id }),
  load_queue: ({ session }) => queueFiles.get(session) ?? [],
  save_queue: ({ session, queued }) => { queueFiles.set(session, queued); },
  send_message: (args) => { queuedSends.push(args); return args.session; },
  inject_message: (args) => { injected.push(args); },
});
const queueDocument = queuedApp.w.document;
const selectQueuedTask = async (id) => {
  queueDocument.querySelector(`[data-sesion="${id}"]`).click();
  await sleep(150);
};
const queueText = async (text) => {
  const field = queueDocument.querySelector("textarea");
  field.value = text;
  field.dispatchEvent(new queuedApp.w.Event("input", { bubbles: true }));
  field.closest("form").dispatchEvent(new queuedApp.w.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(50);
};
await selectQueuedTask("s1");
queuedApp.emit("chat", { kind: "started", session: "s1", workspace: "w" });
await queueText("Primer pendiente");
await queueText("Segundo pendiente");
await selectQueuedTask("s2");
await selectQueuedTask("s1");
queuedApp.emit("chat", { kind: "done", session: "s1", workspace: "w", ok: true });
await sleep(200);
assert.equal(queuedSends.length, 1, "returning to a task must not turn its live queue into a draft");
assert.equal(queuedSends[0].prompt, "Primer pendiente\n\nSegundo pendiente");
await queueText("Pendiente en segundo plano");
await selectQueuedTask("s2");
queuedApp.emit("chat", { kind: "done", session: "s1", workspace: "w", ok: true });
await sleep(200);
assert.equal(queuedSends.length, 2, "finishing a hidden task dispatches its queue automatically");
assert.equal(queuedSends[1].session, "s1");
assert.equal(queuedSends[1].prompt, "Pendiente en segundo plano");
assert.deepEqual(queueFiles.get("s1"), []);
await selectQueuedTask("s1");
assert.equal(queuedSends.length, 2, "returning does not resend the consumed queue");

// Con el turno corriendo, el Enter de más mete lo encolado en él, en orden.
// Es la flecha de la cola sin soltar el teclado.
queuedApp.emit("chat", { kind: "started", session: "s1", workspace: "w" });
await queueText("Cambia de enfoque");
await queueText("Y mira el log");
const composer = queueDocument.querySelector("textarea");
composer.focus();
composer.dispatchEvent(new queuedApp.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
await sleep(250);
if (injected.length !== 2) {
  console.error(`El Enter de más no manda lo encolado al turno vivo: inject_message=${injected.length}.`);
  process.exit(1);
}
assert.deepEqual(
  injected.map((i) => i.prompt),
  ["Cambia de enfoque", "Y mira el log"],
);
// Y sin cola no se toca: Enter con la caja vacía no manda nada.
composer.dispatchEvent(new queuedApp.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
await sleep(150);
assert.equal(injected.length, 2, "sin nada encolado el Enter de más no inventa un envío");
assert.equal(queuedSends.length, 2);

// Una entrega encolada la vacía la ventana, y con ella el sobre. Rust la
// dejó en el `.cola.json` del buzón con quién la manda y dónde se contesta;
// sin devolver el remitente aterriza firmada como de la persona (PR #800).
const delivery = {
  id: "d1", text: "Revisa el acceso", provider: "codex", model: null, effort: null,
  permission_mode: null, attachments: [], agent: "arquitecto",
  reply_to: { folder: "p", task: "t9" }, hops: 2,
};
queueFiles.set("s3", [delivery, { ...delivery, id: "d2", agent: null, reply_to: null, hops: null, text: "Y esto lo escribo yo" }]);
await selectQueuedTask("s3");
const sendQueue = [...queueDocument.querySelectorAll("button")].find((b) => b.textContent.trim() === "mandar");
assert.ok(sendQueue, "una cola leída del disco espera a que alguien la suelte");
sendQueue.click();
await sleep(200);
assert.equal(queuedSends.length, 3);
assert.equal(queuedSends[2].prompt, "Revisa el acceso", "un lote no mezcla remitentes");
assert.equal(queuedSends[2].fromAgent, "arquitecto", "la entrega encolada conserva quién la manda");
assert.deepEqual(queueFiles.get("s3"), [{ ...delivery, id: "d2", agent: null, reply_to: null, hops: null, text: "Y esto lo escribo yo" }],
  "lo que no salió sigue en su cola, no se pierde ni se cuela en el lote ajeno");
assert.equal(queuedApp.failures.length, 0);
queuedApp.w.close();

const cloudIcons = await boot("listo", "cloud-folder-icons", {
  ...RESPONSES,
  list_projects: [
    { id: "cloud-folder", name: "Nube", sources: [], kind: "folder", cloud: "google_drive" },
    { id: "cloud-git", name: "Git en nube", sources: [], kind: "git", cloud: "one_drive" },
    { id: "local-folder", name: "Local", sources: [], kind: "folder", cloud: null },
  ],
});
// Agrupando por carpeta, que es lo de omisión, una carpeta sin tareas tiene su grupo, su «+» y su estado vacío.
for (let i = 0; i < 80 && cloudIcons.w.document.querySelectorAll("[data-folder-group]").length < 3; i++) await sleep(25);
assert.deepEqual([...cloudIcons.w.document.querySelectorAll("[data-folder-group]")].map((el) => el.dataset.folderGroup),
  ["cloud-folder", "cloud-git", "local-folder"], "una carpeta sin tareas aparece en el riel");
for (const [id, name] of [["cloud-folder", "Nube"], ["cloud-git", "Git en nube"], ["local-folder", "Local"]]) {
  const groupEl = cloudIcons.w.document.querySelector(`[data-sidebar-group="${id}"]`);
  assert.equal(groupEl.querySelector("[data-folder-open]").textContent.trim(), name, "sin contador junto al nombre");
  assert.equal(groupEl.querySelector("[data-folder-empty]")?.textContent, "Sin tareas todavía");
  assert.ok(groupEl.querySelector(`button[aria-label="Nueva tarea en ${name}"]`), "su «+» empieza una tarea en ella");
}
assert.equal(cloudIcons.w.document.querySelector("[data-sidebar-empty]"), null, "con carpetas a la vista no dice que no hay nada");
assert.doesNotMatch(cloudIcons.w.document.body.textContent, /google_drive|one_drive/);
assert.deepEqual(cloudIcons.failures, []);
const forkCalls = [];
let forkSessionActive = false;
let rejectFork;
let resolveFork;
let copied = null;
const forkResponses = {
  ...WITH_TASK,
  list_active_turns: () => forkSessionActive ? ["s1"] : [],
  load_session: {
    ...WITH_TASK.load_session,
    turns: [
      { role: "user", id: "u1", text: "Primera pregunta" },
      { role: "agent", id: "a1", native_id: "native-a1", text: "Primera respuesta" },
      { role: "user", id: "u2", text: "Pregunta posterior" },
      { role: "agent", id: "a2", native_id: "native-a2", text: "Respuesta posterior" },
    ],
  },
  prepare_session_continuation: (args) => {
    forkCalls.push(args);
    return new Promise((resolve, reject) => { rejectFork = reject; resolveFork = resolve; });
  },
  // Copiar va al portapapeles del sistema y no al del webview, que con un
  // turno en vuelo rechaza por falta de gesto (issue #642).
  "plugin:clipboard-manager|write_text": (args) => {
    copied = args.text;
    return null;
  },
};
const forkApp = await boot("listo", 901, forkResponses);
const forkDoc = forkApp.w.document;
forkDoc.querySelector('[data-sesion="s1"]').click();
await sleep(150);
const [copyQuestion, copyReply] = forkDoc.querySelectorAll('button[aria-label="Copiar"]');
copyQuestion.click();
await sleep(20);
assert.equal(copied, "Primera pregunta", "a sent message copies its own text");
copyReply.click();
await sleep(20);
assert.equal(copied, "Primera respuesta");
assert.equal(forkDoc.querySelectorAll('button[aria-label="Copiado"]').length, 1,
  "copying a reply marks only its own button");
assert.equal(copyReply.getAttribute("aria-label"), "Copiado");
forkSessionActive = true;
forkApp.emit("chat", { kind: "started", session: "s1", workspace: "w" });
await sleep(30);
assert.ok(forkDoc.querySelector('button[aria-label="Detener turno"]'));
assert.equal(forkDoc.querySelectorAll('button[aria-label="Crear tarea desde aquí"]').length, 2,
  "persisted replies, including the latest, remain forkable during an active turn");
const forkButton = forkDoc.querySelector('button[aria-label="Crear tarea desde aquí"]');
forkButton.click();
await sleep(20);
const fullContext = [...forkDoc.querySelectorAll('[role="dialog"] button')].find(b => b.textContent === "Conversación completa");
fullContext.click();
fullContext.click();
await sleep(20);
assert.equal(forkCalls.length, 1);
assert.equal(forkCalls[0].turno, "a1");
rejectFork(new Error("fork rechazado"));
await sleep(50);
const forkAlert = forkDoc.querySelector('[role="alert"]');
assert.match(forkAlert.textContent, /fork rechazado/);
forkAlert.querySelector("button").click();
assert.equal(forkDoc.querySelector('[role="alert"]'), null);
forkButton.click();
await sleep(20);
[...forkDoc.querySelectorAll('[role="dialog"] button')].find(b => b.textContent === "Conversación completa").click();
await sleep(20);
assert.equal(forkCalls.length, 2);
rejectFork(new Error("reintento rechazado"));
await sleep(30);
forkButton.click();
await sleep(20);
const focusedContext = [...forkDoc.querySelectorAll('[role="dialog"] button')].find(b => b.textContent === "Sesión enfocada");
focusedContext.click();
await sleep(20);
resolveFork({ path: "/private/attachments/context/conversation.md", last_prompt: "Primera pregunta", last_reply: "Primera respuesta", sources: [], excluded_sources: [] });
await sleep(100);
assert.equal(forkDoc.querySelector('[role="dialog"]'), null);
const newDraft = [...forkDoc.querySelectorAll("textarea")].find(el => el.value.includes("Primera pregunta"));
assert.ok(newDraft);
assert.match(newDraft.value, /Primera respuesta/);
assert.doesNotMatch(newDraft.value, /Pregunta posterior/);
const draftModel = forkDoc.querySelector('button[title="Con qué modelo responde"]');
assert.ok(draftModel && !draftModel.disabled);
draftModel.click();
await sleep(30);
assert.ok(forkDoc.querySelector('[role="group"]'));
assert.deepEqual(forkApp.failures, []);

const taskApp = await boot("listo", 2, WITH_TASK);
const sessionPreview = taskApp.w.document.querySelector('[data-sesion="s1"] [data-session-preview]');
// Sin nada que pedirte, la segunda línea es carpeta, agente y PR: ni el mensaje ni el modelo.
assert.ok(sessionPreview, "la fila del riel tiene segunda línea");
assert.doesNotMatch(sessionPreview.textContent, /La última respuesta de esta tarea/);
assert.doesNotMatch(sessionPreview.textContent, /gpt-5.6/);

taskApp.w.document.querySelector('[data-sesion="s1"]')?.click();
await sleep(150);
const rowEl = taskApp.w.document.querySelector('button[title="informe.md"]');
rowEl?.click();
await sleep(150);
const inTabStrip = [...taskApp.w.document.querySelectorAll(':is([role="tab"], [data-preview-header] [role="button"])')].some(
  (t) => t.textContent?.trim() === "informe.md",
);
// Y que además **se pinte**: una pestaña sin visor detrás deja el centro en
// blanco, que es lo mismo que no haberla abierto.
const viewer = taskApp.w.document.querySelector(".preview-path");
if (!rowEl || !inTabStrip || !viewer || taskApp.failures.length > 0) {
  console.error(
    `Abrir un artefacto no lo pone en la tira del centro: fila=${!!rowEl}, pestaña=${inTabStrip}, visor=${!!viewer}.`,
  );
  for (const f of taskApp.failures.slice(0, 3)) {
    for (const l of String(f).split("\n").slice(0, 6)) console.error(`      ${l}`);
  }
  process.exit(1);
}

// **Y cerrar esa pestaña devuelve la conversación**, que es la otra mitad: la
// conversación se esconde en vez de desmontarse, así que si no vuelve, lo que
// queda es un centro en blanco sin nada que lo diga.
taskApp.w.document.hasFocus = () => true;
taskApp.w.dispatchEvent(new taskApp.w.Event("focus"));
WITH_TASK.load_session.turns.push({ role: "agent", id: "second", text: "Otra respuesta" });
WITH_TASK.list_live_sessions[0].result_revision = createHash("sha256").update("1:second:Otra respuesta").digest("hex");
taskApp.emit("session", { project: "", session: "s1", workspace: "w" });
await sleep(350);
const chatTab = [...taskApp.w.document.querySelectorAll(':is([role="tab"], [data-preview-header] [role="button"])')].find(el => el.getAttribute("aria-label")?.includes("sin leer"));
assert.equal(chatTab, undefined);
const fileTab = [...taskApp.w.document.querySelectorAll(':is([role="tab"], [data-preview-header] [role="button"])')].find(el => el.textContent.includes("informe.md"));
assert.equal(fileTab.querySelector("svg.lucide-mail"), null);
assert.equal(fileTab.querySelector("svg.lucide-git-branch"), null);
taskApp.w.document
  .querySelector('button[aria-label="Cerrar «informe.md»"]')
  ?.click();
await sleep(100);
assert.equal(taskApp.w.document.querySelector('[role="tab"][aria-label*="sin leer"]'), null);
const returned =
  !taskApp.w.document.querySelector(".preview-path") &&
  !!taskApp.w.document.querySelector("textarea");
if (!returned || taskApp.failures.length > 0) {
  console.error("Cerrar la pestaña del artefacto no devuelve la conversación.");
  for (const f of taskApp.failures.slice(0, 3)) {
    for (const l of String(f).split("\n").slice(0, 6)) console.error(`      ${l}`);
  }
  process.exit(1);
}

const liveStatus = () => taskApp.w.document.querySelector('[role="status"][aria-label="El agente está trabajando"]');
taskApp.emit("chat", { kind: "started", session: "s1", workspace: "w" });
await sleep(100);
assert.ok(liveStatus());
const initialVerb = liveStatus().querySelector(".min-w-0 > span").textContent;
taskApp.emit("chat", { kind: "tool", session: "s1", workspace: "w", id: "status-command", text: "Bash", target: "pnpm verify" });
await sleep(100);
assert.equal(liveStatus().querySelector(".min-w-0 > span").textContent, initialVerb);
// El comando no sale en el rótulo de espera: lo enseña su fila del registro.
assert.match(liveStatus().textContent, /Ejecutando/);
assert.doesNotMatch(liveStatus().textContent, /pnpm verify/);
// El verbo lo mueve el tic de un segundo de TurnStatus: en un runner cargado el de los 4 s llega tarde.
await sleep(4100);
for (let i = 0; i < 30 && liveStatus().querySelector(".min-w-0 > span").textContent === initialVerb; i++) {
  await sleep(200);
}
assert.notEqual(liveStatus().querySelector(".min-w-0 > span").textContent, initialVerb);
assert.match(liveStatus().textContent, /Ejecutando/);
assert.doesNotMatch(liveStatus().textContent, /pnpm verify/);
taskApp.emit("chat", { kind: "tool_done", session: "s1", workspace: "w", id: "status-command", text: "Bash", ok: true });
await sleep(100);
assert.ok(liveStatus());
assert.doesNotMatch(liveStatus().textContent, /Ejecutando/);
taskApp.emit("chat", { kind: "done", session: "s1", workspace: "w", ok: true });
await sleep(100);
assert.equal(liveStatus(), null);

const sends = [];
let rejectAsBusy = false;
let queueAvailable = false;
WITH_TASK.send_message = args => {
  sends.push(args);
  if (rejectAsBusy) throw "history.error.busy";
  return "s1";
};
taskApp.emit("chat", { kind: "started", session: "other-task", workspace: "w" });
WITH_TASK.folder_holder = { project: "", session: "other-task", title: "Other task" };
WITH_TASK.queue_ready = () => queueAvailable;
WITH_TASK.save_queue = null;
const typeQueued = async text => {
  const inputField = taskApp.w.document.querySelector('textarea');
  assert.ok(inputField);
  inputField.value = text;
  inputField.dispatchEvent(new taskApp.w.Event("input", { bubbles: true }));
  inputField.closest("form").dispatchEvent(new taskApp.w.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(100);
  assert.equal(inputField.value, "");
};
taskApp.emit("chat", { kind: "started", session: "s1", workspace: "w" });
taskApp.emit("chat", { kind: "tool", session: "s1", workspace: "w", id: "queue-tool", text: "Bash", target: "pnpm verify" });
await sleep(100);
taskApp.emit("chat", { kind: "model", session: "s1", workspace: "w", text: "claude-sonnet-5" });
await sleep(50);
assert.ok(taskApp.w.document.querySelector('button[aria-label="Modelo: claude-sonnet-5"]'));
taskApp.emit("chat", { kind: "model", session: "another-session", workspace: "w", text: "other-model" });
await sleep(50);
assert.equal(taskApp.w.document.querySelector('button[aria-label="Modelo: other-model"]'), null);
await typeQueued("Haz los símbolos Git");
// Y la actividad de la tarea no se lo quita a quien escribe en otro campo:
// editando un mensaje de la cola, cada delta devolvía el foco al compositor y
// se perdía lo tecleado.
{
  const doc = taskApp.w.document;
  const editButton = [...doc.querySelectorAll("button")].find((b) =>
    (b.getAttribute("aria-label") ?? "").startsWith("Editar el mensaje"),
  );
  if (!editButton) {
    console.error("No hay con qué editar un mensaje de la cola: releer esta comprobación.");
    process.exit(1);
  }
  editButton.click();
  await sleep(100);
  const queuedField = doc.activeElement;
  if (queuedField?.tagName !== "TEXTAREA" || queuedField.value !== "Haz los símbolos Git") {
    console.error("Abrir el editor de un mensaje en cola ya no enfoca su campo.");
    process.exit(1);
  }
  taskApp.emit("chat", { kind: "delta", session: "s1", workspace: "w", text: "llega actividad" });
  taskApp.emit("chat", { kind: "tool", session: "s1", workspace: "w", id: "foco-tool", text: "Bash", target: "ls" });
  await sleep(150);
  if (doc.activeElement !== queuedField) {
    console.error(
      `La actividad de la tarea le quitó el foco a quien escribía: quedó en ${doc.activeElement?.tagName} ${JSON.stringify(doc.activeElement?.value ?? "")}.`,
    );
    process.exit(1);
  }
  queuedField.dispatchEvent(new taskApp.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(100);
}
taskApp.emit("chat", { kind: "delta", session: "s1", workspace: "w", text: "Estoy trabajando" });
await typeQueued("Cuando termines manda el PR");
assert.equal(sends.length, 0);
taskApp.emit("chat", { kind: "done", session: "s1", workspace: "w", ok: true });
await sleep(200);
assert.equal(sends.length, 1, "another live task in the same folder does not block dispatch");
assert.equal(sends[0].prompt, "Haz los símbolos Git\n\nCuando termines manda el PR");
assert.equal(sends[0].session, "s1");
await typeQueued("Esto va después del lote");
assert.equal(sends.length, 1);
taskApp.emit("chat", { kind: "done", session: "s1", workspace: "w", ok: false });
await sleep(150);
assert.equal(sends.length, 1, "un fallo no despacha el lote pendiente");
for (const button of taskApp.w.document.querySelectorAll('button[aria-label^="Quitar el mensaje "]')) button.click();
await sleep(50);
rejectAsBusy = true;
await typeQueued("Conserva este mensaje");
assert.equal(sends.length, 2);
assert.doesNotMatch(taskApp.w.document.body.textContent, /Hay un turno o una operación en curso/);
await typeQueued("Y este también");
assert.equal(sends.length, 2);
await sleep(1100);
assert.equal(sends.length, 2, "no reintenta mientras siga ocupada");
rejectAsBusy = false;
queueAvailable = true;
await sleep(1200);
assert.equal(sends.length, 3);
assert.equal(sends[2].prompt, "Conserva este mensaje\n\nY este también");
taskApp.emit("chat", { kind: "done", session: "s1", workspace: "w", ok: true });
await sleep(100);

const noUsable = await boot("listo", 3, NO_USABLE);
const inventedSelector = noUsable.w.document.querySelector('button[title="Con qué modelo responde"]');
const output = [...noUsable.w.document.querySelectorAll("button")].some(
  (b) => b.textContent?.trim() === "Conectar una cuenta",
);
if (noUsable.failures.length > 0 || inventedSelector || !output) {
  console.error(
    "Sin superficies usables, el chat tiene que quedar sin selector de modelos y ofrecer conectar una cuenta.",
  );
  process.exit(1);
}
for (const [platform, userAgent] of [
  ["macOS", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"],
  ["Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"],
  ["Linux", "Mozilla/5.0 (X11; Linux x86_64)"],
]) {
  const attachmentCopies = [];
  const attachmentSends = [];
  const attachmentApp = await boot("listo", `attachment-drop-${platform}`, {
    ...WITH_TASK,
    list_live_sessions: [task("image-a", null, null), task("image-b", null, null), task("image-c", null, null)],
    send_message: (args) => { attachmentSends.push(args); return args.session; },
    prepare_attachments: ({ paths }) => {
      attachmentCopies.push(paths);
      return paths.map(path => `/private/attachments/${attachmentCopies.length}/${path.split("/").pop()}`);
    },
  }, userAgent);
  for (const id of ["image-a", "image-b", "image-c", "image-a"]) {
    attachmentApp.w.document.querySelector(`[data-sesion="${id}"]`).click();
    await sleep(100);
    const beforeDrop = attachmentCopies.length;
    attachmentApp.emit("tauri://drag-drop", { paths: ["/tmp/screenshot.png"], position: { x: 100, y: 100 } });
    await sleep(50);
    assert.equal(attachmentCopies.length, beforeDrop + 1, `${platform}: un arrastre debe preparar una copia en ${id}, aunque haya otras tareas montadas`);
  }
  const attachmentDoc = attachmentApp.w.document;
  const sendAttachment = () => [...attachmentDoc.querySelectorAll('button[aria-label="Preguntar"]')].find(b => !b.disabled);
  assert.ok(sendAttachment(), `${platform}: an image enables sending without text`);
  sendAttachment().click();
  await sleep(100);
  assert.equal(attachmentSends.length, 1);
  assert.equal(attachmentSends[0].prompt, "");
  assert.ok(attachmentSends[0].attachments.some(path => path.endsWith("screenshot.png")));
  attachmentApp.emit("chat", { kind: "started", session: "image-a", workspace: "w" });
  attachmentApp.emit("tauri://drag-drop", { paths: ["/tmp/report.pdf"], position: { x: 100, y: 100 } });
  await sleep(50);
  const textarea = [...attachmentDoc.querySelectorAll("textarea")].find(el => el.placeholder === "Escribe lo siguiente");
  assert.ok(textarea);
  textarea.dispatchEvent(new attachmentApp.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await sleep(50);
  assert.equal(attachmentSends.length, 1, "attachment waits while the agent is busy");
  attachmentApp.emit("chat", { kind: "done", session: "image-a", workspace: "w", ok: true });
  await sleep(200);
  assert.equal(attachmentSends.length, 2);
  assert.equal(attachmentSends[1].prompt, "");
  assert.ok(attachmentSends[1].attachments.some(path => path.endsWith("report.pdf")));
  assert.deepEqual(attachmentApp.failures, []);
  attachmentApp.w.close();
}

// Los árboles montados conservan sus relojes: el proceso no termina solo.
process.exit(0);
