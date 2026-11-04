/**
 * Que la preparación no se abra con la app ya pintada y que nunca se quede ciega.
 *
 * El servicio falso entrega `bootstrap-run` solo por `service_poll`, con cursor,
 * como el real: un segundo lector recibiría cada evento otra vez. Monta `dist/`.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

// Cada caso en su propio proceso: el arnés deja `window` en la última ventana, y los
// temporizadores de una anterior llamarían a los stubs de la siguiente.
const CASOS = new Map();
const caso = (nombre, cuerpo) => CASOS.set(nombre, cuerpo);

const ETAPAS = ["platform", "work-tools"];
const TITULO = "Preparando Danil";

const foto = (estado, running) => ({
  stages: ETAPAS.map((name) => ({ name, essential: true, state: estado(name) })),
  running,
});
const enCurso = () => foto(() => "waiting", true);
const terminada = () => foto(() => "succeeded", false);

const reporte = (blocked, bootstrap, items = []) => ({
  ready: !blocked,
  blocked,
  reason: null,
  items,
  bootstrap,
  essential: ["work-tools"],
  first_run: false,
  runtime_versions: {},
});

function servicio({ setupRequired, entorno, preparar, reset = () => false, extra = {} }) {
  // Cada servicio con su registro. Uno nuevo contesta `reset` y, sin cursor, empieza desde el final.
  let actual = { runtime: "test-service", eventos: [], desdeElFinal: false };
  const llamadas = { prepare_runtime: [], install_tool: [] };
  let app;
  const respuestas = {
    window_ready: null,
    window_vitals: null,
    setup_required: setupRequired,
    list_providers: [],
    list_workspaces: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
    workspaces_startup: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
    list_projects: [],
    list_sources: [],
    list_live_sessions: [],
    list_live_turns: [],
    list_surfaces: [],
    check_environment: () => entorno,
    prepare_runtime: (args) => {
      llamadas.prepare_runtime.push(args?.joinOnly === true ? "unirse" : "arrancar");
      return preparar(llamadas.prepare_runtime.length);
    },
    // `reset` también puede lanzar: es el servicio muerto que no contesta.
    service_poll: (args) => {
      if (args?.runtime && args.runtime !== actual.runtime) {
        return { cursor: null, gap: false, replay: true, runtime: actual.runtime, reset: true };
      }
      const nuevo = reset();
      const { eventos } = actual;
      const desde = args?.cursor ?? (actual.desdeElFinal ? eventos.length : 0);
      for (const e of eventos.filter((e) => e.id > desde)) app?.emit(e.name, e.payload);
      return { cursor: eventos.length, gap: false, replay: false, runtime: actual.runtime, reset: nuevo };
    },
    install_tool: (args) => {
      llamadas.install_tool.push(args);
      throw new Error("work_tools_damaged");
    },
    ...extra,
  };
  return {
    respuestas,
    llamadas,
    publicar: (name, payload) => actual.eventos.push({ id: actual.eventos.length + 1, name, payload }),
    cambiarDeServicio: () => {
      actual = { runtime: `servicio-${Date.now()}`, eventos: [], desdeElFinal: true };
    },
    conectar: (a) => {
      app = a;
    },
  };
}

const enPantalla = (app) => app.w.document.body.textContent.includes(TITULO);
const aviso = (app) => app.w.document.querySelector("[data-setup-repair]");
const acciones = (app) => [...app.w.document.querySelectorAll("main > footer button")].map((b) => b.textContent.trim());

caso("lo esencial que falta con la app pintada se repara detrás, sin abrir la preparación", async () => {
  const s = servicio({ setupRequired: false, entorno: reporte(true, ["work-tools"]), preparar: enCurso });
  const app = await boot("listo", "reparacion-detras", s.respuestas);
  s.conectar(app);
  await sleep(400);

  assert.equal(enPantalla(app), false, "la preparación se abrió con la app ya pintada");
  assert.ok(aviso(app), "no hay aviso de la reparación en curso");
  assert.deepEqual(s.llamadas.prepare_runtime, ["arrancar"]);
});

caso("el aviso de la reparación se cierra y vuelve si la reparación falla", async () => {
  const fallida = () => foto((name) => (name === "work-tools" ? "failed" : "succeeded"), false);
  const s = servicio({
    setupRequired: false,
    entorno: reporte(true, ["work-tools"]),
    preparar: (n) => (n === 1 ? enCurso() : fallida()),
  });
  const app = await boot("listo", "reparacion-cerrar", s.respuestas);
  s.conectar(app);
  await sleep(400);

  const cruz = aviso(app)?.querySelector('button[aria-label]');
  assert.ok(cruz, "el aviso de la reparación en curso no tiene cruz");
  cruz.click();
  await sleep(50);
  assert.equal(aviso(app), null, "la cruz no cerró el aviso");

  await sleep(6000);
  assert.equal(aviso(app)?.getAttribute("role"), "alert", "el fallo de la reparación no volvió a avisar");
});

caso("la primera vez la pantalla avanza con la foto aunque no llegue ningún evento", async () => {
  const s = servicio({
    setupRequired: true,
    entorno: reporte(false, []),
    preparar: (n) => (n === 1 ? enCurso() : terminada()),
  });
  const app = await boot("listo", "foto-sin-eventos", s.respuestas);
  s.conectar(app);
  await sleep(6000);

  assert.ok(s.llamadas.prepare_runtime.length >= 2, "la ventana no volvió a pedir la foto");
  assert.ok(acciones(app).length > 0, "la corrida terminó y la pantalla no ofrece seguir");
});

caso("un servicio nuevo a mitad de la corrida la retoma y la pantalla termina", async () => {
  let polls = 0;
  const s = servicio({
    setupRequired: true,
    entorno: reporte(false, []),
    preparar: (n) => (n === 1 ? enCurso() : terminada()),
    reset: () => ++polls === 3,
  });
  const app = await boot("listo", "reset-a-mitad", s.respuestas);
  s.conectar(app);
  await sleep(2500);

  assert.ok(s.llamadas.prepare_runtime.length >= 2, "con `reset` nadie volvió a pedir la corrida");
  assert.ok(acciones(app).length > 0, "tras el cambio de servicio la pantalla no ofrece seguir");
});

caso("un corte del servicio a mitad de la corrida no deja error cuando termina bien", async () => {
  let polls = 0;
  const s = servicio({
    setupRequired: true,
    entorno: reporte(false, []),
    preparar: (n) => (n === 1 ? enCurso() : terminada()),
    reset: () => {
      polls += 1;
      if (polls === 2) throw new Error("io");
      return polls === 3;
    },
  });
  const app = await boot("listo", "corte-a-mitad", s.respuestas);
  s.conectar(app);
  await sleep(2500);

  assert.ok(acciones(app).length > 0, "tras el corte la pantalla no ofrece seguir");
  assert.ok(!app.w.document.body.textContent.includes("No se pudo revisar esta computadora"), "quedó pintado el error del corte");
  assert.ok(!acciones(app).includes("Volver a intentar"), `ofrece reintentar una corrida que terminó bien: ${acciones(app)}`);
});

caso("la primera preparación sana abre Conecta tu IA sin una parada técnica", async () => {
  let creados = 0;
  const s = servicio({
    setupRequired: true, entorno: reporte(false, []), preparar: terminada,
    extra: {
      list_workspaces: { workspaces: [], active: null },
      workspaces_startup: { workspaces: [], active: null },
      add_workspace: () => { creados += 1; return { id: "nuevo" }; },
      set_active_workspace: null,
      set_workspace_language: null,
      list_system_sessions: [],
    },
  });
  const app = await boot("listo", "primera-sin-parada-tecnica", s.respuestas);
  s.conectar(app);
  await sleep(1500);

  assert.ok([...app.w.document.querySelectorAll("h1")].some((h) => h.textContent === "Conecta tu IA."));
  assert.equal(creados, 1, "la transición duplicó el workspace");
  assert.equal(app.w.document.querySelector('[role="radiogroup"]'), null);
  assert.equal(app.w.document.querySelector('[role="log"]'), null);
  assert.ok(!acciones(app).includes("Ver la preparación"));
});

caso("la comprobación muestra avance real sin terminal ni inventario técnico", async () => {
  const s = servicio({ setupRequired: true, entorno: reporte(false, []), preparar: enCurso });
  const app = await boot("listo", "avance-incluido", s.respuestas);
  s.conectar(app);
  s.publicar("bootstrap-run", { type: "note", stage: "platform", kind: "platform", value: "windows x86_64" });
  s.publicar("bootstrap-run", { type: "note", stage: "work-tools", kind: "tool", value: "git", extra: "2.53.0" });
  s.publicar("bootstrap-run", { type: "output", stage: "work-tools", line: "private diagnostic output", stream: "stdout" });
  s.publicar("bootstrap-run", { type: "stage", name: "platform", state: "succeeded" });
  s.publicar("bootstrap-run", { type: "stage", name: "work-tools", state: "running" });
  await sleep(1500);

  assert.equal(app.w.document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"), "50");
  assert.equal(app.w.document.querySelector('[role="log"]'), null);
  assert.equal(app.w.document.querySelector('[role="radiogroup"]'), null);
  for (const detalle of ["windows x86_64", "Git 2.53.0", "private diagnostic output", "Terminal de preparación"]) {
    assert.ok(!app.w.document.body.textContent.includes(detalle), `expone diagnóstico técnico: ${detalle}`);
  }
  assert.ok(app.w.document.body.textContent.includes("Comprobando las herramientas incluidas"));
});

caso("sin terminal un fallo incluido conserva su función, motivo y reparación", async () => {
  const python = { id: "python", label: "Python", ok: false, required: true, detail: "", reason: "import_failed" };
  const s = servicio({ setupRequired: true, entorno: reporte(true, ["python"], [python]), preparar: enCurso });
  const app = await boot("listo", "fallo-incluido-sin-terminal", s.respuestas);
  s.conectar(app);
  s.publicar("bootstrap-run", { type: "note", stage: "work-tools", kind: "tool_failed", value: "python", extra: "import_failed" });
  s.publicar("bootstrap-run", { type: "stage", name: "work-tools", state: "failed" });
  await sleep(1500);

  const detalle = app.w.document.querySelector('[data-function="python"]');
  assert.ok(detalle?.textContent.includes("Editar Excel, Word, PowerPoint y PDF"));
  assert.ok(detalle?.textContent.includes("No pudo cargar sus bibliotecas"));
  assert.ok([...app.w.document.querySelectorAll("button")].some((b) => b.textContent === "Reparar"));
  assert.equal(app.w.document.querySelector('[role="log"]'), null);
});

caso("una herramienta incluida que no contestó a tiempo no abre la preparación ni avisa", async () => {
  const lento = { id: "python", label: "Python", ok: true, required: true, detail: "", timed_out: true, reason: "timed_out" };
  const s = servicio({ setupRequired: false, entorno: reporte(false, [], [lento]), preparar: enCurso });
  const app = await boot("listo", "python-sin-respuesta", s.respuestas);
  s.conectar(app);
  await sleep(400);

  assert.equal(enPantalla(app), false);
  assert.equal(aviso(app), null);
  assert.deepEqual(s.llamadas.prepare_runtime, []);
});

const texto = (app) => app.w.document.querySelector("main")?.textContent ?? "";
const boton = (app, nombre) => [...app.w.document.querySelectorAll("main button")].find((b) => b.textContent.trim() === nombre);
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15";
const fallidaConFoto = () => foto((name) => (name === "work-tools" ? "failed" : "succeeded"), false);

caso("la preparación oculta etapas técnicas y mantiene la validación interna", async () => {
  const s = servicio({ setupRequired: true, entorno: reporte(false, []), preparar: enCurso });
  const app = await boot("listo", "dos-etapas", s.respuestas);
  s.conectar(app);
  await sleep(600);

  assert.ok(enPantalla(app), "no se ve «Preparando Danil»");
  assert.equal(app.w.document.querySelector("main ol"), null, "la lista técnica sigue visible");
  assert.ok(texto(app).includes("Comprobando las herramientas incluidas"));
  assert.equal(app.w.document.querySelectorAll('main input[type="checkbox"]').length, 0, "quedan casillas");
  assert.ok(!/Opcionales|opcional/i.test(texto(app)), "quedan los opcionales");
  assert.deepEqual(s.llamadas.prepare_runtime, ["arrancar"]);
});

caso("una función incluida que falla se nombra y «Reparar» repara todo lo incluido, con el error en la pantalla", async () => {
  const python = { id: "python", label: "Python", ok: false, required: true, detail: "", reason: "import_failed" };
  const s = servicio({ setupRequired: true, entorno: reporte(true, ["work-tools"], [python]), preparar: fallidaConFoto });
  const app = await boot("listo", "funcion-afectada", s.respuestas);
  s.conectar(app);
  await sleep(800);

  assert.ok(texto(app).includes("Editar Excel, Word, PowerPoint y PDF"), `no nombra la función: ${texto(app)}`);
  assert.ok(texto(app).includes("No pudo cargar sus bibliotecas."));
  assert.ok(!acciones(app).includes("Volver a intentar"), "con «Reparar» sobra reintentar");
  boton(app, "Reparar").click();
  await sleep(400);
  assert.deepEqual(s.llamadas.install_tool, [{ tool: "bundled-work-tools" }]);
  assert.ok(texto(app).includes("No se pudo reparar el entorno de Danil."), "el error de reparar no se ve en la pantalla");
  assert.ok(app.commands.filter((c) => c === "check_environment").length >= 2, "después de reparar no se vuelve a comprobar");
});

caso("lo que no contestó a tiempo se dice distinto de lo dañado", async () => {
  const items = [
    { id: "git", label: "Git", ok: true, required: true, detail: "", timed_out: true, reason: "timed_out" },
    { id: "agent-browser", label: "Agent Browser", ok: false, required: true, detail: "", reason: "damaged" },
  ];
  const s = servicio({ setupRequired: true, entorno: reporte(true, ["work-tools"], items), preparar: fallidaConFoto });
  const app = await boot("listo", "lento-y-danado", s.respuestas);
  s.conectar(app);
  await sleep(800);

  const filas = Object.fromEntries(
    [...app.w.document.querySelectorAll("[data-function]")].map((li) => [li.dataset.function, li.textContent]),
  );
  assert.ok(filas.git?.includes("Clonar y versionar repositorios") && filas.git.includes("No contestó a tiempo"));
  assert.ok(filas["agent-browser"]?.includes("Abrir y usar páginas web") && filas["agent-browser"].includes("Sus archivos cambiaron"));
  // jsdom no es Mac ni Windows: en Linux reiniciar vuelve a copiar los recursos.
  assert.ok(boton(app, "Reiniciar Danil"), "en Linux lo dañado no propone reiniciar");
  assert.ok(texto(app).includes("Reinicia Danil para volver a copiar"));
});

caso("en Mac lo dañado propone reinstalar, no reiniciar", async () => {
  const items = [{ id: "uv", label: "uv", ok: false, required: true, detail: "", reason: "damaged" }];
  const s = servicio({ setupRequired: true, entorno: reporte(true, ["work-tools"], items), preparar: fallidaConFoto });
  const app = await boot("listo", "danado-mac", s.respuestas, MAC);
  s.conectar(app);
  await sleep(800);

  assert.ok(texto(app).includes("Paquetes extra y servidores MCP"));
  assert.ok(texto(app).includes("Reinstala Danil"));
  assert.equal(boton(app, "Reiniciar Danil"), undefined);
  assert.ok(boton(app, "Reparar"));
});

caso("un motor anterior conserva la función afectada sin listar herramientas", async () => {
  const vieja = {
    stages: [
      { name: "platform", essential: true, state: "succeeded" },
      { name: "git", essential: true, state: "succeeded" },
      { name: "agent-browser", essential: false, state: "failed" },
    ],
    running: false,
  };
  const s = servicio({ setupRequired: true, entorno: reporte(false, []), preparar: () => vieja });
  const app = await boot("listo", "etapas-viejas", s.respuestas);
  s.conectar(app);
  await sleep(800);

  assert.equal(app.w.document.querySelector("main ol"), null, "el motor anterior vuelve a listar herramientas");
  assert.ok(app.w.document.querySelector('[data-function="agent-browser"]'), "la etapa vieja fallida no se nombra por su función");
});

caso("Estado del entorno lista solo los extras y lo incluido en una línea con «Reparar»", async () => {
  const fila = (id, label, extra = {}) => ({ id, label, ok: true, required: false, detail: "1.0", source: "del sistema", ...extra });
  const items = [
    fila("git", "Git", { required: true }),
    fila("python", "Python", { required: true, ok: false, reason: "missing" }),
    fila("node", "Node.js"),
    fila("npm", "npm"),
    fila("pnpm", "pnpm"),
    fila("bun", "Bun"),
    fila("cargo", "Rust"),
    fila("gh", "GitHub CLI"),
  ];
  const s = servicio({
    setupRequired: false,
    entorno: reporte(false, [], items),
    preparar: enCurso,
    extra: { list_dependencies: [], list_language_packs: [], list_bundled_language_packs: [], install_size: 0 },
  });
  const app = await boot("listo", "estado-del-entorno", s.respuestas);
  s.conectar(app);
  await sleep(300);
  app.w.dispatchEvent(new app.w.CustomEvent("harness:open-settings", { detail: "entorno" }));
  await sleep(1200);

  const cuerpo = app.w.document.body.textContent;
  const filas = [...app.w.document.querySelectorAll("tbody tr")].map((tr) => tr.textContent);
  assert.ok(filas.some((f) => f.includes("GitHub CLI")), `no se lista lo detectado en el sistema: ${filas}`);
  assert.ok(!filas.some((f) => /Node\.js|npm|pnpm|Bun|Rust|Git\b|Python/.test(f)), `se listan herramientas que no son extras: ${filas}`);
  assert.ok(cuerpo.includes("Entorno de Danil: necesita reparación"));
  assert.ok(cuerpo.includes("Editar Excel, Word, PowerPoint y PDF"));
  const reparar = [...app.w.document.querySelectorAll("[data-environment-bundled] button")].find((b) => b.textContent.trim() === "Reparar");
  reparar.click();
  await sleep(300);
  assert.deepEqual(s.llamadas.install_tool, [{ tool: "bundled-work-tools" }]);
  assert.ok(app.w.document.body.textContent.includes("No se pudo reparar el entorno de Danil."));
  assert.equal(app.commands.includes("install_base_tool"), false);
});

const elegido = process.env.SETUP_REPAIR_CASO;
if (elegido) {
  await CASOS.get(elegido)();
  process.exit(0);
}
const { default: test } = await import("node:test");
for (const nombre of CASOS.keys()) {
  test(nombre, () => {
    const corrida = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, SETUP_REPAIR_CASO: nombre },
      encoding: "utf8",
    });
    assert.equal(corrida.status, 0, `${corrida.stdout}
${corrida.stderr}`);
  });
}
