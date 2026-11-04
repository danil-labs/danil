#!/usr/bin/env node
/** Preguntas vivas, tareas que nacen y permisos elegidos en la caja. */
import assert from "node:assert/strict";
import { sleep } from "../../tests/helpers/jsdom-app.mjs";
import { TASK_AFTER_QUEUE, boot } from "../../tests/helpers/mount-guard.mjs";

// Contestar una pregunta viva después de ir a otra tarea y volver.
//
// El `request_id` llega por el evento y vive en `vivo`; cada relectura
// reconstruye `base` del disco, y a la segunda vuelta no queda de dónde
// copiarlo. Sin él la respuesta sale por `send_message`, que la rechaza.
const QUESTION = {
  role: "agent",
  id: "t-preg",
  text: "¿Sigo?",
  questions: [
    {
      id: "q1",
      question: "¿Sigo?",
      options: [{ value: "o1", label: "Dale" }, { value: "o2", label: "Para" }],
      multiple: false,
      free_text: false,
    },
  ],
};
const threads = {
  s1: [{ role: "user", id: "u1", text: "Empieza" }],
  s2: [{ role: "user", id: "u2", text: "Otra cosa" }],
};
const answered = [];
const sentAnswers = [];
const cancelledAnswers = [];
const LIVE_QUESTION = {
  ...TASK_AFTER_QUEUE,
  list_live_sessions: [
    { ...TASK_AFTER_QUEUE.list_live_sessions[0], id: "s1", title: "Con pregunta" },
    { ...TASK_AFTER_QUEUE.list_live_sessions[0], id: "s2", title: "La otra" },
  ],
  load_session: ({ id }) => ({ ...TASK_AFTER_QUEUE.load_session, id, turns: threads[id] }),
  pending_requests: ({ session }) =>
    session === "s1"
      ? { questions: [{ id: "durable-req-1", revision: 3, request_id: "req-1", turn: "t-preg" }, { id: "durable-req-dos", revision: 1, request_id: "req-dos", turn: "t-dos" }], permissions: [] }
      : { questions: [], permissions: [] },
  answer_question: (args) => {
    answered.push(args);
    return {
      role: "user",
      id: "t-resp",
      text: "Dale",
      answers: [
        { turn: "t-preg", question: "q1", question_text: "¿Sigo?", chosen: ["o1"], text: "Dale", source: "persona", when: 0 },
      ],
      author: null,
    };
  },
  send_message: (args) => {
    sentAnswers.push(args);
    throw "history.error.busy";
  },
  cancel_question: (args) => {
    cancelledAnswers.push(args);
    return {
      role: "user",
      id: "t-cierre",
      text: "",
      answers: [
        { turn: args.turn, question: "q1", question_text: "¿Sigo?", chosen: [], text: "", source: "persona", when: 0 },
      ],
      author: null,
    };
  },
};
const withQuestion = await boot("listo", "pregunta-viva", LIVE_QUESTION);
const docP = withQuestion.w.document;
docP.querySelector('[data-sesion="s1"]')?.click();
await sleep(150);
withQuestion.emit("chat", { kind: "started", session: "s1", workspace: "w" });
withQuestion.emit("question", {
  workspace: "w",
  session: "s1",
  turno: "t-preg",
  preguntas: QUESTION.questions,
  request_id: "req-1",
});
await sleep(120);
// Lo que hace el backend al preguntar: persiste el tramo y sigue esperando.
threads.s1 = [...threads.s1, QUESTION];
for (let roundTrip = 0; roundTrip < 2; roundTrip++) {
  docP.querySelector('[data-sesion="s2"]')?.click();
  await sleep(150);
  docP.querySelector('[data-sesion="s1"]')?.click();
  await sleep(150);
}
const option = [...docP.querySelectorAll("button")].find((b) =>
  b.getAttribute("aria-label")?.endsWith("Dale"),
);
if (!option) {
  console.error("Al volver a la tarea, la pregunta pendiente no ofrece sus opciones.");
  process.exit(1);
}
// El rechazo llega por una promesa que Solid no espera: sin recogerlo, Node
// mata este guarda antes de decir qué falló.
const rejections = [];
const recordRejection = (e) => rejections.push(e);
process.on("unhandledRejection", recordRejection);
option.click();
await sleep(200);
process.off("unhandledRejection", recordRejection);
if (answered.length !== 1 || sentAnswers.length > 0) {
  console.error(
    "Contestar tras ir y volver no usa el canal vivo: " +
      `answer_question=${answered.length}, send_message=${sentAnswers.length}.`,
  );
  process.exit(1);
}
assert.equal(answered[0].requestId, "durable-req-1");
assert.equal(answered[0].revision, 3);

// Esc cierra la pregunta sin contestarla y devuelve la caja de escribir.
// Mientras el agente espere, esa caja no existe.
withQuestion.emit("question", {
  workspace: "w",
  session: "s1",
  turno: "t-preg2",
  preguntas: QUESTION.questions,
  request_id: "req-2",
});
await sleep(150);
if (docP.querySelector("textarea")) {
  console.error("Con una pregunta delante, la caja de escribir sigue ahí.");
  process.exit(1);
}
const pinnedRow = [...docP.querySelectorAll("button")].find((b) =>
  b.getAttribute("aria-label")?.endsWith("Dale"),
);
pinnedRow?.dispatchEvent(
  new withQuestion.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
);
await sleep(200);
if (cancelledAnswers.length !== 1 || !docP.querySelector("textarea")) {
  console.error(
    "Esc no cierra la pregunta: " +
      `cancel_question=${cancelledAnswers.length}, caja=${!!docP.querySelector("textarea")}.`,
  );
  process.exit(1);
}
assert.equal(cancelledAnswers[0].turn, "t-preg2");
// Y el botón hace lo mismo que la tecla.
withQuestion.emit("question", {
  workspace: "w",
  session: "s1",
  turno: "t-preg3",
  preguntas: QUESTION.questions,
  request_id: "req-3",
});
await sleep(150);
[...docP.querySelectorAll("button")]
  .find((b) => b.textContent?.trim().startsWith("Omitir"))
  ?.click();
await sleep(200);
if (cancelledAnswers.length !== 2 || !docP.querySelector("textarea")) {
  console.error("El botón Omitir no cierra la pregunta.");
  process.exit(1);
}

// Dos preguntas: el paginador cuenta, un número elige y pasa a la
// siguiente, n+1 abre «Otra» y ⌘↵ manda lo escrito.
const TWO_QUESTIONS = [
  QUESTION.questions[0],
  {
    id: "q2",
    question: "¿Con qué color?",
    header: "Color",
    options: [{ value: "a", label: "Azul" }, { value: "v", label: "Verde" }],
    multiple: false,
    free_text: true,
  },
];
withQuestion.emit("question", {
  workspace: "w",
  session: "s1",
  turno: "t-dos",
  preguntas: TWO_QUESTIONS,
  request_id: "req-dos",
});
await sleep(150);
const cardTwo = docP.querySelector('[data-interruption="question"]');
const keyOnTwo = (key, extra = {}) =>
  (docP.activeElement && cardTwo.contains(docP.activeElement) ? docP.activeElement : cardTwo)
    .dispatchEvent(new withQuestion.w.KeyboardEvent("keydown", { key, bubbles: true, ...extra }));
assert.match(cardTwo.textContent, /1 de 2/);
assert.match(cardTwo.textContent, /Respondidas 0\/2/);
const questionHeading = () => cardTwo.querySelector("p")?.previousElementSibling?.textContent;
assert.equal(questionHeading(), "El agente pregunta", "sin header va el texto del catálogo");
keyOnTwo("2");
await sleep(50);
assert.match(cardTwo.textContent, /¿Con qué color\?/, "un número elige y pasa a la siguiente");
assert.equal(questionHeading(), "Color", "el header de Claude va encima de la pregunta");
assert.match(cardTwo.textContent, /Respondidas 1\/2/);
keyOnTwo("3");
await sleep(50);
const otherField = cardTwo.querySelector("textarea");
assert.ok(otherField, "n+1 abre el campo de «Otra»");
otherField.value = "Morado";
otherField.dispatchEvent(new withQuestion.w.Event("input", { bubbles: true }));
await sleep(20);
const beforeTwo = answered.length;
otherField.dispatchEvent(
  new withQuestion.w.KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }),
);
await sleep(200);
assert.equal(answered.length, beforeTwo + 1, "⌘↵ en la última manda las respuestas");
assert.deepEqual(answered.at(-1).respuestas, [
  { turn: "t-dos", question: "q1", chosen: ["o2"], free_text: null },
  { turn: "t-dos", question: "q2", chosen: [], free_text: "Morado" },
]);
assert.deepEqual(withQuestion.failures, []);

// Solo se monta la pestaña que se ve. Una pregunta de tres páginas contestada
// a medias vuelve en la misma página, con lo elegido y lo escrito en «Otra»,
// y lo plegado sigue plegado. Otra tarea con el mismo turno no lo hereda, otro
// turno empieza vacío y cerrar la pestaña lo suelta todo. La traza se imprime:
// es lo que se revisa en el log de la cadena.
const THREE = [
  { id: "q1", question: "¿Sigo?", options: [{ value: "o1", label: "Dale" }, { value: "o2", label: "Para" }], multiple: false, free_text: false },
  {
    id: "q2",
    question: "¿Qué colores?",
    options: [{ value: "a", label: "Azul" }, { value: "v", label: "Verde" }, { value: "r", label: "Rojo" }],
    multiple: true,
    free_text: false,
  },
  { id: "q3", question: "¿Qué nombre?", options: [{ value: "si", label: "El de siempre" }, { value: "no", label: "Otro nuevo" }], multiple: false, free_text: true },
];
const withThree = (id) => [
  { role: "user", id: `u-${id}`, text: "Empieza" },
  { role: "agent", id: `t-antes-${id}`, text: "Revisé la carpeta.", tools: [{ name: "Bash", target: "ls -la", ok: true }] },
  { role: "agent", id: "t-tres", text: "Antes de seguir", questions: THREE },
];
const threadsThree = { p1: withThree("p1"), p2: withThree("p2"), p3: [{ role: "user", id: "u3", text: "Tres" }], p4: [{ role: "user", id: "u4", text: "Cuatro" }] };
const threeTies = { p1: [{ id: "durable-req-p1", revision: 2, request_id: "req-p1", turn: "t-tres" }], p2: [{ id: "durable-req-p2", revision: 2, request_id: "req-p2", turn: "t-tres" }] };
const answeredThree = [];
const titles = { p1: "Pregunta uno", p2: "Pregunta dos", p3: "Tres", p4: "Cuatro" };
const HALF_ANSWERED = {
  ...TASK_AFTER_QUEUE,
  list_live_sessions: Object.entries(titles).map(([id, title]) => ({ ...TASK_AFTER_QUEUE.list_live_sessions[0], id, title })),
  load_session: ({ id }) => ({ ...TASK_AFTER_QUEUE.load_session, id, turns: threadsThree[id] }),
  pending_requests: ({ session }) => ({ questions: threeTies[session] ?? [], permissions: [] }),
  answer_question: (args) => {
    answeredThree.push(args);
    threeTies[args.session] = [];
    return {
      role: "user",
      id: `resp-${args.requestId}`,
      text: "Hecho",
      answers: args.respuestas.map((r) => ({ turn: r.turn, question: r.question, question_text: "", chosen: r.chosen, text: "Hecho", source: "persona", when: 0 })),
      author: null,
    };
  },
};
const halfAnswered = await boot("listo", "preguntas-a-medias", HALF_ANSWERED);
const docHalf = halfAnswered.w.document;
const trace = [];
const openTaskTab = async (id) => {
  docHalf.querySelector(`[data-sesion="${id}"]`)?.click();
  await sleep(150);
};
// La tarjeta que se ve: las de pestañas montadas y escondidas no cuentan.
const card = () =>
  [...docHalf.querySelectorAll('[data-interruption="question"]')].find((el) => !el.closest(".hidden, [hidden]"));
const keyOnCard = async (key, extra = {}) => {
  card().dispatchEvent(new halfAnswered.w.KeyboardEvent("keydown", { key, bubbles: true, ...extra }));
  await sleep(40);
};
const optionM = (label) =>
  [...card().querySelectorAll("button[data-option]")].find((b) => b.getAttribute("aria-label")?.endsWith(`. ${label}`));
// La tira de pestañas también lleva `data-ventana`: la celda es la que tiene la conversación.
const cellM = () =>
  [...docHalf.querySelectorAll("[data-ventana]")].find(
    (el) => !el.classList.contains("hidden") && el.querySelector('[data-interruption="question"], textarea'),
  );
const segment = () =>
  [...cellM().querySelectorAll("button[aria-expanded]")].find(
    (b) => !b.closest('section[aria-label="Preguntas"]') && b.querySelector("svg.lucide-chevron-right"),
  );
const buttonM = (label) => cellM().querySelector(`button[aria-label="${label}"]`);
const snapshot = (stepName) => {
  const el = card();
  const viewEl = {
    paso: stepName,
    tramo: segment()?.getAttribute("aria-expanded") ?? null,
    plegada: !!buttonM("Mostrar preguntas"),
    pagina: el?.textContent.match(/(\d) de 3/)?.[0] ?? null,
    respondidas: el?.textContent.match(/Respondidas \d\/3/)?.[0] ?? null,
    elegidas: el ? [...el.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.getAttribute("aria-label")) : [],
    otra: el?.querySelector("textarea")?.value ?? null,
  };
  trace.push(viewEl);
  return viewEl;
};

await openTaskTab("p1");
assert.deepEqual(snapshot("p1 al abrir"), { paso: "p1 al abrir", tramo: "false", plegada: false, pagina: "1 de 3", respondidas: "Respondidas 0/3", elegidas: [], otra: null });
await keyOnCard("1");
optionM("Azul").click();
await sleep(40);
optionM("Rojo").click();
await sleep(40);
await keyOnCard("ArrowRight");
await keyOnCard("3");
const otherM = card().querySelector("textarea");
assert.ok(otherM, "n+1 abre «Otra» en la tercera página");
otherM.value = "Morado";
otherM.dispatchEvent(new halfAnswered.w.Event("input", { bubbles: true }));
await sleep(40);
assert.deepEqual(snapshot("p1 a medias"), { paso: "p1 a medias", tramo: "false", plegada: false, pagina: "3 de 3", respondidas: "Respondidas 3/3", elegidas: [], otra: "Morado" });
const cardOfP1 = card();
segment().click();
buttonM("Plegar preguntas").click();
await sleep(40);
assert.deepEqual(snapshot("p1 plegada").tramo, "true");
assert.equal(card(), undefined, "plegar no escondió la tarjeta");

await openTaskTab("p2");
assert.equal(cardOfP1.isConnected, false, "la pestaña de p1 sigue montada detrás de p2");
assert.deepEqual(
  snapshot("p2, mismo turno y mismos ids"),
  { paso: "p2, mismo turno y mismos ids", tramo: "false", plegada: false, pagina: "1 de 3", respondidas: "Respondidas 0/3", elegidas: [], otra: null },
  "lo elegido o lo plegado en una tarea aparece en otra",
);
await keyOnCard("2");
await openTaskTab("p3");
await openTaskTab("p4");

await openTaskTab("p1");
const roundTrip = snapshot("p1 al volver, plegada");
assert.equal(roundTrip.tramo, "true", "al remontar se plegó el tramo que estaba desplegado");
assert.equal(roundTrip.plegada, true, "al remontar se desplegó la pregunta plegada");
buttonM("Mostrar preguntas").click();
await sleep(40);
assert.notEqual(card(), cardOfP1, "p1 volvió sin remontarse");
assert.deepEqual(
  snapshot("p1 al volver"),
  { paso: "p1 al volver", tramo: "true", plegada: false, pagina: "3 de 3", respondidas: "Respondidas 3/3", elegidas: [], otra: "Morado" },
  "al remontar la tarjeta se perdió la página o «Otra»",
);
await keyOnCard("ArrowLeft");
assert.deepEqual(snapshot("p1, página 2").elegidas, ["1. Azul", "3. Rojo"], "al remontar se perdió lo elegido en la segunda");
await keyOnCard("ArrowLeft");
assert.deepEqual(snapshot("p1, página 1").elegidas, ["1. Dale"], "al remontar se perdió lo elegido en la primera");

await openTaskTab("p2");
assert.deepEqual(snapshot("p2 al volver").respondidas, "Respondidas 1/3");
await openTaskTab("p1");
await keyOnCard("Enter", { metaKey: true });
await keyOnCard("Enter", { metaKey: true });
await keyOnCard("Enter", { metaKey: true });
await sleep(200);
assert.equal(answeredThree.length, 1, "⌘↵ en la última no mandó las respuestas");
assert.equal(answeredThree[0].requestId, "durable-req-p1");
assert.equal(answeredThree[0].revision, 2);
assert.deepEqual(answeredThree[0].respuestas, [
  { turn: "t-tres", question: "q1", chosen: ["o1"], free_text: null },
  { turn: "t-tres", question: "q2", chosen: ["a", "r"], free_text: null },
  { turn: "t-tres", question: "q3", chosen: [], free_text: "Morado" },
]);
threadsThree.p1 = [...threadsThree.p1, { role: "user", id: "resp-durable-req-p1", text: "Hecho", answers: answeredThree[0].respuestas.map((r) => ({ ...r, question_text: "", text: "Hecho", source: "persona", when: 0 })) }];
// El registro de lo contestado se pliega y sigue plegado al volver.
const accountRegistry = () => cellM().querySelector('section[aria-label="Preguntas"] button[aria-expanded]');
assert.equal(accountRegistry()?.getAttribute("aria-expanded"), "true", "el registro de preguntas no nace abierto");
accountRegistry().click();
await sleep(40);
await openTaskTab("p2");
await openTaskTab("p1");
assert.equal(accountRegistry()?.getAttribute("aria-expanded"), "false", "al remontar se abrió el registro de preguntas plegado");

// El turno siguiente repite `q1..q3`.
const AGAIN = { role: "agent", id: "t-otra", text: "Una más", questions: THREE };
halfAnswered.emit("chat", { kind: "started", session: "p1", workspace: "w" });
halfAnswered.emit("question", { workspace: "w", session: "p1", turno: "t-otra", preguntas: THREE, request_id: "req-p1b" });
await sleep(150);
threadsThree.p1 = [...threadsThree.p1, AGAIN];
threeTies.p1 = [{ id: "durable-req-p1b", revision: 1, request_id: "req-p1b", turn: "t-otra" }];
assert.deepEqual(
  snapshot("p1, turno nuevo"),
  { paso: "p1, turno nuevo", tramo: "true", plegada: false, pagina: "1 de 3", respondidas: "Respondidas 0/3", elegidas: [], otra: null },
  "el turno nuevo heredó lo elegido en el anterior",
);
await keyOnCard("2");
assert.equal(snapshot("p1, turno nuevo a medias").pagina, "2 de 3");

// Cerrar la pestaña suelta lo contestado a medias: reabrirla empieza de cero.
docHalf.querySelector('button[aria-label="Cerrar «Pregunta uno»"]')?.click();
await sleep(150);
assert.equal(docHalf.querySelector('button[aria-label="Cerrar «Pregunta uno»"]'), null, "cerrar la pestaña no la cerró");
await openTaskTab("p1");
assert.deepEqual(
  snapshot("p1 reabierta"),
  { paso: "p1 reabierta", tramo: "false", plegada: false, pagina: "1 de 3", respondidas: "Respondidas 0/3", elegidas: [], otra: null },
  "cerrar la pestaña no soltó lo contestado a medias o lo desplegado",
);
console.log(`preguntas-a-medias: ${JSON.stringify(trace)}`);
assert.deepEqual(halfAnswered.failures, []);
halfAnswered.w.close();

// Una tarea nueva nace con id provisional y Rust le da el suyo al contestar.
// Lo desplegado en su primer turno sigue desplegado al dejar de verla y
// volver, y cerrar su pestaña lo suelta.
let created = false;
const newbornTurns = [
  { role: "user", id: "u-nueva", text: "Revisa la carpeta" },
  { role: "agent", id: "t-nueva", text: "Listo.", tools: [{ name: "Bash", target: "ls -la", ok: true }] },
];
const NEWBORN = {
  ...TASK_AFTER_QUEUE,
  list_live_sessions: () => [
    { ...TASK_AFTER_QUEUE.list_live_sessions[0], id: "vieja", title: "Vieja" },
    ...(created ? [{ ...TASK_AFTER_QUEUE.list_live_sessions[0], id: "nueva", title: "Revisa la carpeta" }] : []),
  ],
  load_session: ({ id }) => ({
    ...TASK_AFTER_QUEUE.load_session,
    id,
    turns: id === "nueva" ? (created ? newbornTurns : []) : [{ role: "user", id: "u-vieja", text: "Vieja" }],
  }),
  send_message: () => {
    created = true;
    return "nueva";
  },
};
const newborn = await boot("listo", "tarea-que-nace", NEWBORN);
const docNace = newborn.w.document;
const newbornCell = () =>
  [...docNace.querySelectorAll("[data-ventana]")].find((el) => !el.classList.contains("hidden") && el.querySelector("textarea"));
const newbornSegment = () =>
  [...(newbornCell()?.querySelectorAll("button[aria-expanded]") ?? [])].find(
    (b) => !b.closest('section[aria-label="Preguntas"]') && b.querySelector("svg.lucide-chevron-right"),
  );
const brief = newbornCell().querySelector("textarea");
brief.value = "Revisa la carpeta";
brief.dispatchEvent(new newborn.w.Event("input", { bubbles: true }));
brief.closest("form").dispatchEvent(new newborn.w.Event("submit", { bubbles: true, cancelable: true }));
await sleep(150);
newborn.emit("chat", { kind: "started", session: "nueva", workspace: "w" });
newborn.emit("chat", { kind: "tool", session: "nueva", workspace: "w", id: "ls", text: "Bash", target: "ls -la" });
newborn.emit("chat", { kind: "tool_done", session: "nueva", workspace: "w", id: "ls", text: "Bash", ok: true });
newborn.emit("chat", { kind: "delta", session: "nueva", workspace: "w", text: "Listo." });
newborn.emit("chat", { kind: "done", session: "nueva", workspace: "w", ok: true });
await sleep(300);
assert.equal(newbornSegment()?.getAttribute("aria-expanded"), "false", "el primer turno de la tarea nueva no pinta su tramo");
newbornSegment().click();
await sleep(40);
docNace.querySelector('[data-sesion="vieja"]')?.click();
await sleep(150);
assert.equal(newbornSegment(), undefined, "la tarea vieja no tiene tramo: la celda que se ve sigue siendo la nueva");
docNace.querySelector('[data-sesion="nueva"]')?.click();
await sleep(150);
assert.equal(newbornSegment()?.getAttribute("aria-expanded"), "true", "al volver a la tarea recién nacida se plegó su tramo");
[...docNace.querySelectorAll("button")]
  .find((b) => b.getAttribute("aria-label") === "Cerrar «Revisa la carpeta»")
  ?.click();
await sleep(150);
docNace.querySelector('[data-sesion="nueva"]')?.click();
await sleep(150);
assert.equal(newbornSegment()?.getAttribute("aria-expanded"), "false", "cerrar la pestaña de la tarea nueva no soltó lo desplegado");
assert.deepEqual(newborn.failures, []);
newborn.w.close();

// Lo elegido en la caja de una tarea abierta sobrevive a mirar otra, y un
// gate que esta ventana no vio se repone preguntando por los pendientes.
//
// `session.json` guarda con qué corrió el último turno, no con qué va a
// correr el siguiente; y el evento del permiso viaja una sola vez.
const modes = [
  { id: "manual", label: { clave: "agents.mode.manual" }, falta: null, por_omision: true },
  { id: "auto", label: { clave: "agents.mode.auto" }, falta: null, por_omision: false },
];
const WINDOW_STATE = {
  ...TASK_AFTER_QUEUE,
  list_live_sessions: [
    { ...TASK_AFTER_QUEUE.list_live_sessions[0], id: "s1", title: "Con modo" },
    { ...TASK_AFTER_QUEUE.list_live_sessions[0], id: "s2", title: "La otra" },
  ],
  load_session: ({ id }) => ({
    ...TASK_AFTER_QUEUE.load_session,
    id,
    provider: "codex",
    permission_mode: "manual",
    turns: [],
  }),
  list_permission_modes: modes,
  list_active_turns: ["s1"],
  pending_requests: ({ session }) =>
    session === "s1"
      ? { questions: [], permissions: [{ id: "durable-perm-1", revision: 4, request_id: "perm-1", tool: "Bash", target: "rm -rf" }] }
      : { questions: [], permissions: [] },
};
const windowApp = await boot("listo", "estado-de-ventana", WINDOW_STATE);
const docV = windowApp.w.document;
const currentMode = () =>
  [...docV.querySelectorAll("[aria-label]")]
    .map((el) => el.getAttribute("aria-label"))
    .find((tagLabel) => tagLabel.startsWith("Permisos: "));
docV.querySelector('[data-sesion="s1"]')?.click();
await sleep(200);
assert.equal(currentMode(), "Permisos: Manual");
const composerV = docV.querySelector("textarea");
composerV.focus();
composerV.dispatchEvent(
  new windowApp.w.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }),
);
await sleep(120);
assert.equal(currentMode(), "Permisos: Automático", "shift+Tab cambia el modo");
docV.querySelector('[data-sesion="s2"]')?.click();
await sleep(200);
docV.querySelector('[data-sesion="s1"]')?.click();
await sleep(250);
if (currentMode() !== "Permisos: Automático") {
  console.error(`Volver a la tarea revierte lo elegido en su caja: ${currentMode()}.`);
  process.exit(1);
}
// Y el gate del permiso pendiente aparece sin que nadie repita su evento.
windowApp.w.dispatchEvent(new windowApp.w.Event("focus"));
await sleep(400);
if (!docV.body.textContent.includes("Aprobar acción")) {
  console.error("Un permiso pendiente que esta ventana no vio no se repone.");
  process.exit(1);
}
assert.deepEqual(windowApp.failures, []);
windowApp.w.close();

// Pasar a automático con un permiso a la vista lo aprueba, y solo si el
// turno aceptó el cambio: sin él las peticiones siguientes se seguirían pidiendo.
for (const changeKind of ["acepta", "rechaza"]) {
  const responses = [];
  const auto = await boot("listo", `automatico-aprueba-${changeKind}`, {
    ...WINDOW_STATE,
    set_permission_mode: changeKind === "acepta" ? null : new Error("chat.mode.unsupported"),
    respond_permission: (args) => {
      responses.push(args);
      return {
        id: "t-decision", role: "user", text: "", author: null,
        permission: { request_id: args.requestId, tool: "Bash", target: "rm -rf", allow: args.allow, when: 1 },
      };
    },
  });
  const docA = auto.w.document;
  docA.querySelector('[data-sesion="s1"]')?.click();
  await sleep(200);
  auto.w.dispatchEvent(new auto.w.Event("focus"));
  await sleep(400);
  assert.ok(docA.body.textContent.includes("Aprobar acción"), "el gate pendiente está a la vista antes de cambiar de modo");
  const composerA = docA.querySelector("textarea");
  composerA.focus();
  composerA.dispatchEvent(new auto.w.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
  await sleep(300);
  if (changeKind === "acepta") {
    assert.deepEqual(
      responses.map(({ session, requestId, revision, allow }) => ({ session, requestId, revision, allow })),
      [{ session: "s1", requestId: "durable-perm-1", revision: 4, allow: true }],
      "elegir automático con el turno vivo aprueba el permiso que esperaba",
    );
    assert.ok(!docA.body.textContent.includes("Aprobar acción"), "el gate aprobado deja de pedir respuesta");
  } else {
    assert.deepEqual(responses, [], "si el turno no pasó a automático, lo pendiente sigue esperando a la persona");
    assert.ok(docA.body.textContent.includes("Aprobar acción"));
  }
  assert.deepEqual(auto.failures, []);
  auto.w.close();
}

// Un motor anterior a los pendientes durables los lista sin `id` ni
// `revision`: el gate se contesta igual, por su `request_id`.
{
  const responses = [];
  const oldEngine = await boot("listo", "permiso-motor-sin-revision", {
    ...WINDOW_STATE,
    pending_requests: ({ session }) =>
      session === "s1"
        ? { questions: [], permissions: [{ request_id: "perm-1", tool: "Bash", target: "rm -rf" }] }
        : { questions: [], permissions: [] },
    respond_permission: (args) => {
      responses.push(args);
      return {
        id: "t-decision", role: "user", text: "", author: null,
        permission: { request_id: args.requestId, tool: "Bash", target: "rm -rf", allow: args.allow, when: 1 },
      };
    },
  });
  const docO = oldEngine.w.document;
  docO.querySelector('[data-sesion="s1"]')?.click();
  await sleep(200);
  oldEngine.w.dispatchEvent(new oldEngine.w.Event("focus"));
  await sleep(400);
  [...docO.querySelectorAll("button")].find((b) => b.textContent.trim() === "Aprobar y ejecutar")?.click();
  await sleep(300);
  assert.deepEqual(
    responses.map(({ session, requestId, revision, allow }) => ({ session, requestId, revision, allow })),
    [{ session: "s1", requestId: "perm-1", revision: undefined, allow: true }],
    "sin revisión el permiso se aprueba por su request_id",
  );
  assert.ok(!docO.body.textContent.includes("Aprobar acción"), "el gate aprobado deja de pedir respuesta");
  assert.ok(!docO.body.textContent.includes("no indicó cómo contestarle"));
  assert.deepEqual(oldEngine.failures, []);
  oldEngine.w.close();
}

// Lo nuevo del workspace arranca con su modo por defecto y lo que ya existe
// conserva el suyo. El ajuste vive en General, antes del contexto.
const defaultSaves = [];
const withDefault = { workspaces: [{ id: "w", name: "W", context_root: null, default_permission_mode: "auto" }], active: "w" };
const defaultApp = await boot("listo", "default-permission-mode", {
  ...WINDOW_STATE,
  list_workspaces: withDefault,
  workspaces_startup: withDefault,
  list_language_packs: [], list_bundled_language_packs: [],
  set_workspace_permission_mode: ({ id, mode }) => {
    defaultSaves.push([id, mode]);
    return { ...withDefault.workspaces[0], default_permission_mode: mode };
  },
});
const defaultDoc = defaultApp.w.document;
const defaultModeLabel = () =>
  [...defaultDoc.querySelectorAll("[aria-label]")]
    .map((el) => el.getAttribute("aria-label"))
    .find((tagLabel) => tagLabel.startsWith("Permisos: "));
await sleep(150);
assert.equal(defaultModeLabel(), "Permisos: Automático", "a new task starts with the workspace default");
defaultDoc.querySelector('[data-sesion="s1"]')?.click();
await sleep(200);
assert.equal(defaultModeLabel(), "Permisos: Manual", "an existing task keeps its own mode");
defaultDoc.querySelector('button[aria-label="Nueva tarea"]').click();
await sleep(150);
assert.equal(defaultModeLabel(), "Permisos: Automático", "and the next new task starts with the default again");
defaultDoc.querySelector('button[aria-label="Configuración"]')?.click();
await sleep(150);
defaultDoc.querySelector("#cfg-tab-preferences")?.click();
await sleep(50);
const defaultSelect = defaultDoc.querySelector('select[aria-label="Permisos por defecto"]');
assert.ok(defaultSelect, "General shows the default permissions select");
assert.equal(defaultSelect.value, "auto");
const contextHeading = [...defaultDoc.querySelectorAll("h3")].find((h) => h.textContent.trim() === "Contexto");
assert.ok(contextHeading, "General shows the context section");
assert.ok(
  defaultSelect.compareDocumentPosition(contextHeading) & defaultApp.w.Node.DOCUMENT_POSITION_FOLLOWING,
  "the default permissions setting goes before the context section",
);
defaultSelect.value = "manual";
defaultSelect.dispatchEvent(new defaultApp.w.Event("change", { bubbles: true }));
await sleep(80);
assert.deepEqual(defaultSaves, [["w", "manual"]]);
assert.equal(defaultModeLabel(), "Permisos: Manual", "the blank box follows the new default");
assert.deepEqual(defaultApp.failures, []);
defaultApp.w.close();

// Los árboles montados conservan sus relojes: el proceso no termina solo.
process.exit(0);
