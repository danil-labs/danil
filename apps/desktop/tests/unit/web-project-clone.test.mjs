/**
 * Cloning on a remote machine from the browser build: the relay opens no
 * channel, so «Añadir un proyecto» clones with `start_project_clone`, follows
 * the `project_clone` events, cancels with `cancel_project_clone` and, after a
 * reload, picks the clone up again with `project_clone_status`. Mounts
 * `dist-web/` against the fake relay.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { engine, relay } from "../helpers/fake-relay.mjs";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const PENDING = "harness.layout.projects.remote_clones";
const PANEL = { id: "p9", name: "panel", working_directory: "/home/danil/code/panel", kind: "git", portfolio: null, sources: [] };

/** An engine that clones in the background: the test decides when each event arrives. */
function cloning() {
  const projects = [...engine.list_projects];
  const status = new Map();
  const table = {
    ...engine,
    list_projects: () => projects,
    get_project_directory: "/home/danil/code",
    list_project_repositories: [],
    list_git_hosts: [],
    start_project_clone: ({ operation }) => {
      status.set(operation, { workspace: "w", operation, phase: "waiting", percent: null, done: false });
      return { operation };
    },
    project_clone_status: ({ operation }) => status.get(operation) ?? null,
    cancel_project_clone: () => null,
  };
  return { table, projects, status };
}

async function open(name, { storage = {}, setup } = {}) {
  const clone = cloning();
  setup?.(clone);
  const fake = relay({ table: clone.table });
  const app = await boot("listo", name, {}, undefined, storage, {
    web: true,
    beforeImport: (w) => {
      globalThis.WebSocket = fake.Socket;
      w.terminusWeb = { endpoint: "https://relay.test", computerId: "cmp_test", getToken: async () => "tok" };
    },
  });
  await sleep(800);
  const doc = app.w.document;
  const text = () => doc.body.textContent ?? "";
  const button = (label) => [...doc.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(label));
  const calls = (command) => fake.calls.filter((c) => c.command === command);
  /** What the engine says about the clone, by event and in `project_clone_status`. */
  const report = (event) => {
    clone.status.set(event.operation, { workspace: "w", percent: null, done: false, ...event });
    fake.push({ type: "events", cursor: Date.now(), gap: false, replay: false, runtime: "rt1", events: [{ name: "project_clone", payload: clone.status.get(event.operation) }] });
  };
  /** Whether the project picker of the composer lists `name`. */
  const listed = async (name) => {
    doc.querySelector('button[aria-label="Proyecto"]').click();
    await sleep(300);
    const found = [...doc.querySelectorAll("button")].some((b) => b.textContent?.trim().startsWith(`${name}sin tareas`));
    doc.querySelector('button[aria-label="Proyecto"]').click();
    await sleep(200);
    return found;
  };
  return { app, fake, clone, doc, text, button, calls, report, listed };
}

/** Opens «Añadir un proyecto», chooses a Git URL and starts cloning it. */
async function startClone(t, url = "https://github.com/danil/panel.git") {
  t.doc.querySelector('button[aria-label="Proyecto"]').click();
  await sleep(300);
  t.button("Añadir un proyecto").click();
  await sleep(400);
  assert.ok(!t.text().includes("Explorar carpeta"), "on a remote machine there is no native folder dialog");
  t.button("Git URL").click();
  await sleep(300);
  assert.ok(t.text().includes("/home/danil/code"), "the destination is the machine's projects folder");
  assert.equal(t.button("Cambiar carpeta"), undefined, "the destination cannot be changed to a path of this computer");
  const input = t.doc.querySelector('input[placeholder="https://github.com/organizacion/repo"]');
  const set = Object.getOwnPropertyDescriptor(t.app.w.HTMLInputElement.prototype, "value").set;
  set.call(input, url);
  input.dispatchEvent(new t.app.w.Event("input", { bubbles: true }));
  await sleep(50);
  t.button("Clonar").click();
  await sleep(400);
  const started = t.calls("start_project_clone").at(-1);
  assert.ok(started, "the clone starts with start_project_clone");
  return started;
}

test("a remote clone starts, shows its progress and opens the new project", async () => {
  const t = await open("web-project-clone");
  const started = await startClone(t);
  assert.equal(t.calls("clone_project").length, 0, "the stream command, which loses its channel over the relay, is not used");
  assert.match(started.args.operation, /^[0-9a-f-]{36}$/);
  assert.deepEqual([started.args.url, started.args.workspace, started.args.gitHost, "progress" in started.args], ["https://github.com/danil/panel.git", "w", null, false]);
  assert.equal(started.workspace, "w");
  const operation = started.args.operation;
  assert.deepEqual(JSON.parse(t.app.w.localStorage.getItem(PENDING)).map((c) => c.operation), [operation], "the clone is remembered for a reload");

  t.report({ operation, phase: "receiving", percent: 40 });
  await sleep(300);
  assert.ok(t.text().includes("Recibiendo objetos"), "the phase of the event shows");
  assert.ok(t.text().includes("40 %"), "and its percent");

  t.clone.projects.push(PANEL);
  t.report({ operation, phase: "done", done: true, project: PANEL });
  await sleep(800);
  assert.ok(await t.listed("panel"), "the cloned project is in the list");
  assert.ok(!t.text().includes("Recibiendo objetos"), "the progress is gone");
  assert.equal(t.app.w.localStorage.getItem(PENDING), null, "a finished clone is forgotten");
  assert.deepEqual(t.app.failures, []);
});

test("a remote clone that fails says why, and cancelling asks the machine", async () => {
  const t = await open("web-project-clone-fail");
  let started = await startClone(t);
  t.report({ operation: started.args.operation, phase: "done", done: true, error: { what: { clave: "projects.error.clone_failed" }, detail: "401" } });
  await sleep(500);
  assert.ok(t.text().includes("No se pudo clonar el repositorio"), "the engine's failure shows in the dialog");

  t.button("Clonar").click();
  await sleep(400);
  started = t.calls("start_project_clone").at(-1);
  t.report({ operation: started.args.operation, phase: "receiving", percent: 10 });
  await sleep(300);
  t.button("Cancelar").click();
  await sleep(300);
  const cancel = t.calls("cancel_project_clone").at(-1);
  assert.deepEqual([cancel?.args.operation, cancel?.workspace], [started.args.operation, "w"], "cancel goes to the machine, in the clone's workspace");
  t.report({ operation: started.args.operation, phase: "done", done: true, error: { what: { clave: "projects.error.clone_cancelled" }, detail: "" } });
  await sleep(500);
  assert.ok(t.text().includes("Clonado cancelado"));
  assert.ok(!t.text().includes("Cancelando…"), "the clone is over");
  assert.equal(t.app.w.localStorage.getItem(PENDING), null);
  assert.deepEqual(t.app.failures, []);
});

test("after a reload the clone is picked up with project_clone_status", async () => {
  const operation = "8a3c1f40-7d1e-4f55-9a0b-2c2f1e9d0b11";
  const t = await open("web-project-clone-reload", {
    storage: { [PENDING]: JSON.stringify([{ operation, machine: "cmp_test", workspace: "w", name: "panel" }]) },
    setup: (clone) => clone.status.set(operation, { workspace: "w", operation, phase: "resolving", percent: 70, done: false }),
  });
  await sleep(400);
  const asked = t.calls("project_clone_status").at(-1);
  assert.deepEqual([asked?.args.operation, asked?.workspace], [operation, "w"], "the page asks the machine how the clone is going");
  assert.ok(t.text().includes("Resolviendo diferencias"), "the rail shows the clone again, with its phase");

  t.clone.projects.push(PANEL);
  t.clone.status.set(operation, { workspace: "w", operation, phase: "done", percent: null, done: true, project: PANEL });
  await sleep(5600);
  assert.ok(!t.text().includes("Resolviendo diferencias"), "the status says it ended, even without the event");
  assert.ok(await t.listed("panel"), "and the project is listed");
  assert.equal(t.app.w.localStorage.getItem(PENDING), null);
  assert.deepEqual(t.app.failures, []);
});
