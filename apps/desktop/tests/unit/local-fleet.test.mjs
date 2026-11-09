/**
 * Sin cuenta de Danil, las máquinas huésped (WSL) forman una flota local
 * (`features/machines/account.tsx`): esta computadora es `"local"`, la VM entra
 * en «Ejecutar en» y sus órdenes van por `guest_call`, nunca al motor propio ni
 * a la cuenta. Monta `dist/` con el IPC simulado de la ventana.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { engine } from "../helpers/fake-relay.mjs";
import { HOME, localNewTask, open, row, until, VM, write } from "../helpers/desktop-account.mjs";
import { sleep } from "../helpers/jsdom-app.mjs";

const VMID = "wsl:x";
const CHILD = { id: VMID, channel: "wsl", distro: "x", name: "Ubuntu de prueba", user: "u", home: "/home/u", online: true, features: [], contract: null, version: "0.3.1" };
const SIGNED_OUT = { state: "disconnected" };
const SIGNED_IN = { state: "connected", computer_id: "cmp_home", name: "Mi Mac", online: true };

/** El motor de la VM, por `guest_call`: las mismas respuestas que un motor del relay. */
function guest(calls, overrides = {}) {
  const table = { ...engine, list_live_sessions: ({ project }) => (project === "" || project === "p1" ? [row("t1", "Tarea de la VM")] : []), send_message: "t9", materialize_workspace: null, ...overrides };
  return {
    guest_call: ({ command, args }) => {
      calls.push({ command, args });
      const value = table[command];
      return typeof value === "function" ? value(args ?? {}) : (value ?? null);
    },
    guest_events: () => sleep(40).then(() => ({ cursor: 1, events: [], gap: false })),
    guest_sync_spaces: null,
    guest_start: true,
    guest_job: null,
    list_spaces: [],
  };
}

async function boot(name, { status = SIGNED_OUT, children = [CHILD], computers, storage = {}, token } = {}) {
  const state = { status, children };
  const guestCalls = [];
  const opened = await open(name, {
    status: () => state.status,
    token: token ?? (() => ({ token: "client-tok", expires_at: Date.now() + 600_000, endpoint: "https://relay.test", computer_id: "cmp_home" })),
    ...(computers ? { computers } : {}),
    storage,
    extra: { guest_channels: ["wsl"], guest_children: () => state.children, ...guest(guestCalls) },
  });
  return { ...opened, state, guestCalls };
}

const sockets = (f) => Object.values(f.relays).reduce((n, r) => n + r.sockets.length, 0);
const picker = (doc) => doc.querySelector('[aria-label="Ejecutar en"]');

/** Abre «Ejecutar en» de una tarea nueva y devuelve los ids que ofrece (`machine_list` del router). */
async function options(doc, id) {
  localNewTask(doc)?.click();
  assert.ok(await until(() => picker(doc)), "«Ejecutar en» is offered");
  picker(doc).click();
  assert.ok(await until(() => doc.querySelector(`[data-machine-option="${id}"]`)), `the picker offers ${id}`);
  return [...doc.querySelectorAll("[data-machine-option]")].map((o) => o.getAttribute("data-machine-option"));
}

async function pick(doc, id) {
  const offered = await options(doc, id);
  doc.querySelector(`[data-machine-option="${id}"]`).click();
  await sleep(400);
  return offered;
}

test("2. (first: no other window of this file is alive yet) Without an account and without guests nothing is installed: no route, no picker, no account calls", async () => {
  const { doc, guestCalls, listed, f } = await boot("local-fleet-none", { children: [] });
  localNewTask(doc)?.click();
  await sleep(800);
  assert.equal(picker(doc), null, "no «Ejecutar en» without other machines");
  assert.deepEqual(guestCalls.map((c) => c.command), []);
  assert.equal(listed.length, 0);
  assert.equal(sockets(f), 0);
});

test("1. Without an account and with a guest, the guest is a machine of a local fleet and gets its own orders", async () => {
  const { app, doc, native, listed, guestCalls, f } = await boot("local-fleet-guest");
  const offered = await pick(doc, VMID);
  assert.deepEqual(offered.sort(), ["local", "wsl:x"], "this computer is `local`, next to the VM");
  await write(app, "hola en la VM");
  assert.ok(await until(() => guestCalls.some((c) => c.command === "send_message")), "send_message reaches guest_call");
  assert.equal(native("send_message").length, 0, "the window's engine never gets the VM's message");
  assert.equal(listed.length, 0, "the control plane is never listed");
  assert.equal(sockets(f), 0, "no relay session");
});

test("3. Without an account, connecting the first VM installs the fleet without restarting", async () => {
  const { app, doc, state } = await boot("local-fleet-first", { children: [] });
  localNewTask(doc)?.click();
  await sleep(500);
  assert.equal(picker(doc), null);
  state.children = [CHILD];
  app.w.dispatchEvent(new app.w.CustomEvent("danil:guests-changed"));
  assert.ok(await until(() => picker(doc)), "«Ejecutar en» appears with the first VM");
  picker(doc).click();
  assert.ok(await until(() => doc.querySelector(`[data-machine-option="${VMID}"]`)));
});

test("4. From local to signed in: the VM's task keeps its id, run_on keeps the VM, own tasks stay bare, slices stay", async () => {
  const { app, doc, state } = await boot("local-fleet-sign-in", {
    computers: [HOME],
    storage: { "machines.run_on": JSON.stringify({ w: VMID }) },
  });
  const rowOf = (id) => doc.querySelector(`[data-sesion="${id}"]`);
  assert.ok(await until(() => rowOf("wsl:x~t1")), "the VM's task, with the guest prefix");
  assert.ok(rowOf("t1"), "this computer's task, bare");
  const slices = () => {
    app.w.dispatchEvent(new app.w.Event("pagehide"));
    return app.w.localStorage.getItem("terminus-fleet:slices:v1") ?? "";
  };
  assert.ok(await until(() => slices().includes(VMID)), "the VM's slices are kept");

  state.status = SIGNED_IN;
  app.w.dispatchEvent(new app.w.CustomEvent("harness:workspace"));
  await sleep(1500);
  assert.ok(await until(() => rowOf("wsl:x~t1")), "same id signed in");
  assert.ok(rowOf("t1"), "own task still bare");
  assert.ok(slices().includes(VMID), "the VM's slices survive the switch");
  assert.equal(JSON.parse(app.w.localStorage.getItem("machines.run_on"))?.w, VMID, "run_on keeps the VM");
  rowOf("wsl:x~t1").click();
  await sleep(400);
  assert.ok(doc.querySelector("textarea"), "the VM's task opens");
});

test("5. From signed in to local: the window's own name goes back to this computer's and no relay session is built", async () => {
  const { app, doc, state, f } = await boot("local-fleet-sign-out", { status: SIGNED_IN, computers: [{ ...HOME, name: "Macbook m4" }, { ...VM, state: "online" }] });
  const own = () => doc.querySelector('[data-sesion="t1"]')?.textContent ?? "";
  assert.ok(await until(() => own().includes("Macbook m4")), own());
  const before = sockets(f);
  state.status = SIGNED_OUT;
  app.w.dispatchEvent(new app.w.CustomEvent("harness:workspace"));
  assert.ok(await until(() => !own().includes("Macbook m4") && /Esta (Mac|computadora)/.test(own())), own());
  assert.ok(doc.querySelector('[data-sesion="wsl:x~t1"]'), "the VM's task is still there");
  await sleep(500);
  assert.equal(sockets(f), before, "no relay session after signing out");
});

test("7. A guest_children entry that is not a guest never becomes a machine of the local fleet", async () => {
  const bogus = { ...CHILD, id: "cmp_x", name: "No es huésped" };
  const { doc, f } = await boot("local-fleet-bogus", { children: [CHILD, bogus] });
  const offered = await options(doc, VMID);
  assert.ok(!offered.includes("cmp_x"), offered.join());
  assert.equal(Object.values(f.relays).reduce((n, r) => n + r.sockets.length, 0), 0, "nothing reaches the relay");
});
