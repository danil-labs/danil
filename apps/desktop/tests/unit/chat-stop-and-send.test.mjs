/** Explicit queue forcing interrupts and sends for every provider, without trying steer first. */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";
import { waitFor } from "../helpers/wait-for.mjs";

const TEXTO = "mejor detente y hazlo así";
const AGENTE = "opencode";
const row = (id) => ({ id, title: `Tarea ${id}`, last_message: "", provider: AGENTE, model: "deepseek", refs: [], updated_at: 0, turns: 1, parent: null, esperando: false });
const session = (id) => ({ id, provider: AGENTE, sources: [], model: "deepseek", effort: null, permission_mode: null, turns: [{ role: "user", id: "u0", at: 0, text: "hola" }] });

function responses(overrides) {
  return {
    window_ready: null,
    window_vitals: null,
    setup_required: false,
    service_poll: { cursor: 0, gap: false, replay: false, runtime: "lab", reset: false },
    list_providers: [{ id: AGENTE, label: "OpenCode", available: true, driver: true }],
    list_workspaces: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
    workspaces_startup: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
    list_projects: () => [{ id: "p1", name: "P1", working_directory: "/lab/p1", kind: "git", portfolio: null, sources: [] }],
    list_portfolios: [],
    list_sources: [],
    list_live_sessions: ({ project }) => (project === "" || project === "p1" ? [row("t1")] : []),
    list_agents: { agents: [], rechazados: [] },
    list_agent_status: [],
    list_mentions: { fuentes: [], archivos: [] },
    list_models: { provider: AGENTE, models: [{ id: "deepseek", label: "DeepSeek", gratis: null, note: null, efforts: [], default_effort: null }], fallback: false },
    list_surfaces: [{ id: AGENTE, provider: AGENTE, label: "OpenCode", catalogo: "todo", usable: true, marca: null, porque: null }],
    session_folder: "/tmp",
    list_task_trees: [],
    watch_task_tree: "watch",
    unwatch_task_tree: null,
    task_history: { history: { archived: false, events: [], recovery: null }, branch: null, path: "/lab", available: true, owned: false, restorable: false, recreatable: false, incomplete: false },
    list_live_turns: [],
    list_active_turns: [],
    load_queue: [],
    save_queue: null,
    queue_ready: true,
    session_usage: null,
    list_session_git: {},
    load_session: ({ id }) => session(id),
    ...overrides,
  };
}

const porTitulo = (app, titulo) => app.w.document.querySelector(`button[title="${titulo}"]`);

async function encolar(app) {
  const campo = app.w.document.querySelector("textarea");
  assert.ok(campo, "no está la caja de escribir");
  campo.value = TEXTO;
  campo.dispatchEvent(new app.w.Event("input", { bubbles: true }));
  await sleep(50);
  campo.dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await sleep(150);
}

test("«detener y enviar» corta el turno y deja salir lo encolado, sin perderlo", async () => {
  const intentos = [];
  const enviados = [];
  let vivos = ["t1"];
  let paradas = 0;
  const app = await boot("listo", "chat-stop-and-send", responses({
    // El agente rechaza el steer, como OpenCode 2.x sobre ACP.
    inject_message: (args) => {
      intentos.push(args);
      return Promise.reject("executor_acceptance_unknown");
    },
    list_active_turns: () => vivos,
    stop_turn: () => {
      paradas += 1;
      return null;
    },
    send_message: (args) => {
      enviados.push(args);
      return "nuevo-turno";
    },
  }));
  try {
    await sleep(600);
    const fila = app.w.document.querySelector('[data-sesion="t1"]');
    assert.ok(fila, "no está la fila de t1");
    fila.click();
    await sleep(400);
    app.emit("chat", { kind: "started", session: "t1", workspace: "w" });
    await sleep(200);

    await encolar(app);
    const detenerYEnviar = porTitulo(app, "Interrumpir y enviar");
    assert.ok(detenerYEnviar, "no se ofreció la interrupción explícita");

    detenerYEnviar.click();
    await sleep(300);
    assert.equal(paradas, 1, "no se detuvo el turno");

    // El turno cortado cierra como interrumpido: `ok: false`.
    vivos = [];
    app.emit("chat", { kind: "done", session: "t1", workspace: "w", ok: false });
    await sleep(800);

    assert.equal(enviados.length, 1, "lo encolado no salió al cerrar el turno");
    assert.equal(enviados[0].prompt, TEXTO, "salió otro texto");
    assert.equal(enviados[0].session, "t1", "salió a otra tarea");
    assert.equal(intentos.length, 0, "se intentó meter en el turno además de detenerlo");
    assert.ok(!app.w.document.body.textContent.includes("en cola"), "el mensaje se quedó en la cola");
  } finally {
    app.w.close();
  }
});

test("«Detener» en Pensando apaga el turno al instante en el frente antes de que responda el backend", async () => {
  let paradas = 0;
  let resolverStop = null;
  let vivos = ["t1"];
  const app = await boot("listo", "chat-optimistic-stop", responses({
    list_active_turns: () => vivos,
    stop_turn: () => {
      paradas += 1;
      return new Promise((resolve) => { resolverStop = resolve; });
    },
  }));
  try {
    await sleep(600);
    const fila = app.w.document.querySelector('[data-sesion="t1"]');
    assert.ok(fila, "no está la fila de t1");
    fila.click();
    await sleep(400);

    app.emit("chat", { kind: "started", session: "t1", workspace: "w" });
    await sleep(200);

    const btnDetener = porTitulo(app, "Detener turno");
    assert.ok(btnDetener, "debe mostrarse el botón Detener turno mientras el turno está pensando");

    // Clic en Detener con `stop_turn` deliberadamente colgado (sin resolver aún):
    btnDetener.click();
    await sleep(30);

    assert.equal(paradas, 1, "se disparó stop_turn en segundo plano");
    assert.equal(porTitulo(app, "Detener turno"), null, "el botón Detener desaparece al instante sin esperar al backend");
    assert.equal(porTitulo(app, "Deteniendo…"), null, "no se queda atorado en «Deteniendo…»");
    assert.ok(porTitulo(app, "Preguntar"), "el botón vuelve a Preguntar de inmediato");
    assert.equal(
      app.w.document.querySelector("[data-activity-slot]:not(.activity-dots-exited)"),
      null,
      "el indicador de Pensando/Dándole vueltas se detiene al instante",
    );

    // Eventos rezagados del turno moribundo antes de `done` no resucitan el spinner ni el botón Detener:
    app.emit("chat", { kind: "reasoning", session: "t1", workspace: "w", text: "pensamiento rezagado" });
    app.emit("chat", { kind: "delta", session: "t1", workspace: "w", text: "texto rezagado" });
    await sleep(50);
    assert.equal(porTitulo(app, "Detener turno"), null, "un evento rezagado del turno moribundo no revive Detener");

    // Cuando finalmente responde el backend y llega `done`, cierra limpio sin errores:
    vivos = [];
    resolverStop(null);
    app.emit("chat", { kind: "done", session: "t1", workspace: "w", ok: false });
    await sleep(200);
    assert.equal(porTitulo(app, "Detener turno"), null);
    assert.ok(porTitulo(app, "Preguntar"));
  } finally {
    app.w.close();
  }
});

test("Detener con razonamiento activo apaga el spinner y escribir encima muestra un solo spinner sin «Preparando…» en la cola", async () => {
  let resolverStop = null;
  let vivos = ["t1"];
  const enviados = [];
  const app = await boot("listo", "chat-stop-reasoning-single-spinner", responses({
    list_active_turns: () => vivos,
    stop_turn: () => new Promise((resolve) => { resolverStop = resolve; }),
    send_message: (args) => {
      enviados.push(args);
      return "nuevo-turno";
    },
  }));
  try {
    await sleep(600);
    app.w.document.querySelector('[data-sesion="t1"]').click();
    await sleep(400);

    app.emit("chat", { kind: "started", session: "t1", workspace: "w" });
    app.emit("chat", { kind: "reasoning", session: "t1", workspace: "w", text: "**Verificando estado de máquinas**\nRevisando el scope." });
    await sleep(150);

    assert.equal(
      app.w.document.querySelectorAll("[data-activity-slot]:not(.activity-dots-exited)").length,
      1,
      "un solo spinner mientras el turno razona",
    );

    const btnDetener = porTitulo(app, "Detener turno");
    assert.ok(btnDetener, "debe verse Detener turno");
    btnDetener.click();
    await sleep(40);

    assert.equal(
      app.w.document.querySelectorAll("[data-activity-slot]:not(.activity-dots-exited)").length,
      0,
      "Detener apaga también el spinner de un turno que ya tenía razonamiento",
    );
    assert.ok(porTitulo(app, "Preguntar"), "sin handoff pendiente el botón vuelve a Preguntar");

    // Un `started` rezagado del turno moribundo no resucita el spinner ni el botón Detener.
    app.emit("chat", { kind: "started", session: "t1", workspace: "w" });
    await sleep(40);
    assert.equal(app.w.document.querySelectorAll("[data-activity-slot]:not(.activity-dots-exited)").length, 0);

    // La persona escribe otro mensaje mientras `stop_turn` sigue en vuelo:
    await encolar(app);
    assert.equal(
      app.w.document.querySelectorAll("[data-activity-slot]:not(.activity-dots-exited)").length,
      1,
      "nunca deben girar dos spinners a la vez entre TurnActivity y PendingHandoff",
    );
    assert.ok(!app.w.document.body.textContent.includes("en cola"), "el mensaje ya mostrado en el hilo no se repite como «Preparando…» en la cola");
    assert.equal(porTitulo(app, "Preguntar"), null, "mientras PendingHandoff gira esperando el cierre no se pinta ↑");
    assert.ok(porTitulo(app, "Deteniendo…"), "el botón refleja que sigue deteniendo el turno previo");
    assert.equal(enviados.length, 0, "no se envía antes del recibo y el cierre");

    vivos = [];
    resolverStop(null);
    app.emit("chat", { kind: "done", session: "t1", workspace: "w", ok: false });
    await waitFor(() => enviados.length === 1, "el mensaje encolado no salió tras ACK y done", 2000);
    assert.equal(enviados[0].prompt, TEXTO);
    assert.ok(!app.w.document.body.textContent.includes("Actividad antes del error"), "done ok:false tras Detener optimista no reclasifica el turno como fallo");
  } finally {
    app.w.close();
  }
});

test("«Detener y enviar» con turno activo mantiene un único spinner y oculta el mensaje promovido de la lista de cola", async () => {
  let resolverStop = null;
  let vivos = ["t1"];
  const app = await boot("listo", "chat-stop-and-send-single-spinner", responses({
    list_active_turns: () => vivos,
    stop_turn: () => new Promise((resolve) => { resolverStop = resolve; }),
    send_message: () => "nuevo-turno",
  }));
  try {
    await sleep(600);
    app.w.document.querySelector('[data-sesion="t1"]').click();
    await sleep(400);

    app.emit("chat", { kind: "started", session: "t1", workspace: "w" });
    app.emit("chat", { kind: "reasoning", session: "t1", workspace: "w", text: "**Analizando cambios**\nDetalles." });
    await sleep(150);

    await encolar(app);
    const detenerYEnviar = porTitulo(app, "Interrumpir y enviar");
    assert.ok(detenerYEnviar, "debe ofrecer Interrumpir y enviar");
    detenerYEnviar.click();
    await sleep(80);

    assert.equal(
      app.w.document.querySelectorAll("[data-activity-slot]:not(.activity-dots-exited)").length,
      1,
      "TurnActivity y PendingHandoff no giran a la vez",
    );
    assert.ok(!app.w.document.body.textContent.includes("en cola"), "la cola no muestra una fila duplicada de «Preparando…»");
    assert.ok(app.w.document.body.textContent.includes(TEXTO), "el texto del mensaje sigue visible en el globo pendiente");
  } finally {
    app.w.close();
  }
});

test("pulsar mandar en la cola durante un Detener optimista en vuelo no salta la barrera de handoff", async () => {
  let resolverStop = null;
  let vivos = ["t1"];
  const enviados = [];
  const app = await boot("listo", "chat-stop-queue-mandar-barrier", responses({
    list_active_turns: () => vivos,
    load_queue: ({ session }) => session === "t1"
      ? [{ id: "q1", text: TEXTO, provider: AGENTE, model: "deepseek", effort: null, permission_mode: null, attachments: [] }]
      : [],
    stop_turn: () => new Promise((resolve) => { resolverStop = resolve; }),
    send_message: (args) => {
      enviados.push(args);
      return "nuevo-turno";
    },
  }));
  try {
    await sleep(600);
    app.w.document.querySelector('[data-sesion="t1"]').click();
    await sleep(400);
    app.emit("chat", { kind: "started", session: "t1", workspace: "w" });
    await sleep(150);

    // Detener optimista con un elemento ya en cola (sin haberlo promovido todavía).
    porTitulo(app, "Detener turno").click();
    await sleep(40);
    const btnMandar = [...app.w.document.querySelectorAll("button")].find((el) => el.textContent?.trim() === "mandar");
    assert.ok(btnMandar, "se ofrece el botón mandar para la cola manual");
    btnMandar.click();
    await sleep(100);
    assert.equal(enviados.length, 0, "mandar en la cola no puede disparar send_message mientras stop_turn sigue en vuelo");

    vivos = [];
    resolverStop(null);
    app.emit("chat", { kind: "done", session: "t1", workspace: "w", ok: false });
    await waitFor(() => enviados.length === 1, "tras ACK y cierre sale el mensaje elegido", 2000);
    assert.equal(enviados[0].prompt, TEXTO);
  } finally {
    app.w.close();
  }
});

test("si falla stop_turn tras Detener optimista no ofrece Reintentar el prompt y reconcilia el turno que siguió vivo", async () => {
  let rechazarStop = null;
  const vivos = ["t1"];
  const enviados = [];
  const app = await boot("listo", "chat-stop-failure-reconciles", responses({
    list_active_turns: () => vivos,
    stop_turn: () => new Promise((_resolve, reject) => { rechazarStop = reject; }),
    send_message: (args) => {
      enviados.push(args);
      return "duplicado";
    },
  }));
  try {
    await sleep(600);
    app.w.document.querySelector('[data-sesion="t1"]').click();
    await sleep(400);

    app.emit("chat", { kind: "started", session: "t1", workspace: "w" });
    app.emit("chat", { kind: "reasoning", session: "t1", workspace: "w", text: "**Revisando**\nPaso 1." });
    await sleep(150);

    porTitulo(app, "Detener turno").click();
    await sleep(40);
    assert.equal(porTitulo(app, "Detener turno"), null);

    rechazarStop(new Error("El motor no respondió"));
    await waitFor(() => app.w.document.body.textContent.includes("No se pudo detener el turno"), "se avisa que Detener falló", 2000);
    await waitFor(() => porTitulo(app, "Detener turno"), "tras fallar Detener, la reconciliación restaura el turno que siguió activo", 2000);

    const retryButtons = [...app.w.document.querySelectorAll("button")].filter((el) => el.textContent?.trim() === "Reintentar");
    assert.equal(retryButtons.length, 0, "un fallo de Detener no ofrece Reintentar el último prompt");
    assert.equal(enviados.length, 0);
  } finally {
    app.w.close();
  }
});

test("con dos elementos en cola durante handoff se oculta «mandar» inerte y «Enviar de nuevo» incierto respeta la barrera", async () => {
  let resolverStop = null;
  let vivos = ["t1"];
  const enviados = [];
  const app = await boot("listo", "chat-stop-resend-and-two-queued", responses({
    list_active_turns: () => vivos,
    load_queue: ({ session }) => session === "t1"
      ? [
          { id: "q1", text: "primero promovido", provider: AGENTE, model: "deepseek", effort: null, permission_mode: null, attachments: [] },
          { id: "q2", text: "segundo incierto", provider: AGENTE, model: "deepseek", effort: null, permission_mode: null, attachments: [], uncertain: true },
        ]
      : [],
    stop_turn: () => new Promise((resolve) => { resolverStop = resolve; }),
    send_message: (args) => {
      enviados.push(args);
      return "nuevo-turno";
    },
  }));
  try {
    await sleep(600);
    app.w.document.querySelector('[data-sesion="t1"]').click();
    await sleep(400);
    app.emit("chat", { kind: "started", session: "t1", workspace: "w" });
    await sleep(150);

    // Detener optimista: `q2` incierto tiene su botón «Enviar de nuevo» bloqueado mientras `stop_turn` sigue en vuelo.
    porTitulo(app, "Detener turno").click();
    await sleep(40);
    const reenviar = app.w.document.querySelector('button[aria-label*="Enviar de nuevo"], button[title="Enviar de nuevo"]');
    assert.ok(reenviar, "la fila incierta muestra su acción de reenvío");
    assert.equal(reenviar.disabled, true, "Enviar de nuevo queda deshabilitado mientras stop_turn sigue en vuelo");
    reenviar.click();
    await sleep(60);
    assert.equal(enviados.length, 0, "Enviar de nuevo no puede disparar send_message durante stopping");

    // Promueve q1 a handoff: q2 sigue visible en cola, pero sin un botón «mandar» que no hace nada.
    const btnMandarAntes = [...app.w.document.querySelectorAll("button")].find((el) => el.textContent?.trim() === "mandar");
    assert.ok(btnMandarAntes);
    btnMandarAntes.click();
    await sleep(60);
    assert.ok(app.w.document.body.textContent.includes("segundo incierto"), "el segundo elemento sigue visible en la cola");
    const btnMandarDespues = [...app.w.document.querySelectorAll("button")].find((el) => el.textContent?.trim() === "mandar");
    assert.equal(btnMandarDespues, undefined, "con un handoff activo la barra manual no ofrece un botón «mandar» sin efecto");
    assert.equal(enviados.length, 0);
  } finally {
    app.w.close();
  }
});

test("si stop_turn falla tras Detener optimista mantiene bloqueado «Enviar de nuevo» ante reconciliación pendiente, fallida o descartada", async () => {
  let rechazarStop = null;
  let presenceMode = "ok";
  const presenceResolvers = [];
  const enviados = [];
  const app = await boot("listo", "chat-stop-failed-holds-resend-during-reconcile", responses({
    list_active_turns: () => {
      if (presenceMode === "reject") return Promise.reject(new Error("presence offline"));
      if (presenceMode === "hold") return new Promise((resolve) => presenceResolvers.push(resolve));
      if (presenceMode === "closed") return [];
      return ["t1"];
    },
    load_queue: ({ session }) => session === "t1"
      ? [{ id: "q1", text: "incierto durante fallo", provider: AGENTE, model: "deepseek", effort: null, permission_mode: null, attachments: [], uncertain: true }]
      : [],
    stop_turn: () => new Promise((_resolve, reject) => { rechazarStop = reject; }),
    send_message: (args) => {
      enviados.push(args);
      return "duplicado";
    },
  }));
  try {
    await sleep(600);
    app.w.document.querySelector('[data-sesion="t1"]').click();
    await sleep(400);
    app.emit("chat", { kind: "started", session: "t1", workspace: "w" });
    await sleep(150);

    porTitulo(app, "Detener turno").click();
    await sleep(40);

    // Caso 1: la reconciliación de presencia rechaza (error IPC) tras fallar stop_turn.
    presenceMode = "reject";
    rechazarStop(new Error("stop falló"));
    await waitFor(() => app.w.document.body.textContent.includes("No se pudo detener el turno"), "aviso de fallo de stop", 2000);
    await sleep(80);

    const reenviar = app.w.document.querySelector('button[aria-label*="Enviar de nuevo"], button[title="Enviar de nuevo"]');
    assert.ok(reenviar, "la fila incierta sigue visible");
    assert.equal(reenviar.disabled, true, "una reconciliación fallida no reabre «Enviar de nuevo»");
    reenviar.click();
    await sleep(60);
    assert.equal(enviados.length, 0, "no se emite send_message tras una reconciliación fallida");

    // Caso 2: otra lectura de presencia queda pendiente y se descarta por un cambio de lifecycleRevision.
    presenceMode = "hold";
    app.w.dispatchEvent(new app.w.Event("focus"));
    await waitFor(() => presenceResolvers.length > 0, "la segunda reconciliación salió", 2000);
    app.emit("chat", { kind: "started", session: "otra-tarea", workspace: "w" });
    await sleep(40);
    for (const resolve of presenceResolvers.splice(0)) resolve([]);
    await sleep(80);
    assert.equal(reenviar.disabled, true, "una lectura descartada por lifecycleRevision tampoco libera el bloqueo");
    reenviar.click();
    await sleep(60);
    assert.equal(enviados.length, 0);

    // Caso 3: una lectura válida y vigente confirma que t1 sigue vivo y restaura Detener turno.
    presenceMode = "ok";
    app.w.dispatchEvent(new app.w.Event("focus"));
    await waitFor(() => porTitulo(app, "Detener turno"), "una lectura válida restaura Detener turno cuando t1 siguió vivo", 2000);
    assert.equal(reenviar.disabled, true);
    assert.equal(enviados.length, 0);
  } finally {
    presenceMode = "closed";
    for (const resolve of presenceResolvers) resolve([]);
    app.w.close();
  }
});

test("una cola manual con solo un !comando oculta «mandar» durante Detener optimista y lo recupera al cerrar", async () => {
  let resolverStop = null;
  let vivos = ["t1"];
  const comandos = [];
  const app = await boot("listo", "chat-stop-command-only-queue", responses({
    list_active_turns: () => vivos,
    load_queue: ({ session }) => session === "t1"
      ? [{ id: "c1", text: "!echo listo", provider: AGENTE, model: "deepseek", effort: null, permission_mode: null, attachments: [] }]
      : [],
    stop_turn: () => new Promise((resolve) => { resolverStop = resolve; }),
    run_shell_command: (args) => {
      comandos.push(args);
      return { session: "t1" };
    },
  }));
  try {
    await sleep(600);
    app.w.document.querySelector('[data-sesion="t1"]').click();
    await sleep(400);
    app.emit("chat", { kind: "started", session: "t1", workspace: "w" });
    await sleep(150);

    porTitulo(app, "Detener turno").click();
    await sleep(40);
    const btnMandarDurante = [...app.w.document.querySelectorAll("button")].find((el) => el.textContent?.trim() === "mandar");
    assert.equal(btnMandarDurante, undefined, "no ofrece un botón «mandar» inerte si solo hay un !comando en cola mientras Detener sigue en vuelo");

    vivos = [];
    resolverStop(null);
    app.emit("chat", { kind: "done", session: "t1", workspace: "w", ok: false });
    const btnMandarDespues = await waitFor(
      () => [...app.w.document.querySelectorAll("button")].find((el) => el.textContent?.trim() === "mandar"),
      "al cerrar el turno vuelve el botón «mandar» para ejecutar el !comando",
      2000,
    );
    btnMandarDespues.click();
    await waitFor(() => comandos.length === 1, "al pulsar mandar tras el cierre se ejecuta el !comando", 2000);
    assert.equal(comandos[0].command, "echo listo");
  } finally {
    app.w.close();
  }
});
