/**
 * The desktop signed in to the Danil account adds the tasks of the other
 * computers of the person to its own (`features/machines/router.ts`): its own
 * engine stays on the native IPC, paints first and keeps its ids; each other
 * computer is a relay session that only adds its slice. A call goes to another
 * machine only by its envelope (the `x-terminus-machine` header), never by an
 * id in its arguments. Signed out, nothing changes.
 * Mounts `dist/` with a simulated IPC (the local engine) and a fake relay.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { HOME, localNewTask, newTask, open, openTask, remote, until, VM, write } from "../helpers/desktop-account.mjs";
import { sleep } from "../helpers/jsdom-app.mjs";

test("signed out, the desktop is the local window as before", async () => {
  const { app, f, doc, listed, invoke } = await open("desktop-account-signed-out", {
    status: { state: "disconnected", online: false },
    relays: { cmp_vm: { table: remote("Panel", "Tarea de la VM") } },
  });
  assert.ok(doc.querySelector('[data-sesion="t1"]'), "the local task is in the sidebar");
  assert.equal(doc.querySelector("[data-machine]"), null, "one machine: no badge");
  assert.equal(listed.length, 0, "the computers are never listed");
  assert.equal(f.relays.cmp_vm.sockets.length, 0, "no relay session opens");
  assert.ok(!app.commands.includes("account_relay_token"), "no token is asked for");
  assert.deepEqual(await invoke("machine_list"), [{ id: "local", local: true, active: true, on: true, hosts: true }], "the window's own machine list");
  assert.deepEqual(app.failures, []);
});

test("an engine without client tokens leaves the window local", async () => {
  const { app, f, doc, listed } = await open("desktop-account-old-engine", {
    token: null,
    relays: { cmp_vm: { table: remote("Panel", "Tarea de la VM") } },
  });
  assert.ok(doc.querySelector('[data-sesion="t1"]'));
  assert.equal(doc.querySelector("[data-machine]"), null);
  assert.equal(listed.length, 0);
  assert.equal(f.relays.cmp_vm.sockets.length, 0);
  assert.deepEqual(app.failures, []);
});

test("signed in, the tasks of every machine show together; a VM task's actions go to the VM by its envelope", async () => {
  const { app, doc, text, listed, relayCalls, native } = await open("desktop-account-machines", {
    relays: {
      cmp_vm: { table: remote("Panel", "Tarea de la VM"), state: "online" },
      cmp_mac: { table: remote("Notas", "Tarea del Mac"), state: "online" },
    },
  });
  assert.deepEqual(listed, ["Bearer client-tok"], "the computers are listed with the engine's client token");
  assert.equal(doc.querySelectorAll("[data-machine-toast]").length, 0, "a machine found on says nothing");
  assert.ok(text().includes("Tarea local") && text().includes("Tarea de la VM") && text().includes("Tarea del Mac"));
  assert.ok(doc.querySelector('[data-sesion="t1"]'), "the local task keeps its id");
  assert.ok(doc.querySelector('[data-sesion="cmp_vm~t1"]'), "the VM task has its namespaced id");
  assert.ok(doc.querySelector('[data-sesion="cmp_mac~t1"]'));
  // The rail card carries no machine chip; its hover card names the machine (see below).
  assert.equal(doc.querySelector('[data-sesion="t1"] [data-machine]'), null, "a local task's row names no machine");
  assert.equal(doc.querySelector('[data-sesion="cmp_vm~t1"] [data-machine]'), null, "the VM task's card has no machine chip");
  assert.equal(doc.querySelector('[data-sesion="cmp_mac~t1"] [data-machine]'), null);
  assert.ok(relayCalls("cmp_vm", "list_projects").some((c) => c.workspace === "w"), "the VM reads its own workspace");
  assert.ok(native("list_projects").length > 0, "the local engine still answers through the window");

  await openTask(app, "cmp_vm~t1");
  assert.deepEqual(relayCalls("cmp_vm", "load_session").map((c) => c.args.id), ["t1"], "the VM's task opens from the VM, with its own id");
  await write(app, "hola VM");
  assert.ok(await until(() => relayCalls("cmp_vm", "send_message").length === 1), "the message reaches the VM");
  assert.equal(relayCalls("cmp_vm", "send_message")[0].args.session, "t1");
  assert.equal(native("send_message").length, 0, "the VM's message never reaches the local engine");
  assert.equal(relayCalls("cmp_mac", "send_message").length, 0);

  await openTask(app, "t1");
  await write(app, "hola aquí");
  assert.ok(await until(() => native("send_message").length === 1), "a local task stays native");
  assert.equal(native("send_message")[0].args.session, "t1");
  assert.equal(relayCalls("cmp_vm", "send_message").length, 1);
  assert.deepEqual(app.failures, []);
});

test("the account and danil_* stay on this computer, and whoAmI asks for the window's workspace by name", async () => {
  const { app, relayCalls, native } = await open("desktop-account-own-commands", {
    relays: { cmp_vm: { table: remote("Panel", "Tarea de la VM", { list_accounts: { accounts: [], active: null } }), state: "online" } },
    extra: {
      danil_sessions: [{ account: "4", email: "ana@danil.ai", name: "Ana", photo: null, computer_id: "cmp_home", default: true, workspaces: ["w"], status: "connected", online: true }],
      danil_workspace_account: { account: "4", email: "ana@danil.ai", signed_in: true, linked: true },
      list_accounts: { accounts: [], active: null },
    },
  });
  assert.ok(native("danil_workspace_account").some((c) => c.args?.workspace === "w"), "the account is the one of the window's workspace, asked by name");
  for (const command of ["list_accounts", "danil_sessions", "danil_workspace_account", "account_relay_token"]) assert.equal(relayCalls("cmp_vm", command).length, 0, `${command} never leaves this computer`);
  assert.deepEqual(app.failures, []);
});

test("a new task is born on this computer unless «Ejecutar en» picks another for the workspace", async () => {
  const { app, relayCalls, native } = await open("desktop-account-run-on", {
    relays: {
      cmp_vm: { table: remote("Panel", "Tarea de la VM", { send_message: () => "r7" }), state: "online" },
      cmp_mac: { table: remote("Notas", "Tarea del Mac"), state: "online" },
    },
    extra: { work_status: { ahead: 0, dirty: false, files: [], large: [], submodules: [] } },
  });
  await newTask(app);
  await write(app, "aquí");
  assert.ok(await until(() => native("send_message").length === 1), "without a pick, the task is born on the window's machine");
  assert.equal(relayCalls("cmp_vm", "send_message").length, 0);

  const doc = app.w.document;
  localNewTask(doc).click();
  assert.ok(await until(() => doc.querySelector('[aria-label="Ejecutar en"]')), "the composer offers «Ejecutar en»");
  doc.querySelector('[aria-label="Ejecutar en"]').click();
  assert.ok(await until(() => doc.querySelector('[data-machine-option="cmp_vm"]')), "the picker lists the account's machines");
  doc.querySelector('[data-machine-option="cmp_vm"]').click();
  await sleep(200);
  await write(app, "en la VM");
  assert.ok(await until(() => relayCalls("cmp_vm", "send_message").length === 1), "the picked machine gets it");
  assert.deepEqual(relayCalls("cmp_vm", "send_message").map((c) => [c.args.project, c.args.session, c.workspace]), [["p1", null, "w"]], "with the same project and workspace ids");
  assert.equal(native("send_message").length, 1, "nothing more is born on this computer");
  assert.equal(JSON.parse(app.w.localStorage.getItem("harness.layout.machines.run_on")).w, "cmp_vm", "«Ejecutar en» is remembered for this workspace");
  assert.equal(app.w.localStorage.getItem("terminus-web:computer"), null, "no global last machine decides for another workspace");
  assert.deepEqual(app.failures, []);
});

test("the task card says its machine, and the folder chip adds no native tooltip", async () => {
  const { app, doc } = await open("desktop-account-hover", {
    relays: {
      cmp_vm: { table: remote("Panel", "Tarea de la VM"), state: "online" },
      cmp_mac: { table: remote("Notas", "Tarea del Mac"), state: "offline", cachedAt: "2026-10-18T21:30:00Z" },
    },
  });
  const fila = doc.querySelector('[data-sesion="cmp_mac~t1"]');
  assert.ok(fila);
  assert.equal(fila.querySelector("[data-folder-chip]")?.getAttribute("title") ?? null, null, "no native title over the card");
  fila.closest("[data-sesion]").parentElement.dispatchEvent(new app.w.PointerEvent("pointerenter", { pointerType: "mouse" }));
  await sleep(900);
  const machine = doc.querySelector('[data-hover-machine="cmp_mac"]');
  assert.ok(machine, "the card has a machine row");
  assert.ok(machine.parentElement.parentElement.textContent.includes("Máquina"));
  assert.ok(machine.parentElement.textContent.includes("Mac de Ana"));
  assert.equal(machine.getAttribute("aria-label"), "apagada");
  // Una tarea de esta computadora también dice su máquina: con varias, no se adivina.
  const local = [...doc.querySelectorAll("[data-sesion]")].find((el) => !el.getAttribute("data-sesion").includes("~"));
  assert.ok(local, "there is a task of this computer");
  local.parentElement.dispatchEvent(new app.w.PointerEvent("pointerenter", { pointerType: "mouse" }));
  await sleep(900);
  const aqui = [...doc.querySelectorAll("[data-hover-machine]")].find((el) => !el.getAttribute("data-hover-machine").startsWith("cmp_vm") && el.getAttribute("data-hover-machine") !== "cmp_mac");
  assert.ok(aqui, "the card of a local task has a machine row");
  assert.ok(aqui.parentElement.textContent.includes("Mi Mac"), "its name in the account, not «Esta Mac»");
  assert.equal(aqui.getAttribute("aria-label"), "encendida");
  assert.deepEqual(app.failures, []);
});

test("an action wakes the VM; a physical machine that is off is never started", async () => {
  const { app, doc, relayCalls, text } = await open("desktop-account-off", {
    relays: {
      cmp_vm: { table: remote("Panel", "Tarea de la VM"), state: "stopped", cachedAt: "2026-10-18T21:30:00Z" },
      cmp_mac: { table: remote("Notas", "Tarea del Mac"), state: "offline", cachedAt: "2026-10-18T21:30:00Z", notStartable: true },
    },
  });
  assert.ok(doc.querySelector('[data-sesion="cmp_vm~t1"]'), "the VM's copy shows");
  assert.equal(relayCalls("cmp_vm", "send_message").length, 0, "opening the app never starts it");

  await openTask(app, "cmp_mac~t1");
  await write(app, "hola Mac");
  await sleep(500);
  // The sentence it fails with is checked in `machine-router.test.ts`.
  assert.equal(relayCalls("cmp_mac", "send_message").length, 0, "nothing tries to start the person's own machine");

  await openTask(app, "cmp_vm~t1");
  await write(app, "hola VM");
  assert.ok(await until(() => relayCalls("cmp_vm", "send_message").length === 1, 3000), "the action wakes the VM and is delivered");
  await sleep(300);
  assert.equal(relayCalls("cmp_vm", "send_message").length, 1, "once");
  const toasts = [...doc.querySelectorAll("[data-machine-toast]")].map((n) => n.textContent);
  assert.ok(toasts.some((x) => x.includes("Danil VM se encendió")), `a toast says it turned on: ${toasts}`);
  assert.ok(!text().includes("Algo se rompió"), "no generic failure");
  assert.deepEqual(app.failures, []);
});

test("with another machine in «Ejecutar en», a clone runs there with start_project_clone", async () => {
  const status = new Map();
  const panel = { id: "p7", name: "panel", working_directory: "/home/danil/code/panel", kind: "git", portfolio: null, sources: [] };
  const { app, f, doc, text, relayCalls, native } = await open("desktop-account-clone", {
    computers: [HOME, { ...VM, state: "online" }],
    relays: {
      cmp_vm: {
        table: remote("Panel", "Tarea de la VM", {
          get_project_directory: "/home/danil/code",
          start_project_clone: ({ operation }) => {
            status.set(operation, { workspace: "w", operation, phase: "waiting", percent: null, done: false });
            return { operation };
          },
          project_clone_status: ({ operation }) => status.get(operation) ?? null,
        }),
      },
    },
    extra: { list_project_repositories: [], list_git_hosts: [], get_project_directory: "/Users/ana/Documents" },
  });
  app.w.localStorage.setItem("harness.layout.machines.run_on", JSON.stringify({ w: "cmp_vm" }));
  const button = (label) => [...doc.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(label));
  doc.querySelector('button[aria-label="Proyecto"]').click();
  await sleep(300);
  button("Añadir un proyecto").click();
  await sleep(400);
  assert.ok(!text().includes("Explorar carpeta"), "no native folder dialog for another machine");
  button("Git URL").click();
  await sleep(400);
  assert.ok(text().includes("/home/danil/code") && !text().includes("/Users/ana/Documents"), "the destination is the VM's projects folder");
  const input = doc.querySelector('input[placeholder="https://github.com/organizacion/repo"]');
  Object.getOwnPropertyDescriptor(app.w.HTMLInputElement.prototype, "value").set.call(input, "https://github.com/danil/panel.git");
  input.dispatchEvent(new app.w.Event("input", { bubbles: true }));
  await sleep(50);
  button("Clonar").click();
  await sleep(500);
  const started = relayCalls("cmp_vm", "start_project_clone").at(-1);
  assert.ok(started, "the clone goes to the VM");
  assert.equal(native("clone_project").length + native("start_project_clone").length, 0, "this Mac does not clone it");
  const operation = started.args.operation;
  const report = (event) => {
    status.set(operation, { workspace: "w", operation, percent: null, done: false, ...event });
    f.relays.cmp_vm.push({ type: "events", cursor: Date.now(), gap: false, replay: false, runtime: "rt1", events: [{ name: "project_clone", payload: status.get(operation) }] });
  };
  report({ phase: "receiving", percent: 55 });
  await sleep(400);
  assert.ok(text().includes("Recibiendo objetos") && text().includes("55 %"), "the VM's progress shows in the window");
  report({ phase: "done", done: true, project: panel });
  await sleep(600);
  assert.ok(!text().includes("Recibiendo objetos"), "the clone ended");
  assert.equal(app.w.localStorage.getItem("harness.layout.projects.remote_clones"), null);
  assert.deepEqual(app.failures, []);
});
