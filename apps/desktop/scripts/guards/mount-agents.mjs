#!/usr/bin/env node
/** El riel y la caja hablan con los agentes de cada carpeta: burbujas, borradores, menciones, hilos y bandeja. */
import assert from "node:assert/strict";
import { sleep } from "../../tests/helpers/jsdom-app.mjs";
import { WITH_TASK, boot, bootByFolder, searchWindow, talkFromFolder, keepActiveView } from "../../tests/helpers/mount-guard.mjs";

const agentRow = {
  provider: "codex", model: "gpt-5.6", refs: [], created_at: 0, updated_at: 0, turns: 1,
  parent: null, subagent: null, esperando: false, stage: null,
  agent: "Holmes", parent_agent: null, last_message: "Listo.",
};
const policyCalls = [];
const bubbleResponses = {
  handler_action: ({ input }) => {
    policyCalls.push(input);
    const action = input.request.action;
    if (action === "list") return { handlers: [{ name: "Watson", memory: { store: { slot: "notes" }, status: "unavailable", reason: "UNAPPROVED_SENTINEL", identity: "watson", entries: 0, synced: false } }] };
    if (action === "requests") return { handler: "Watson", source: "project", key: "watson", digest: "digest", dirty: false, approval: null, stale: null, requests: [{ kind: "memory", slot: "notes", state: "approved", server: "notes-server", granted_access: "read" }] };
    if (action === "release") throw { what: "Pending", detail: { code: "wait_timed_out", detail: { operation: "handler-op" } } };
    if (action === "resume") return { handler: "Watson", identity: "watson", released: true, quarantine: null, digest: "digest" };
    throw new Error("Unexpected handler action");
  },
  ...WITH_TASK,
  list_projects: [{ id: "p", name: "Proyecto", node: null, sources: [] }],
  list_live_sessions: [
    { ...agentRow, id: "s-chat", title: "Holmes", chat_de_agente: true },
    { ...agentRow, id: "s-task", title: "Una tarea", chat_de_agente: false },
    { ...agentRow, id: "s-plain", title: "Tarea suelta", agent: null, chat_de_agente: false },
  ],
  list_agents: {
    agents: [{
      name: "Holmes", description: "", instructions: "", tools: [], model: null,
      origin: ".danil/agents/holmes.md", folder: null, providers: ["codex"], own: false, own_scope: null,
    }],
    rechazados: [],
  },
  list_agent_status: [{ name: "Holmes", status: "awake", minutes_since_last_turn: 1, live_tasks: 0 }],
  list_agent_profiles: {},
  keep_awake_status: { mode: "agent", active: false, supported: true },
  save_agent_profile: (args) => {
    return { display_name: args.displayName, body: args.body, background: null, avatar: null, veil: args.veil, provider: null, model: null, effort: null, hidden: false };
  },
  set_keep_awake: ({ mode }) => {
    return { mode, active: mode === "on", supported: true };
  },
  has_mcp_app: ({ server, tool }) => server === "canvas" && tool === "draw",
  read_mcp_app: ({ tool }) => tool === "draw" ? {
    html: "<p>Canvas de prueba</p>", resource_uri: "ui://canvas/view.html",
    tool: { name: "draw", inputSchema: { type: "object" } }, connection_id: "canvas-test",
  } : null,
  close_mcp_app: null,
  load_session: ({ id }) => ({
    ...WITH_TASK.load_session,
    id,
    turns: [
      { role: "user", text: "¿Cómo vas?" },
      { role: "agent", text: "Voy bien.", duration_ms: 1200, author: { kind: "codex", name: null, verified_by: null, account: null }, model_vendor: "Codex", model: "gpt-5.6", tools: id === "s-chat" ? [
        { name: "mcp__canvas__draw", ok: true, mcp_app: { server: "canvas", tool: "draw", result: { content: [] } } },
        { name: "mcp__canvas__lookup", ok: true, mcp_app: { server: "canvas", tool: "lookup", result: { content: [] } } },
        { name: "atlassian·getConfluencePage", ok: true, mcp_app: { server: "atlassian", tool: "getConfluencePage", result: { content: [] } } },
      ] : [] },
      ...(id === "s-task" ? [
        { role: "user", text: "Continúa con Claude." },
        { role: "agent", text: "Listo tras el traspaso.", author: { kind: "claude", name: null, verified_by: null, account: null }, model_vendor: "Claude Code", model: "claude-sonnet-5" },
      ] : []),
    ],
  }),
};
const bubbleApp = await boot("listo", "agent-bubble", {
  ...bubbleResponses,
  list_live_sessions: [
    ...bubbleResponses.list_live_sessions,
    { ...agentRow, id: "s-transfer", title: "Revisar entrega", agent: "Watson", chat_de_agente: false },
  ],
  list_agents: { ...bubbleResponses.list_agents, agents: [
    { ...bubbleResponses.list_agents.agents[0], own: true },
    { ...bubbleResponses.list_agents.agents[0], name: "Watson", own: true },
  ] },
  telegram_status: { token_saved: false, bot_username: null, enabled: false, paired_chats: 0, pairing: null, topics_enabled: false, topics: 0 },
  queue_ready: false,
  load_queue: ({ session }) => session === "s-chat" ? [{
    id: "compact-queue", text: "Mensaje pendiente", provider: "codex", model: null,
    effort: null, permission_mode: null, attachments: [],
  }] : [],
});
const bubbleDocument = bubbleApp.w.document;
await sleep(80);
// El riel solo lista tareas, de todas las carpetas en una lista: los agentes ya no tienen sección.
assert.equal(bubbleDocument.querySelector("[data-sidebar-agents]"), null, "el riel no lista agentes");
const railRows = () => [...bubbleDocument.querySelectorAll('[data-sidebar-tasks] [data-sesion]')].map((f) => f.dataset.sesion);
assert.ok(bubbleDocument.querySelector('[data-sidebar-tasks] [data-sesion="s-task"] [data-session-agent]'), "la tarea lleva la pastilla de su agente");
assert.equal(bubbleDocument.querySelector("[data-sidebar-search]"), null, "el riel ya no lleva buscador: busca la franja");
const found = () => [...bubbleDocument.querySelectorAll('[data-global-search] [data-search-key^="task:"]')].map((f) => f.dataset.searchKey.slice(5));
const searchBox = await searchWindow(bubbleApp, "REVISAR");
assert.deepEqual(found(), ["s-transfer"], "busca sin importar mayúsculas");
await searchWindow(bubbleApp, "revisár");
assert.deepEqual(found(), ["s-transfer"], "ni acentos");
await searchWindow(bubbleApp, "watson");
assert.deepEqual(found(), ["s-transfer"], "encuentra la tarea por el nombre de su agente");
await searchWindow(bubbleApp, "");
const chosen = () => bubbleDocument.querySelector('[data-global-search] [role="option"][aria-selected="true"]')?.dataset.searchKey;
const firstOne = chosen();
assert.ok(firstOne, "sin texto enseña las recientes con la primera elegida");
searchBox.dispatchEvent(new bubbleApp.w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
await sleep(30);
assert.notEqual(chosen(), firstOne, "↓ baja a la siguiente");
searchBox.dispatchEvent(new bubbleApp.w.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
await sleep(30);
assert.equal(chosen(), firstOne, "↑ vuelve");
searchBox.dispatchEvent(new bubbleApp.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
await sleep(80);
assert.equal(bubbleDocument.querySelector("[data-global-search]"), null, "Escape cierra el buscador");
assert.ok(railRows().includes("s-task") && railRows().includes("s-plain"), "el riel sigue con la lista entera");

// Los agentes están en el dock del pie: pulsar uno abre su chat, como su fila
// de antes; el clic derecho ofrece ver sus tareas, que filtra la lista.
const dock = () => bubbleDocument.querySelector('[role="group"][aria-label="Agentes"]');
for (let i = 0; i < 80 && !dock(); i++) await sleep(25);
const faceOf = (nameText) => [...(dock()?.querySelectorAll("[data-dock-agent]") ?? [])].find((b) => b.getAttribute("aria-label").startsWith(nameText));
assert.ok(faceOf("Holmes"), "el dock enseña a Holmes");
assert.match(faceOf("Holmes").getAttribute("aria-label"), /Despierto/, "su cara dice cómo está");
assert.equal(faceOf("Holmes").getAttribute("title"), null, "el nombre va en un tooltip propio, no en `title`");
faceOf("Holmes").dispatchEvent(new bubbleApp.w.PointerEvent("pointerenter", { bubbles: false, pointerType: "mouse" }));
faceOf("Holmes").dispatchEvent(new bubbleApp.w.PointerEvent("pointermove", { bubbles: true, pointerType: "mouse" }));
await sleep(300);
assert.match(bubbleDocument.querySelector('[role="tooltip"]')?.textContent ?? "", /Holmes.*Despierto/, "pasar por la cara enseña su nombre y su estado");
faceOf("Holmes").dispatchEvent(new bubbleApp.w.PointerEvent("pointerleave", { bubbles: false, pointerType: "mouse" }));
faceOf("Holmes").click();
await sleep(150);
assert.match(bubbleDocument.querySelector("h1")?.textContent ?? "", /Holmes/, "pulsar la cara abre el chat con el agente");
assert.ok(railRows().includes("s-plain"), "pulsar la cara no filtra la lista");
faceOf("Holmes").dispatchEvent(new bubbleApp.w.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
await sleep(120);
const viewItsTasks = [...bubbleDocument.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent.trim() === "Ver sus tareas");
assert.ok(viewItsTasks, "el clic derecho ofrece ver sus tareas");
assert.ok([...bubbleDocument.querySelectorAll('[role="menuitem"]')].some((el) => el.textContent.trim() === "Configuración del agente"));
viewItsTasks.dispatchEvent(new bubbleApp.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
await sleep(120);
assert.ok(railRows().includes("s-task") && !railRows().includes("s-plain"), "ver sus tareas filtra por el agente");
assert.equal(bubbleDocument.querySelector("button[data-personalize] span"), null, "Personalizar no lleva contador de filtros");
bubbleDocument.querySelector("button[data-personalize]").click();
await sleep(80);
[...bubbleDocument.querySelectorAll('[role="menu"] [role="group"][aria-label="Agente"] [role="menuitemradio"]')].find((b) => b.textContent.trim() === "Todos").click();
await sleep(80);
bubbleDocument.activeElement?.dispatchEvent(new bubbleApp.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
await sleep(80);
assert.ok(railRows().includes("s-plain"), "«Todos» en el menú de filtro quita el filtro");

bubbleDocument.querySelector('[data-sidebar-tasks] [data-sesion="s-chat"]').click();
await sleep(300);
const bubbles = () => [...bubbleDocument.querySelectorAll("[data-bubble]")];
assert.equal(bubbles().length, 0, "el chat persistente usa respuestas sin globo");
assert.match(bubbleDocument.querySelector("#root").textContent, /Voy bien/);
assert.ok(bubbleDocument.querySelector(".bg-chat-user"), "el input de la persona lleva el tinte de marca");
const appFrame = bubbleDocument.querySelector('iframe[sandbox="allow-scripts"]');
assert.ok(appFrame, "la MCP App aparece con el registro de herramientas cerrado");
const workToggle = appFrame.closest("article").querySelector("button[aria-expanded]");
assert.equal(workToggle?.getAttribute("aria-expanded"), "false");
const appReadsBeforeToggle = bubbleApp.commands.filter((c) => c === "read_mcp_app").length;
assert.equal(appReadsBeforeToggle, 1, "las herramientas sin metadatos de UI no intentan abrir una MCP App");
assert.equal(bubbleDocument.querySelector("#root").textContent.includes("Abrir vista interactiva"), false,
  "una llamada normal no deja un botón de vista");
for (const expanded of ["true", "false"]) {
  workToggle.click();
  await sleep(50);
  assert.equal(workToggle.getAttribute("aria-expanded"), expanded);
  assert.equal(bubbleDocument.querySelector('iframe[sandbox="allow-scripts"]'), appFrame,
    "plegar las herramientas no desmonta ni duplica la MCP App");
}
assert.equal(bubbleDocument.querySelectorAll('iframe[sandbox="allow-scripts"]').length, 1);
assert.equal(bubbleApp.commands.filter((c) => c === "read_mcp_app").length, appReadsBeforeToggle,
  "cambiar el pliegue no vuelve a consultar las herramientas");

const editQueued = [...bubbleDocument.querySelectorAll("button")].find((button) =>
  button.getAttribute("aria-label")?.startsWith("Editar el mensaje"));
assert.ok(editQueued, "la cola conserva la edición");
const queueList = editQueued.closest("ol");
assert.ok(queueList, "la cola sigue visible");
editQueued.click();
await sleep(100);
const queueEditor = queueList.querySelector("textarea");
assert.equal(queueEditor?.value, "Mensaje pendiente", "editar conserva el texto completo");
queueEditor.dispatchEvent(new bubbleApp.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
await sleep(50);
keepActiveView(bubbleApp);
bubbleDocument
  .querySelector('[role="tab"][data-pestana="0"]')
  .dispatchEvent(new bubbleApp.w.KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
await sleep(150);
bubbleDocument.querySelector('[data-sesion="s-task"]').click();
await sleep(300);
assert.equal(bubbles().length, 0, "la tarea con arquetipo conserva las respuestas sin globo");
const models = [...bubbleDocument.querySelectorAll('span[aria-label="Proveedor"]')].map((el) => el.textContent ?? "");
assert.deepEqual(models, ["GPT-5.6", "Claude Sonnet 5"], "cada respuesta lleva el logo del agente y el modelo con su versión, incluido el traspaso");
assert.equal(
  bubbleDocument.querySelector("[data-answer-author]"),
  null,
  "el nombre del agente ya no firma la respuesta por encima",
);
assert.ok(bubbleDocument.querySelector(".bg-chat-user"), "el input de la persona lleva el tinte de marca en la tarea");
const taskTabEl = [...bubbleDocument.querySelectorAll(':is([role="tab"], [data-preview-header] [role="button"])')].find(tab => tab.textContent.includes("Una tarea"));
assert.ok(taskTabEl, "el título de la tarea distingue sus pestañas");
assert.match(taskTabEl.title, /^Una tarea(?: ·|$)/, "el título de la tarea manda también en la descripción de la pestaña");
const tabAvatar = taskTabEl.querySelector(".astro-face");
assert.equal(tabAvatar?.querySelector("svg")?.dataset.astroStatus, "awake", "el avatar de la pestaña es estático");
assert.equal(tabAvatar?.dataset.astroWorking, undefined, "el tab no anima un trabajo ajeno");
assert.ok(!tabAvatar?.querySelector("svg")?.classList.contains("opacity-[0.62]"), "el tab no atenúa al agente dormido");
assert.match(bubbleDocument.querySelector("header.bg-transparent")?.textContent ?? "", /Holmes/, "la cabecera conserva la identidad del agente");
taskTabEl.dispatchEvent(new bubbleApp.w.KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
await sleep(150);
bubbleDocument.querySelector('[data-sesion="s-plain"]').click();
await sleep(300);
assert.equal(bubbles().length, 0, "una tarea sin arquetipo conserva su salida sin globos");
assert.ok(bubbleDocument.querySelector(".bg-chat-user"), "la tarea sin arquetipo pinta igual el input de la persona");
bubbleDocument.querySelector('[data-sesion="s-transfer"]').click();
await sleep(300);
const transferredTab = [...bubbleDocument.querySelectorAll(':is([role="tab"], [data-preview-header] [role="button"])')].find(tab => tab.textContent.includes("Revisar entrega"));
assert.ok(transferredTab, "la tarea recibida conserva su título al cambiar de responsable");
assert.match(transferredTab.title, /^Revisar entrega(?: ·|$)/);
assert.equal(transferredTab.querySelector(".astro-face")?.getAttribute("data-astro-working"), null);
const transferredHeader = bubbleDocument.querySelector("header.bg-transparent");
assert.equal(bubbleDocument.querySelectorAll("header.bg-transparent").length, 1, "la tarea tiene una sola cabecera");
assert.match(transferredHeader.textContent, /Watson/, "la cabecera enseña al responsable de la nueva ejecución");
transferredHeader.querySelector("button").click();
// El perfil llega en su propio trozo: se espera a que pinte.
for (let i = 0; i < 120 && !bubbleDocument.querySelector('button[aria-label="Volver a la conversación"]'); i++) await sleep(25);
assert.match(bubbleDocument.querySelector('button[aria-label="Volver a la conversación"]')?.parentElement.parentElement.textContent ?? "", /Watson/, "la cabecera abre el perfil del responsable actual");
const fullProfile = bubbleDocument.querySelector('button[aria-label="Volver a la conversación"]').parentElement.parentElement;
for (const sectionEl of ["Perfil del agente", "Modelo", "Cara", "Fondo de la conversación", "Instrucciones", "Telegram"])
  assert.ok(fullProfile.textContent.includes(sectionEl), `falta ${sectionEl} en el perfil abierto desde la cabecera`);
assert.ok(fullProfile.querySelector('button[aria-label="La que sale de su nombre"]'), "el perfil conserva la edición de la cara");
assert.ok([...fullProfile.querySelectorAll("button")].some(button => button.textContent.includes("Elegir imagen")), "el perfil conserva la edición del fondo");
assert.ok(fullProfile.querySelector("textarea"), "las instrucciones del agente propio siguen editables");
assert.ok(fullProfile.querySelector('input[aria-label="Token del bot"]'), "Telegram conserva la configuración del bot");
const policyButton = text => [...bubbleDocument.querySelectorAll("button")].find(b => b.textContent.trim() === text);
for (let i = 0; i < 80 && !policyButton("Liberar cuarentena"); i++) await sleep(25);
assert.ok(fullProfile.textContent.includes("notes"));
assert.ok(fullProfile.textContent.includes("notes-server"));
assert.ok(!fullProfile.textContent.includes("UNAPPROVED_SENTINEL"), "list's unapproved slot reason is not effective availability");
policyButton("Liberar cuarentena").click();
await sleep(50);
policyButton("Confirmar").click();
await sleep(100);
assert.equal(policyButton("Confirmar").disabled, true, "uncertain release cannot be repeated");
policyButton("Cancelar").click();
await sleep(50);
assert.equal(policyButton("Liberar cuarentena").disabled, true, "closing the dialog keeps the pending receipt");
policyButton("Consultar resultado").click();
await sleep(150);
assert.equal(policyCalls.filter(c => c.request.action === "release").length, 1);
const resumed = policyCalls.find(c => c.request.action === "resume");
const released = policyCalls.find(c => c.request.action === "release");
assert.deepEqual(resumed.request, { action: "resume", operation: "handler-op" });
assert.equal(resumed.workspace, released.workspace);
assert.equal(resumed.project, released.project);
assert.equal(policyButton("Liberar cuarentena").disabled, false);
assert.deepEqual(bubbleApp.failures, []);
bubbleApp.w.close();

const agentSends = [];
const draftApp = await bootByFolder("listo", "agent-task-draft", {
  ...bubbleResponses,
  list_projects: [{ id: "p", name: "Proyecto", kind: "folder", working_directory: "/lab", sources: [] }],
  list_agents: { ...bubbleResponses.list_agents, agents: [
    { ...bubbleResponses.list_agents.agents[0], description: "Revisa cambios del proyecto." },
    { ...bubbleResponses.list_agents.agents[0], name: "Watson" },
  ] },
  list_agent_status: [{ name: "Holmes", status: "asleep", minutes_since_last_turn: 90, live_tasks: 0 }],
  send_message: args => { agentSends.push(args); return "new-agent-task"; },
});
const draftDoc = draftApp.w.document;
await sleep(80);
await talkFromFolder(draftApp, "p", "Holmes");
assert.match(draftDoc.querySelector("h1")?.textContent ?? "", /Holmes/);
assert.equal(draftDoc.querySelector("h1")?.closest("header")?.querySelector("[data-astro-status]")?.dataset.astroStatus, "awake", "a new agent task opens with the agent awake and without the pulse");
assert.match(draftDoc.body.textContent, /Revisa cambios del proyecto/);
assert.match(draftDoc.querySelector("textarea")?.closest("[data-agent-page]")?.textContent ?? "", /Proyecto/, "the agent draft shows which project it writes in");
assert.equal(draftDoc.querySelector('button[aria-label="Proyecto"]'), null, "an agent chat does not let the project change");
assert.equal(draftDoc.querySelector('button[aria-label="Rama base"]'), null, "una carpeta kn no ofrece ramas");
const draftField = draftDoc.querySelector("textarea");
draftField.value = "Revisa el cambio de login";
draftField.dispatchEvent(new draftApp.w.Event("input", { bubbles: true }));
await talkFromFolder(draftApp, "p", "Watson");
assert.equal(draftDoc.querySelector("textarea").value, "", "Watson no recibe el borrador sin enviar de Holmes");
const watsonField = draftDoc.querySelector("textarea");
watsonField.value = "Documenta el despliegue";
watsonField.dispatchEvent(new draftApp.w.Event("input", { bubbles: true }));
await talkFromFolder(draftApp, "p", "Holmes");
assert.equal(draftDoc.querySelector("textarea").value, "Revisa el cambio de login", "volver al agente conserva su encargo");
draftDoc.querySelector("textarea").dispatchEvent(new draftApp.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
await sleep(150);
assert.equal(agentSends.length, 1);
assert.equal(agentSends[0].project, "p");
assert.equal(agentSends[0].agent, "Holmes");
assert.equal(agentSends[0].taskFromAgent, true);
assert.equal(agentSends[0].baseRef, null);
assert.ok(draftDoc.querySelector('[data-sidebar-tasks] [data-sesion="new-agent-task"] [data-session-agent]'), "el primer mensaje crea una tarea visible con la pastilla de su arquetipo");
const activeDraftRow = draftDoc.querySelector('[data-sidebar-tasks] [data-sesion="new-agent-task"]');
assert.equal(activeDraftRow.querySelectorAll("[data-session-agent]").length, 1, "la identidad activa se pinta una sola vez");
assert.ok(activeDraftRow.querySelector('[data-session-status] [data-task-orbit] [data-astro-status="working"]'), "la cara activa va dentro del arco a la derecha del título");
assert.equal(activeDraftRow.querySelector('[data-session-preview] [data-session-agent]'), null, "la segunda línea no duplica la cara activa");
assert.deepEqual(draftApp.failures, []);
draftApp.w.close();

// El menú de `@` separa los del repositorio de los tuyos, no enseña a los
// ocultos y marca al tuyo que el repositorio tapa sin dejar elegirlo.
const holmes = bubbleResponses.list_agents.agents[0];
const mentionAgentsApp = await bootByFolder("listo", "agent-mentions", {
  ...bubbleResponses,
  list_projects: [{ id: "p", name: "Proyecto", kind: "folder", working_directory: "/lab", sources: [] }],
  list_agents: { ...bubbleResponses.list_agents, agents: [
    holmes,
    { ...holmes, name: "Hudson", origin: ".danil/agents/hudson.md" },
    { ...holmes, name: "Watson", own: true, own_scope: { kind: "workspace" } },
  ] },
  list_agent_profiles: { Hudson: { display_name: null, body: null, background: null, avatar: null, veil: 0.82, provider: null, model: null, effort: null, hidden: true } },
  list_machine_agents: { own: [{
    agent: { ...holmes, own: true, own_scope: { kind: "workspace" } }, profile: {}, folders: [], all_folders: true,
    blocked: [{ folder: "p", origin: holmes.origin, repository: true }], catalog_taken: null,
  }], repository: [] },
});
const mentionAgentsDoc = mentionAgentsApp.w.document;
await sleep(80);
await talkFromFolder(mentionAgentsApp, "p", "Holmes");
const agentsField = mentionAgentsDoc.querySelector("textarea");
agentsField.value = "@";
agentsField.selectionStart = agentsField.selectionEnd = 1;
agentsField.dispatchEvent(new mentionAgentsApp.w.InputEvent("input", { bubbles: true, inputType: "insertText" }));
agentsField.dispatchEvent(new mentionAgentsApp.w.KeyboardEvent("keyup", { bubbles: true, key: "@" }));
await sleep(120);
const agentsMenu = mentionAgentsDoc.querySelector("button[aria-selected]")?.closest("ul");
const menuLines = [...agentsMenu.querySelectorAll("li")].map(li => li.textContent.replace(/\s+/g, " ").trim());
assert.match(menuLines[0], /^Del repositorio Proyecto ?vía PR ?Holmes/, menuLines.join(" | "));
assert.match(menuLines[1], /^Tuyos ?Watson/, menuLines.join(" | "));
assert.equal(menuLines.filter(line => line.includes("Holmes")).length, 1, "el tuyo que el repositorio tapa no sale");
assert.equal(menuLines.some(line => /Tapado|Encargado/.test(line)), false, "las filas dicen «Agente», sin «Tapado»");
assert.equal(menuLines.some(line => line.includes("Hudson")), false, "un agente oculto no sale en el menú, como en el riel");
assert.deepEqual(mentionAgentsApp.failures, []);
mentionAgentsApp.w.close();

let threadRows = [
  { ...agentRow, id: "dm", title: "Holmes", chat_de_agente: true, agent_thread: false },
  { ...agentRow, id: "topic", title: "Release planning", chat_de_agente: true, agent_thread: true, pinned: false, updated_at: 100, launcher_name: "Watson" },
  { ...agentRow, id: "new-topic", title: "Independent topic", chat_de_agente: true, agent_thread: true, updated_at: 90 },
  { ...agentRow, id: "archived-work", title: "Old investigation", last_message: "Historical finding", archived: true, chat_de_agente: false, launched_by: "dm", launcher_name: "Holmes" },
  { ...agentRow, id: "dm-work", title: "DM task", chat_de_agente: false, launched_by: "dm", launcher_name: "Holmes" },
  { ...agentRow, id: "topic-work", title: "Topic task", last_message: "Topic task progress", chat_de_agente: false, pinned: true, launched_by: "topic", launcher_name: "Watson" },
  { ...agentRow, id: "topic-work-2", title: "Second topic task", chat_de_agente: false, pinned: false, launched_by: "topic", launcher_name: "Holmes" },
  { ...agentRow, id: "8cnv428n", title: "Revisa seguridad escrituras alfa Inbox y Broadcasts", chat_de_agente: false, pinned: false, launched_by: "n8tc0emm", launcher_available: false, launcher_name: "tech-lead" },
  { ...agentRow, id: "unrelated-work", title: "Other task", agent: null, chat_de_agente: false, launched_by: "other-chat", launcher_name: "Other agent" },
];
const threadLoads = [];
const pinChanges = [];
let threadProjects = bubbleResponses.list_projects;
const threadApp = await bootByFolder("listo", "agent-threads", {
  ...bubbleResponses,
  list_projects: () => threadProjects,
  list_delegated_sessions: ({ id }) => threadRows.filter(row => row.launched_by === id).map(row => ({ ...row, folder: "p" })),
  task_coordinator: ({ id }) => {
    const row = threadRows.find(row => row.id === id);
    const root = threadRows.find(root => root.id === row?.launched_by);
    return root ? { folder: "p", task: root.id, title: root.title, provider: root.provider } : null;
  },
  list_live_sessions: ({ project }) => project === "p" ? threadRows : [],
  set_session_pinned: ({ project, id, pinned }) => {
    pinChanges.push({ project, id, pinned });
    threadRows = threadRows.map(row => row.id === id ? { ...row, pinned } : row);
    return null;
  },
  list_session_git: () => ({ "topic-work": { kind: "branch", branch: "feature/release", alias: "Orion", repository: "/lab", shared_with: null, pull: null } }),
  load_session: ({ id }) => {
    threadLoads.push(id);
    return { ...WITH_TASK.load_session, ...threadRows.find(row => row.id === id), id,
      turns: id === "topic" ? [
        { role: "system", id: "topic-launch", text: "", meta: "task_launched",
          from_task: { folder: "p", task: "topic-work", title: "Topic task", provider: "codex" } },
        { role: "system", id: "topic-launch-2", text: "", meta: "task_launched",
          from_task: { folder: "p", task: "topic-work-2", title: "Second topic task", provider: "codex" } },
      ] : [] };
  },
});
threadApp.w.scrollTo = () => {};
const threadDoc = threadApp.w.document;
await sleep(100);
const sidebarTask = id => threadDoc.querySelector(`[data-sidebar-tasks] [data-sesion="${id}"]`);
assert.equal(sidebarTask("dm")?.dataset.pinned, "true", "el chat anterior nace fijado entre las tareas");
assert.equal(sidebarTask("new-topic")?.dataset.pinned, "true", "los temas anteriores heredan el pin");
assert.equal(sidebarTask("topic")?.dataset.pinned, undefined, "un pin explícito del backend prevalece sobre el valor heredado");
assert.equal(sidebarTask("topic-work")?.dataset.pinned, "true", "una tarea nueva puede venir fijada del backend");
assert.equal(threadDoc.querySelector('[data-sidebar-tasks] [data-task-author]'), null, "el riel no agrupa por agente");
assert.equal(sidebarTask("dm-work"), null, "el trabajo delegado se consulta desde su coordinador");
assert.ok(sidebarTask("topic-work").querySelector("[data-session-agent]"), "la tarea delegada fijada conserva la tarjeta compartida");
assert.equal(sidebarTask("8cnv428n"), null, "la delegada de un padre archivado ausente no sube al riel");
assert.equal(sidebarTask("topic").querySelector("[data-session-opener]"), null, "un nombre de lanzador sin relación no inventa un origen");
assert.equal(sidebarTask("topic-work").querySelector("[data-session-opener]"), null, "la delegada fijada no muestra quién la abrió en el riel");
const taskOrder = [...threadDoc.querySelectorAll('[data-sidebar-tasks] [data-sesion]')].map(row => row.dataset.sesion);
assert.ok(taskOrder.indexOf("topic-work") < taskOrder.indexOf("topic"), "las fijadas van antes que las demás sin alterar sus turnos");
const openPinnedTaskMenu = id => sidebarTask(id).querySelector('[data-session-actions] button[aria-haspopup="menu"]').click();
const menuItems = () => [...threadDoc.querySelectorAll('[role="menu"] [role="menuitem"]')];
const pinMenuItem = label => menuItems().find(item => item.textContent.trim() === label);
const closeMenu = async () => {
  threadDoc.dispatchEvent(new threadApp.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(50);
};
// El menú conserva su propio hueco y no sustituye la identidad de la tarjeta.
assert.equal(sidebarTask("dm").querySelector("[data-session-pin]"), null, "fijar no tiene botón propio en la tarjeta");
assert.equal(sidebarTask("dm").querySelector(".bg-linear-to-l"), null, "la tarjeta no lleva el velo degradado de las acciones");
assert.ok(sidebarTask("dm").querySelector('[data-session-actions] button[aria-haspopup="menu"]'),
  "el menú permanece disponible junto al título");
assert.equal(sidebarTask("dm").querySelector('[data-session-status] [data-session-actions]'), null,
  "el menú no ocupa la identidad fija");
// Fijada: el alfiler va en el hueco del borde, no dentro de la tarjeta.
assert.ok(sidebarTask("dm").querySelector('[role="img"][aria-label="Fijada"] svg.tarjeta-fijada-alfiler'), "la fijada lleva su alfiler en el borde");
assert.ok(sidebarTask("dm").className.includes("tarjeta-fijada"), "la fijada dibuja su borde con ::after");
assert.equal(sidebarTask("dm").querySelector('[data-session-preview] [aria-label="Fijada"]'), null);
openPinnedTaskMenu("dm");
await sleep(50);
assert.equal(menuItems()[0]?.textContent.trim(), "Desfijar", "fijar es lo primero del menú");
assert.equal(pinMenuItem("Etapa"), undefined, "la tarjeta del riel no marca la etapa");
assert.equal(pinMenuItem("Archivar tarea"), undefined, "una tarea fijada no ofrece archivado");
pinMenuItem("Desfijar").click();
await sleep(150);
assert.deepEqual(pinChanges.at(-1), { project: "p", id: "dm", pinned: false });
assert.equal(sidebarTask("dm")?.dataset.pinned, undefined);
assert.equal(sidebarTask("dm").querySelector('[role="img"][aria-label="Fijada"]:has(svg.tarjeta-fijada-alfiler)'), null, "sin fijar no queda alfiler");
await closeMenu();
openPinnedTaskMenu("dm");
await sleep(50);
assert.equal(menuItems()[0]?.textContent.trim(), "Fijar");
pinMenuItem("Fijar").click();
await sleep(150);
assert.equal(sidebarTask("dm")?.dataset.pinned, "true", "la tarea se vuelve a fijar desde el mismo menú");
await closeMenu();
assert.equal(threadDoc.querySelector('[data-agent-conversations]'), null, "los historiales antiguos solo aparecen en Tareas");
sidebarTask("dm").click();
await sleep(200);
assert.equal(threadLoads.at(-1), "dm");
assert.equal(threadDoc.querySelector("textarea"), null, "el chat anterior solo permite leer el historial");
keepActiveView(threadApp);
sidebarTask("topic").click();
await sleep(200);
assert.equal(threadLoads.at(-1), "topic");
const tabText = tab => tab.querySelector(".truncate").textContent;
const tabOf = text => [...threadDoc.querySelectorAll(':is([role="tab"], [data-preview-header] [role="button"])')].find(tab => tabText(tab) === text);
assert.ok(tabOf("Release planning"), "el tema histórico conserva su título");
assert.match(tabOf("Release planning").title, /^Holmes · Release planning/);
assert.ok(tabOf("Holmes"), "el chat directo antiguo sigue accesible");
assert.ok(threadDoc.querySelector('[data-delegated-launch="topic-work"] [data-sesion="topic-work"]'), "el lanzamiento reabierto usa la tarjeta de tareas");
assert.ok(threadDoc.querySelector('[data-delegated-launch="topic-work-2"] [data-sesion="topic-work-2"]'), "el grupo conserva cada tarjeta creada");
const createdHeadings = [...threadDoc.querySelectorAll("h3")].filter(heading => heading.textContent === "Tareas creadas");
assert.equal(createdHeadings.length, 1, "un grupo de tareas creadas lleva un solo rótulo");
assert.ok(createdHeadings[0].compareDocumentPosition(threadDoc.querySelector('[data-delegated-launch="topic-work"]')) & threadApp.w.Node.DOCUMENT_POSITION_FOLLOWING,
  "el rótulo antecede a la primera tarea creada");
const delegatedToolbar = threadDoc.querySelector('[data-delegated-trigger="toolbar"]');
assert.ok(delegatedToolbar, "la barra derecha permite consultar subtareas de una conversación existente");
// En la tarjeta del riel el estado va en su hueco de 16 px, a la derecha del título.
const previewOfCoordinator = () => sidebarTask("topic").querySelector("[data-session-status]");
threadApp.emit("chat", { kind: "started", session: "topic-work", workspace: "w" });
await sleep(100);
assert.equal(previewOfCoordinator().querySelectorAll('[aria-label$="Está trabajando"]').length, 1,
  "el coordinador conserva un foco de actividad cuando solo trabaja su subtarea");
threadApp.emit("chat", { kind: "started", session: "topic", workspace: "w" });
await sleep(100);
assert.equal(previewOfCoordinator().querySelectorAll('[aria-label$="Está trabajando"]').length, 1,
  "un solo estado ocupa su columna, sin contador de subtareas");
assert.equal(sidebarTask("topic").querySelectorAll("[data-session-status]").length, 1, "el estado ocupa una sola ranura");
assert.equal(previewOfCoordinator().querySelectorAll("[data-task-orbit]").length, 1, "la ranura lleva una sola órbita");
assert.equal(previewOfCoordinator().querySelectorAll("[data-session-agent]").length, 1, "una sola identidad vive dentro de la órbita");
assert.equal(previewOfCoordinator().textContent.trim(), "", "la ranura no añade un contador de subtareas");
threadApp.emit("chat", { kind: "done", session: "topic", workspace: "w", ok: true });
await sleep(200);
assert.equal(previewOfCoordinator().querySelectorAll('[aria-label$="Está trabajando"]').length, 1,
  "terminar el turno principal conserva la actividad delegada");
threadApp.emit("chat", { kind: "done", session: "topic-work", workspace: "w", ok: true });
await sleep(200);
assert.equal(previewOfCoordinator().querySelectorAll('[aria-label$="Está trabajando"]').length, 0,
  "el foco de actividad se apaga al terminar la última subtarea");
const toolbarButtons = [...delegatedToolbar.parentElement.querySelectorAll("button")];
assert.deepEqual(toolbarButtons.map(button => button.getAttribute("aria-label")), [
  "Buscar en esta tarea", delegatedToolbar.getAttribute("aria-label"), "Archivos de la tarea",
], "la fila ordena búsqueda y subtareas, y acaba en los archivos de la tarea");
delegatedToolbar.click();
await sleep(50);
assert.equal([...threadDoc.querySelectorAll('button')].find(button => button.textContent === "Activas")?.getAttribute("aria-pressed"), "true",
  "el filtro predeterminado de subtareas se llama Activas");
[...threadDoc.querySelectorAll('button')].find(button => button.textContent === "Todas").click();
await sleep(50);
assert.ok(threadDoc.querySelector('[data-delegated-list] [data-sesion="topic-work"]'), "el desplegable conserva trabajo de turnos anteriores");
assert.equal(threadDoc.querySelector('[data-delegated-list] [data-folder-chip]'), null, "las delegadas no repiten la carpeta de su madre");
threadDoc.querySelector('[data-delegated-list] [data-sesion="topic-work"]').click();
await sleep(200);
assert.equal(threadLoads.at(-1), "topic-work", "la tarjeta abre la tarea de su carpeta");
threadDoc.querySelector('[data-task-coordinator]').click();
await sleep(200);
assert.equal(threadLoads.at(-1), "topic", "la tarea delegada regresa al coordinador");
assert.equal(threadDoc.querySelector("textarea"), null, "el tema anterior no abre turnos nuevos");
await talkFromFolder(threadApp, "p", "Holmes");
assert.equal(threadDoc.querySelector('[role="dialog"]'), null, "una conversación nueva abre el borrador del agente");
assert.match(threadDoc.querySelector("h1")?.textContent ?? "", /Holmes/);
assert.ok(threadDoc.querySelector("textarea"), "la conversación nueva tiene composer");
assert.equal(threadApp.commands.includes("create_agent_thread"), false);
threadProjects = structuredClone(threadProjects);
threadApp.emit("cli-changed", { workspace: null, command: "task send" });
await sleep(350);
assert.ok(sidebarTask("dm"), "refrescar conserva el historial antiguo entre las tareas");
assert.deepEqual(threadApp.failures, []);
threadApp.w.close();

// Una Bandeja antigua sigue accesible y cada mensaje conserva su remitente.
const inboxRows = [...threadRows.filter(row => row.id === "dm" || row.id === "topic"), { ...agentRow, id: "inbox", title: "Bandeja", chat_de_agente: true, agent_thread: true, inbox: true }];
const inboxLoads = [];
const inboxTurns = [
  { role: "system", meta: "recibido", text: "Mensaje de @Watson. Salto 1." },
  { role: "user", text: "Revisa el diseño", agent: "Watson", from_task: { folder: "p", task: "watson-chat", title: "Watson", provider: "claude" } },
  { role: "system", meta: "recibido", text: "Mensaje de la tarea «Corregir login». Salto 1." },
  { role: "user", text: "Ya quedó el login", from_task: { folder: "p", task: "login", title: "Corregir login", provider: "codex" } },
  { role: "agent", text: "Recibido." },
];
const inboxApp = await boot("listo", "agent-inbox", {
  ...bubbleResponses,
  list_live_sessions: ({ project }) => project === "p" ? inboxRows : [],
  load_session: ({ id }) => {
    inboxLoads.push(id);
    const row = inboxRows.find(r => r.id === id);
    return { ...WITH_TASK.load_session, ...row, id, turns: id === "inbox" ? inboxTurns : [] };
  },
});
inboxApp.w.scrollTo = () => {};
const inboxDoc = inboxApp.w.document;
await sleep(100);
assert.equal(inboxDoc.querySelector('[data-sidebar-tasks] [data-sesion="inbox"]')?.dataset.pinned, "true", "la Bandeja anterior aparece fijada entre las tareas");
assert.equal(inboxDoc.querySelector('[data-agent-inbox]'), null, "la Bandeja no tiene una sección aparte");
inboxDoc.querySelector('[data-sidebar-tasks] [data-sesion="inbox"]').click();
await sleep(300);
assert.equal(inboxApp.commands.includes("open_agent_inbox"), false);
assert.equal(inboxLoads.at(-1), "inbox");
assert.equal(inboxDoc.querySelector("textarea"), null, "la Bandeja anterior no inicia turnos nuevos");
assert.equal(inboxDoc.querySelector('[data-agent-thread]'), null, "no quedan temas anidados bajo los agentes");
assert.ok([...inboxDoc.querySelectorAll(':is([role="tab"], [data-preview-header] [role="button"]) .truncate')].some(label => label.textContent === "Holmes · Bandeja anterior"), "la Bandeja conserva el agente en su pestaña");
const agentSigned = inboxDoc.querySelector('[data-sender="agent"]');
assert.ok(agentSigned, "un mensaje de agente lleva su firma");
assert.match(agentSigned.textContent, /Watson/);
assert.ok(agentSigned.closest("[class]").parentElement.querySelector('[role="img"], svg, img'), "y su cara");
const taskSigned = inboxDoc.querySelector('[data-sender="task"] button');
assert.equal(taskSigned?.textContent, "Corregir login", "un mensaje de tarea lleva su título");
assert.ok(inboxDoc.querySelectorAll('[data-sender="system"]').length >= 2, "y lo que avisa el sistema se pinta como sistema, no como un mensaje");
taskSigned.click();
await sleep(200);
assert.equal(inboxLoads.at(-1), "login", "el título de la tarea la abre");
assert.deepEqual(inboxApp.failures, []);
inboxApp.w.close();

// Los árboles montados conservan sus relojes: el proceso no termina solo.
process.exit(0);
