/**
 * La ventana montada (`dist/`) contra el motor falso de `fake-engine.mjs`, con
 * el reloj de los intervalos simulado: el sondeo de `queue_ready` (1 s), el
 * reintento de las colas ocultas (1 s) y la reconciliación de turnos (5 s)
 * solo avanzan con `tick(ms)`. Los `setTimeout` siguen siendo reales: con ellos
 * se asientan las promesas del IPC entre tic y tic.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test, { mock } from "node:test";
import { fileURLToPath } from "node:url";
import { boot, sleep } from "./jsdom-app.mjs";
export { waitFor } from "./wait-for.mjs";
import { createFakeEngine } from "./fake-engine.mjs";
import { openTask, pushedPoll, responses, session, turns } from "./push-fixture.mjs";

let mounted = 0;

/** Monta la ventana con las tareas t1 y t2 del proyecto p1 y el motor falso detrás. */
export async function mountWindow(name, { features, probe, before = () => {} } = {}) {
  const stream = pushedPoll();
  const engine = createFakeEngine({ features, probe, emit: (event) => stream.push({ events: [event] }) });
  before(engine);
  mock.timers.enable({ apis: ["setInterval"] });
  // Una ventana desmontada sigue en este proceso con sus relojes reales: su IPC
  // deja de contestar para que no toque el estado de la prueba siguiente.
  let closed = false;
  const answers = responses({ service_poll: stream.poll, service_filter: null, load_history: ({ id }) => session(id, turns(0, 4)), ...engine.responses() });
  const live = Object.fromEntries(Object.entries(answers).map(([command, answer]) =>
    [command, (...args) => (closed ? new Promise(() => {}) : typeof answer === "function" ? answer(...args) : answer)]));
  const app = await boot("listo", `fake-engine-${name}-${++mounted}`, live);
  const document = app.w.document;
  let closes = 0;
  app.w.addEventListener("harness:turno-cerrado", () => { closes++; });
  const window = {
    app, engine, document,
    text: () => document.body.textContent ?? "",
    open: (id) => openTask(app, id),
    /** Avanza el reloj simulado de segundo en segundo, dejando asentarse cada tic. */
    async tick(ms) {
      for (let elapsed = 0; elapsed < ms; elapsed += 1000) { mock.timers.tick(Math.min(1000, ms - elapsed)); await sleep(40); }
    },
    settle: (ms = 150) => sleep(ms),
    /** Escribe en la caja y pulsa Enter, como la persona. */
    async type(text) {
      const input = document.querySelector("textarea");
      assert.ok(input, "no está la caja de escribir");
      input.value = text;
      input.dispatchEvent(new app.w.Event("input", { bubbles: true }));
      await sleep(50);
      input.dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await sleep(150);
    },
    /** Enter con la caja vacía: el gesto de interrumpir y enviar lo encolado. */
    async enter() {
      document.querySelector("textarea")?.dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await sleep(80);
    },
    stopButton: () => document.querySelector('button[aria-label="Detener turno"]'),
    sendButton: () => [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "mandar"),
    /** Los envíos que la ventana intentó para `session` desde `since` (índice de la bitácora), con su desenlace. */
    sends: (session, since = 0) => engine.log.slice(since).filter((entry) => entry.command === "send_message" && entry.args.session === session),
    accepted: (session, since = 0) => window.sends(session, since).filter((entry) => typeof entry.outcome === "string"),
    mark: () => engine.log.length,
    /** Cuántos `done` procesó la ventana (`harness:turno-cerrado`). */
    closes: () => closes,
    unmount: () => { closed = true; mock.timers.reset(); app.w.close(); },
  };
  return window;
}

/** Las pruebas que reproducen un fallo conocido: `todo` en la cadena, normales con `R0_STRICT=1`. */
export const STRICT = process.env.R0_STRICT === "1";
export const red = (why) => (STRICT ? {} : { todo: why });

const CASE = process.env.FAKE_ENGINE_WINDOW_CASE;
/** Si este proceso corre un solo caso de `windowCase`: las demás pruebas del archivo no se declaran. */
export const inWindowCase = CASE !== undefined;
/**
 * Un caso con ventana, en su propio proceso. Dos ventanas en un proceso se
 * pisan: `boot()` reescribe los globales (`document`, `window`…) y la anterior
 * sigue viva con sus relojes; medido, un `done` dejaba de despachar la cola si
 * otra ventana había corrido antes. El proceso padre declara la prueba (con su
 * `todo`) y corre el archivo otra vez con solo este caso.
 */
function childEnv(name) {
  // Sin NODE_TEST_CONTEXT: con ella, el `node --test` hijo se cree anidado y no corre nada.
  const { NODE_TEST_CONTEXT: _nested, ...env } = process.env;
  return { ...env, FAKE_ENGINE_WINDOW_CASE: name };
}
export function windowCase(file, name, options, body) {
  if (CASE !== undefined) { if (CASE === name) test(name, body); return; }
  test(name, options, async () => {
    const child = spawn(process.execPath, ["--test", "--test-force-exit", "--test-reporter=spec", fileURLToPath(file)], { env: childEnv(name) });
    let output = "";
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { output += chunk; });
    const code = await new Promise((resolve) => child.on("close", resolve));
    const plain = output.replace(/\u001b\[[0-9;]*m/gu, "");
    const reason = plain.split("\n").filter((line) => /AssertionError|Error:|^\s+(actual|expected): /u.test(line)).slice(0, 12).join("\n");
    assert.equal(code, 0, `${name}\n${reason || plain.slice(-2000)}`);
    assert.match(plain, /pass 1/u, `${name}: el caso no corrió en su proceso`);
  });
}
