/**
 * Con tareas trabajando, aplicar una versión no reinicia de golpe: espera a que
 * terminen o las detiene después de decir cuáles. Salir ofrece la misma espera.
 * Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const workspace = { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" };
const row = { id: "s1", title: "Una tarea", last_message: "", provider: "codex", model: "gpt-5.6", refs: [], updated_at: 0, turns: 1, parent: null, esperando: false };
const live = [
  { session: "s1", workspace: "w", project: "", started_at: 1 },
  { session: "sh", workspace: "w", project: "", started_at: 2, shell: { id: "x", command: "npm test" } },
];

test("restarting and quitting wait for live tasks or stop the ones they name", async () => {
  let vivos = live;
  let restarts = 0;
  let quits = 0;
  const stops = [];
  const app = await boot("listo", "update-wait", {
    window_ready: null,
    window_vitals: null,
    setup_required: false,
    update_pending: true,
    list_providers: [],
    list_projects: [],
    list_sources: [],
    list_live_sessions: [row],
    list_live_turns: () => vivos,
    list_surfaces: [],
    pending_requests: { questions: [], permissions: [] },
    stop_turn: ({ session }) => { stops.push(session); return null; },
    stop_shell_command: ({ session }) => { stops.push(session); return null; },
    restart_app: () => { restarts += 1; return null; },
    quit_completely: () => { quits += 1; return null; },
    window_to_background: null,
    tray_update: null,
    tray_notify: null,
    service_poll: { cursor: 0, gap: false, replay: false, runtime: "fixture", reset: false },
    list_workspaces: workspace,
    workspaces_startup: workspace,
  });
  await sleep(300);
  const doc = app.w.document;
  const installed = () => [...doc.querySelectorAll('[role="status"]')].find((el) => el.textContent.includes("Se instaló una versión nueva"));
  const waiting = () => doc.querySelector("[data-wait-notice]");
  const button = (root, text) => [...root.querySelectorAll("button")].find((b) => b.textContent.trim() === text);

  assert.ok(installed(), "the installed-version notice shows");
  assert.equal(button(installed(), "Reiniciar ahora"), undefined, "no immediate restart while tasks are live");
  assert.match(installed().textContent, /terminen 2 tareas/);

  button(installed(), "Detener y reiniciar ya").click();
  await sleep(100);
  const confirm = doc.querySelector("[data-stop-confirm]");
  assert.ok(confirm, "stopping asks first");
  assert.match(confirm.textContent, /Una tarea, npm test/);
  assert.deepEqual(stops, []);
  button(installed(), "Volver").click();
  await sleep(50);

  button(installed(), "Reiniciar cuando terminen").click();
  await sleep(150);
  assert.ok(waiting(), "the wait stays visible");
  assert.match(waiting().textContent, /Esperando a: Una tarea, npm test/);
  assert.equal(installed(), undefined);
  button(waiting(), "Cancelar espera").click();
  await sleep(100);
  assert.equal(waiting(), null);
  assert.ok(installed(), "cancelling brings the choice back");

  button(installed(), "Reiniciar cuando terminen").click();
  await sleep(150);
  assert.equal(restarts, 0);
  vivos = [];
  await sleep(2600);
  assert.equal(restarts, 1, "restarts once the live turns reach zero");
  assert.equal(waiting(), null);

  await sleep(200);
  assert.ok(button(installed(), "Reiniciar ahora"), "without tasks the plain restart is back");
  vivos = live;
  button(installed(), "Reiniciar ahora").click();
  await sleep(150);
  assert.equal(restarts, 1, "a task that started since the last look blocks the plain restart");
  assert.ok(button(installed(), "Reiniciar cuando terminen"));
  button(installed(), "Detener y reiniciar ya").click();
  await sleep(100);
  button(installed(), "Detener y reiniciar").click();
  await sleep(150);
  assert.deepEqual(stops.sort(), ["s1", "sh"]);
  assert.equal(restarts, 2);

  stops.length = 0;
  app.emit("tray-quit", null);
  await sleep(150);
  const guard = doc.querySelector("[data-close-guard]");
  assert.ok(guard, "quitting with live tasks asks");
  button(guard, "Salir cuando terminen").click();
  await sleep(150);
  assert.equal(doc.querySelector("[data-close-guard]"), null);
  assert.match(waiting().textContent, /Danil se cierra cuando terminen/);
  assert.equal(quits, 0);
  vivos = [];
  await sleep(2600);
  assert.equal(quits, 1, "quits once the live turns reach zero");
  assert.deepEqual(stops, [], "waiting never stops a task");
  assert.deepEqual(app.failures, []);
});
