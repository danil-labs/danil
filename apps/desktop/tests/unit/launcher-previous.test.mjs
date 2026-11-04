/**
 * Con el motor anterior trabajando y sin su ventana para reabrir, la ventana nueva
 * no se tapa: monta la app y enseña un aviso que espera, con «Detener y entrar ya»
 * confirmado antes de cortar (`launcher_continue`). Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const workspace = { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" };

const aviso = (app) => app.w.document.querySelector("[data-launcher-previous]");
const button = (app, text) => [...(aviso(app)?.querySelectorAll("button") ?? [])].find((b) => b.textContent?.trim() === text);

async function waitFor(read, message) {
  for (let i = 0; i < 100; i++) {
    const value = read();
    if (value) return value;
    await sleep(20);
  }
  assert.fail(message);
}

async function click(app, text) {
  (await waitFor(() => button(app, text), `Falta el botón «${text}»`)).click();
  await sleep(50);
}

function abrir(tasks) {
  return boot("listo", `ventana-anterior-${tasks ?? "x"}`, {
    window_ready: null,
    window_vitals: null,
    setup_required: false,
    launcher_state: { phase: "previous", tasks, stopping: false },
    launcher_continue: null,
    list_language_packs: [],
    list_bundled_language_packs: [],
    list_providers: [],
    list_workspaces: workspace,
    workspaces_startup: workspace,
    list_projects: [],
    list_sources: [],
    list_live_sessions: [],
    list_live_turns: [],
    list_models: { models: [], fallback: false },
    tasks_awaiting_quota: [],
    service_poll: { cursor: 0, gap: false, replay: false, runtime: "fixture", reset: false },
  });
}

test("la espera es un aviso sobre la app, no una pantalla que la tapa", async () => {
  const app = await abrir(2);
  const texto = (await waitFor(() => aviso(app), "No se ve el aviso de espera")).textContent;
  assert.ok(texto.includes("Esperando a que terminen 2 tareas de la versión anterior"), texto);
  assert.equal(app.w.document.querySelector("main[data-launcher]"), null, "sigue la pantalla de bloqueo");
  assert.ok(!texto.includes("Actualizar ya"), texto);
});

test("«Detener y entrar ya» pide confirmar y solo entonces corta", async () => {
  const app = await abrir(1);
  await click(app, "Detener y entrar ya");
  assert.ok(aviso(app).textContent.includes("Se va a cortar 1 tarea"), aviso(app).textContent);
  await click(app, "Seguir esperando");
  assert.ok(!app.commands.includes("launcher_continue"), "cortó sin confirmar");
  await click(app, "Detener y entrar ya");
  await click(app, "Detener");
  assert.ok(app.commands.includes("launcher_continue"), "no pidió detener la versión anterior");
});

test("mientras la anterior se detiene no ofrece botones, y al conectar el aviso se va", async () => {
  const app = await abrir(null);
  const texto = (await waitFor(() => aviso(app), "No se ve el aviso de espera")).textContent;
  assert.ok(texto.includes("Esperando a que la versión anterior termine"), texto);
  app.emit("launcher", { phase: "previous", tasks: null, stopping: true });
  await sleep(50);
  assert.ok(aviso(app).textContent.includes("Deteniendo la versión anterior"), aviso(app).textContent);
  assert.equal(button(app, "Detener y entrar ya"), undefined);
  app.emit("launcher", { phase: "ready", blank_0274: false });
  await sleep(50);
  assert.equal(aviso(app), null, "el aviso sigue con la ventana conectada");
});
