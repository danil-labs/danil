/**
 * The browser build (`dist-web/`, `pnpm web:build`) against a relay simulated in
 * Node: it mounts, its invokes travel as `call` and come back as `result`, the
 * events of `subscribe` reach the thread and the machine state shows as a notice.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { engine, relay } from "../helpers/fake-relay.mjs";
import { waitFor } from "../helpers/wait-for.mjs";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

test("the web build talks to the relay: calls, events and machine state", async () => {
  const fake = relay();
  const app = await boot("listo", "web-transport", {}, undefined, {}, {
    web: true,
    beforeImport: (w) => {
      globalThis.WebSocket = fake.Socket;
      w.terminusWeb = { endpoint: "https://relay.test", computerId: "cmp_test", getToken: async () => "tok" };
    },
  });
  await waitFor(() => app.w.document.querySelector('[data-sesion="cmp_test~t1"]'), "the task did not reach the sidebar");
  const text = () => app.w.document.body.textContent ?? "";

  assert.deepEqual(app.failures, []);
  assert.equal(fake.sockets[0]?.url, "wss://relay.test/v1/computers/cmp_test/session", "like the phone, no ?contracts=: an engine on another contract stays in service");
  assert.deepEqual(fake.sockets[0]?.protocols, ["danil.computers.v1", "bearer.tok"]);

  const projects = fake.calls.find((c) => c.command === "list_projects");
  assert.ok(projects, "list_projects did not reach the relay");
  assert.match(projects.id, /^[0-9a-f-]{36}$/);
  assert.equal(projects.workspace, "w", "the active workspace travels in the envelope");
  assert.ok(text().includes("Tarea t1"), "the value of a call did not reach the sidebar");
  const local = fake.calls.filter((c) => /^(window_|launcher_|service_poll|tray_)/.test(c.command));
  assert.deepEqual(local.map((c) => c.command), [], "window-only commands stay in the page");
  assert.deepEqual(fake.subscriptions.slice(0, 1), [null]);

  app.w.document.querySelector('[data-sesion="cmp_test~t1"]').click();
  await sleep(400);
  const where = app.w.document.querySelector("[data-task-location]");
  assert.equal(where?.querySelector("[data-task-location-machine]")?.textContent, "cmp_test", "in the browser the task runs on the computer, not on this one");
  fake.push({
    type: "events",
    cursor: 2,
    gap: false,
    replay: false,
    runtime: "rt1",
    events: [
      { name: "chat", payload: { kind: "started", session: "t1", workspace: "w" } },
      { name: "chat", payload: { kind: "delta", session: "t1", workspace: "w", text: "hola desde el relay" } },
    ],
  });
  await sleep(600);
  assert.ok(text().includes("hola desde el relay"), "the events of the subscription did not reach the thread");

  fake.setState("offline");
  await sleep(5500);
  assert.equal(app.w.document.querySelector("[data-web-sync]")?.dataset.state, "offline", "the indicator did not show it off");
  assert.ok(!text().includes("La máquina de este host está apagada"), "machine_off showed as an error");
  fake.setState("online");
  fake.push({ type: "events", cursor: 3, gap: false, replay: false, runtime: "rt1", events: [] });
  await sleep(1200);
  assert.equal(app.w.document.querySelector("[data-web-sync]")?.dataset.state, "online", "the indicator stayed off after the machine came back");
  assert.deepEqual(app.failures, []);
});

test("the transport leaves out what the account may not see: workspaces, attention and events", async () => {
  const { fleet } = await import("../helpers/fake-relay.mjs");
  const ws = (id, name) => ({ id, name, context_root: null });
  const vmList = { workspaces: [ws("w", "W"), ws("w2", "Dos"), ws("z", "Ajeno")], active: "z" };
  const ask = (session) => ({ session, project: "p1", state: "asked" });
  const f = fleet({
    cmp_vm: { table: { ...engine, list_workspaces: vmList, workspaces_startup: vmList, list_workspace_attention: [{ workspace: "w2", tasks: [ask("t2")] }, { workspace: "z", tasks: [ask("t9")] }] } },
    cmp_other: { table: { ...engine } },
  });
  const computers = [
    { computer_id: "cmp_vm", name: "Danil VM", state: "online", provider: "aws-ec2", workspaces: ["w", "w2"] },
    { computer_id: "cmp_other", name: "Otra", state: "online", provider: "aws-ec2", workspaces: ["w"] },
  ];
  const app = await boot("listo", "web-transport-linked", {}, undefined, {}, {
    web: true,
    beforeImport: (w) => {
      globalThis.WebSocket = f.Socket;
      w.terminusWeb = { endpoint: "https://relay.test", computers, getToken: async () => "tok" };
    },
  });
  await sleep(2500);
  const doc = app.w.document;
  const invoke = (command, args, options) => app.w.__TAURI_INTERNALS__.invoke(command, args, options);
  const tile = (id) => doc.querySelector(`[data-workspace-tile="${id}"]`);

  const list = await invoke("list_workspaces");
  assert.deepEqual(list.workspaces.map((w) => w.id), ["w", "w2"], "a workspace not linked on that computer is not listed");
  assert.notEqual(list.active, "z", "nor opened");
  assert.equal(tile("z"), null);
  assert.equal(tile("w2")?.dataset.attention, "asked", "the attention of a linked workspace shows");
  const attention = await invoke("list_workspace_attention");
  assert.ok(!attention.some((e) => e.workspace === "z"), "the attention of one that is not, does not");

  f.relays.cmp_vm.push({
    type: "events",
    cursor: 5,
    gap: false,
    replay: false,
    runtime: "rt",
    events: [
      { name: "attention", workspace: "z", payload: [{ workspace: "z", tasks: [ask("t9")] }] },
      { name: "attention", payload: [{ workspace: "w", tasks: [ask("t1")] }, { workspace: "w2", tasks: [] }, { workspace: "z", tasks: [ask("t8")] }] },
    ],
  });
  await sleep(800);
  assert.equal(tile("w")?.dataset.attention, "asked", "the whole list of the machine arrives, filtered");
  assert.equal(tile("w2")?.dataset.attention, undefined, "and replaces what waited before");
  assert.equal(tile("z"), null);

  assert.deepEqual(app.failures, []);
});

test("workspace context comes from its owning machine, including its source reads", async () => {
  const { fleet } = await import("../helpers/fake-relay.mjs");
  const listing = (root) => ({ workspaces: [{ id: "w", name: "W", context_root: root }], active: "w" });
  const source = { id: "context-mac", name: "Context", etiqueta: "Context", kind: "folder", location: "/context", path: "/context", root: true, missing: false, projects: [] };
  const taskSource = { ...source, id: "vm-only", name: "VM-only material", etiqueta: "VM-only material", root: false, kind: "folder" };
  const vm = { ...engine, list_live_sessions: ({ project }) => project === "p1" ? engine.list_live_sessions({ project }) : [], list_sources: [taskSource], load_session: ({ id }) => ({ id, provider: "codex", sources: [taskSource.id], model: "gpt-5.6", turns: [] }), list_workspaces: listing(null), workspaces_startup: listing(null), source_detail: { machine: "vm" }, set_root: true, add_folder: { id: "task-folder" }, add_repo_url: { id: "task-repo" } };
  const mac = { ...engine, list_projects: [{ ...engine.list_projects[0], id: "pm", name: "Mac project" }], list_live_sessions: ({ project }) => project === "pm" ? engine.list_live_sessions({ project: "p1" }) : [], list_workspaces: listing(source.id), workspaces_startup: listing(source.id), list_sources: [source], source_detail: { machine: "mac" }, add_folder: { id: "context-folder" }, add_repo_url: { id: "context-repo" } };
  const f = fleet({ cmp_vm: { table: vm }, cmp_mac: { table: mac } });
  const app = await boot("listo", "web-context-owner", {}, undefined, {}, {
    web: true,
    beforeImport: (w) => {
      globalThis.WebSocket = f.Socket;
      w.terminusWeb = { endpoint: "https://relay.test", computers: [
        { computer_id: "cmp_vm", name: "VM", state: "online", provider: "aws-ec2", workspaces: ["w"] },
        { computer_id: "cmp_mac", name: "Mac", state: "online", kind: "physical", workspaces: ["w"] },
      ], getToken: async () => "tok" };
    },
  });
  await sleep(1800);
  const invoke = (command, args, options) => app.w.__TAURI_INTERNALS__.invoke(command, args, options);
  const list = await invoke("list_workspaces");
  assert.equal(list.workspaces[0].context_root, source.id, "a materialized VM must not hide the Mac's context");
  assert.deepEqual(await invoke("list_sources"), [source], "the source must actually be readable on its owner");
  assert.deepEqual(await invoke("list_sources", {}, { headers: { "x-terminus-machine": "cmp_vm" } }), [taskSource], "an explicit machine wins");
  assert.deepEqual(await invoke("add_folder", { locator: "/context" }), { id: "context-folder" }, "settings retain the context default");
  app.w.document.querySelector('[data-sesion="cmp_vm~t1"]').click();
  await sleep(400);
  assert.ok(app.w.document.body.textContent.includes(taskSource.etiqueta), "the attachment catalog is read on the task VM, not the context Mac");
  for (const [locator, command] of [["/task-folder", "add_folder"], ["https://example.test/task.git", "add_repo_url"]]) {
    app.w.document.querySelector('[aria-label="Adjuntar una fuente"]').click();
    await sleep(100);
    [...app.w.document.querySelectorAll("button")].find((b) => b.textContent.includes("Pegar una dirección o ruta")).click();
    await sleep(100);
    const input = app.w.document.querySelector('input[placeholder="https://… o /ruta/a/carpeta"]');
    input.value = locator;
    input.dispatchEvent(new app.w.Event("input", { bubbles: true }));
    input.closest("form").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
    await sleep(250);
    assert.ok(f.relays.cmp_vm.calls.some((c) => c.command === command && Object.values(c.args).includes(locator)), "task material is created on the task's VM, despite context on Mac");
    assert.ok(!f.relays.cmp_mac.calls.some((c) => c.command === command && Object.values(c.args).includes(locator)), "the context owner does not receive task material");
  }

  let finishSource;
  vm.add_folder = () => new Promise((resolve) => { finishSource = resolve; });
  app.w.document.querySelector('[aria-label="Adjuntar una fuente"]').click();
  await sleep(100);
  [...app.w.document.querySelectorAll("button")].find((b) => b.textContent.includes("Pegar una dirección o ruta")).click();
  await sleep(100);
  const delayedInput = app.w.document.querySelector('input[placeholder="https://… o /ruta/a/carpeta"]');
  delayedInput.value = "/delayed";
  delayedInput.dispatchEvent(new app.w.Event("input", { bubbles: true }));
  delayedInput.closest("form").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(100);
  assert.ok(finishSource, "the source creation is pending");
  const lateSource = { ...source, id: "late-source", name: "Late-source-wrong-task", root: false, etiqueta: "Late-source-wrong-task" };
  mac.list_sources = [source, lateSource];
  const macSourceReads = f.relays.cmp_mac.calls.filter((c) => c.command === "list_sources").length;
  app.w.dispatchEvent(new app.w.CustomEvent("harness:open-task-link", { detail: { workspace: "w", folder: "pm", task: "cmp_mac~t1" } }));
  await sleep(400);
  assert.ok(f.relays.cmp_mac.calls.some((c) => c.command === "load_session" && c.args.id === "t1"), "the Mac task was opened before resolving the VM request");
  assert.ok(f.relays.cmp_mac.calls.filter((c) => c.command === "list_sources").length > macSourceReads, "the new task catalog on Mac loaded before the late VM result");
  finishSource({ id: lateSource.id });
  await sleep(300);
  assert.ok(!app.w.document.body.textContent.includes(lateSource.etiqueta), "a late source result must not enter the newly active task's draft");
  mac.list_sources = [source];
  await invoke("list_sources");
  f.relays.cmp_mac.setState("offline");
  await sleep(100);
  const partial = await invoke("list_workspaces");
  assert.equal(partial.workspaces[0].context_root, source.id, "a partial listing retains the known owner");
  assert.deepEqual(await invoke("list_sources"), [source], "offline reads retain the owner's cached sources, never the empty VM list");
  await assert.rejects(invoke("source_detail", { id: "uncached" }), "an uncached read reports its unavailable owner");
  f.relays.cmp_mac.setState("online");
  await sleep(100);
  vm.list_workspaces = listing("vm-root");
  let both = await invoke("list_workspaces");
  for (let attempt = 0; attempt < 20 && both.workspaces[0].context_root !== "vm-root"; attempt++) {
    await sleep(50);
    both = await invoke("list_workspaces");
  }
  assert.equal(both.workspaces[0].context_root, "vm-root", "two roots use deterministic machine order");
  assert.deepEqual(await invoke("source_detail", { id: source.id }), { machine: "mac" }, "an already listed source keeps its origin when the default changes");
  await invoke("set_root", { source: source.id }, { headers: { "x-terminus-machine": "cmp_vm" } });
  assert.ok(f.relays.cmp_vm.calls.some((c) => c.command === "set_root"), "configuration's explicit destination wins");
  vm.list_workspaces = listing(null);
  mac.list_workspaces = { workspaces: [{ id: "w", context_root: source.id }, { id: "other", context_root: null }], active: "other" };
  app.w.dispatchEvent(new app.w.CustomEvent("harness:sources"));
  await sleep(600);
  assert.ok(!app.w.document.body.textContent.includes("Sin fuente de contexto"), "refresh uses the UI workspace, not the engine's active workspace");
  mac.list_sources = [];
  app.w.dispatchEvent(new app.w.CustomEvent("harness:sources"));
  await sleep(600);
  assert.ok(app.w.document.body.textContent.includes("No se pudo leer la fuente principal"), "a missing root is a visible read failure");
  assert.ok(!app.w.document.body.textContent.includes("Sin fuente de contexto"));
  assert.deepEqual(app.failures, []);
});

test("only a confirmed absence of a primary source shows the empty context actions", async () => {
  for (const primary of [false, true, "error"]) {
    const source = { id: "s", name: "Source", root: primary, missing: false, projects: [] };
    const fake = relay({ table: { ...engine, list_sources: primary === "error" ? undefined : [source] } });
    const app = await boot("listo", `web-context-primary-${primary}`, {}, undefined, {}, {
      web: true,
      beforeImport: (w) => {
        globalThis.WebSocket = fake.Socket;
        w.terminusWeb = { endpoint: "https://relay.test", computerId: "cmp_test", getToken: async () => "tok" };
      },
    });
    await sleep(700);
    assert.equal(app.w.document.body.textContent.includes("Sin fuente de contexto"), primary === false, "secondary material does not substitute for a primary source, and failed reads do not confirm an empty context");
    assert.deepEqual(app.failures, []);
  }
});

test("an existing local task can attach material without a machine list or an extra catalog read", async () => {
  const calls = [];
  const app = await boot("listo", "local-context-material", {
    ...engine,
    launcher_state: { phase: "ready", blank_0274: false },
    window_ready: null,
    window_vitals: null,
    add_folder: (args) => { calls.push(args); return { id: "local-source" }; },
    machine_list: [],
  });
  await sleep(700);
  app.w.document.querySelector('[data-sesion="t1"]').click();
  await sleep(400);
  app.w.document.querySelector('[aria-label="Adjuntar una fuente"]').click();
  await sleep(100);
  [...app.w.document.querySelectorAll("button")].find((b) => b.textContent.includes("Pegar una dirección o ruta")).click();
  await sleep(100);
  const input = app.w.document.querySelector('input[placeholder="https://… o /ruta/a/carpeta"]');
  input.value = "/local-folder";
  input.dispatchEvent(new app.w.Event("input", { bubbles: true }));
  input.closest("form").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(300);
  assert.deepEqual(calls, [{ locator: "/local-folder" }]);
  assert.deepEqual(app.failures, []);
});

test("la web muestra las tareas disponibles sin esperar a una máquina que no contesta", async (t) => {
  const started = Date.now();
  const { fleet } = await import("../helpers/fake-relay.mjs");
  const f = fleet({ cmp_fast: { table: { ...engine, setup_required: true, prepare_runtime: { running: false, stages: [{ name: "ready", essential: true, state: "succeeded" }] } } }, cmp_slow: { table: engine } });
  const SlowSocket = f.relays.cmp_slow.Socket;
  f.relays.cmp_slow.Socket = class extends SlowSocket {
    send(data) {
      if (JSON.parse(data).type === "call") return;
      super.send(data);
    }
  };
  const app = await boot("listo", "web-slow-machine", {}, undefined, {}, {
    web: true,
    beforeImport: w => {
      globalThis.WebSocket = f.Socket;
      w.terminusWeb = {
        endpoint: "https://relay.test", getToken: async () => "tok",
        computers: ["cmp_fast", "cmp_slow"].map(computer_id => ({ computer_id, name: computer_id === "cmp_slow" ? "A VM lenta" : "B Mac disponible", state: "online", provider: computer_id === "cmp_slow" ? "aws-ec2" : "self", workspaces: ["w"] })),
      };
    },
  });
  const deadline = Date.now() + 4_000;
  while (!app.w.document.querySelector('[data-sesion="cmp_fast~t1"]') && Date.now() < deadline) await sleep(100);
  assert.ok(app.w.document.querySelector('[data-sesion="cmp_fast~t1"]'), "la máquina disponible aporta sus tareas dentro del plazo");
  t.diagnostic(`Primera lista visible: ${Date.now() - started} ms`);
  assert.deepEqual(app.failures, []);
});


test("una respuesta tardía agrega proyectos y tareas sin recargar ni duplicar lecturas pendientes", async () => {
  const { fleet } = await import("../helpers/fake-relay.mjs");
  const f = fleet({ cmp_fast: { table: engine }, cmp_slow: { table: engine } });
  const SlowSocket = f.relays.cmp_slow.Socket;
  const waiting = [];
  let held = true;
  f.relays.cmp_slow.Socket = class extends SlowSocket {
    send(data) {
      if (held && JSON.parse(data).type === "call") return void waiting.push([this, data]);
      super.send(data);
    }
  };
  const app = await boot("listo", "web-late-machine", {}, undefined, {}, {
    web: true,
    beforeImport: w => {
      globalThis.WebSocket = f.Socket;
      w.terminusWeb = {
        endpoint: "https://relay.test", getToken: async () => "tok",
        computers: ["cmp_fast", "cmp_slow"].map(computer_id => ({ computer_id, name: computer_id === "cmp_slow" ? "A VM lenta" : "B Mac disponible", state: "online", provider: computer_id === "cmp_slow" ? "aws-ec2" : "self", workspaces: ["w"] })),
      };
    },
  });
  async function row(id, present = true) {
    const deadline = Date.now() + 4000;
    while (Boolean(app.w.document.querySelector(`[data-sesion="${id}"]`)) !== present && Date.now() < deadline) await sleep(50);
    assert.equal(Boolean(app.w.document.querySelector(`[data-sesion="${id}"]`)), present, id);
  }
  await row("cmp_fast~t1");
  const invoke = (command, args) => app.w.__TAURI_INTERNALS__.invoke(command, args);
  const signature = ([, data]) => {
    const call = JSON.parse(data);
    return JSON.stringify([call.command, call.workspace, call.args]);
  };
  await Promise.all([invoke("list_projects"), invoke("list_projects")]);
  assert.equal(new Set(waiting.map(signature)).size, waiting.length, "las relecturas comparten la petición en vuelo");
  await sleep(10_500);
  held = false;
  for (const [socket, data] of waiting.splice(0)) SlowSocket.prototype.send.call(socket, data);
  await row("cmp_slow~t1");
  await row("cmp_fast~t1");

  held = true;
  const previous = await invoke("list_live_sessions", { project: "p1", open: ["cmp_slow~t1"] });
  assert.ok(previous.some(task => task.id === "cmp_slow~t1"), "cambiar open conserva la última fila de la máquina pendiente");
  for (const [socket, data] of waiting.splice(0)) {
    const call = JSON.parse(data);
    if (call.command === "list_live_sessions") socket.onmessage?.({ data: JSON.stringify({ type: "result", id: call.id, value: [] }) });
    else SlowSocket.prototype.send.call(socket, data);
  }
  const updated = await invoke("list_live_sessions", { project: "p1", open: ["cmp_slow~t1"] });
  assert.ok(!updated.some(task => task.id === "cmp_slow~t1"), "una respuesta vacía confirmada sí retira la fila");
  assert.deepEqual(app.failures, []);
});
