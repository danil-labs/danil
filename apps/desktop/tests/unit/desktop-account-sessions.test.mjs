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
import { HOME, MAC, open, openTask, remote, reread, SESSION_A, SESSION_B, TOKEN, until, VM } from "../helpers/desktop-account.mjs";
import { sleep } from "../helpers/jsdom-app.mjs";

test("a workspace of the account that only another machine has lists with the window's own", async () => {
  const registry = [
    { id: "w2", name: "Producto", projects: [{ id: "p5", name: "Aplicación", remote_url: "https://github.com/ana/app", home_computer_id: "cmp_vm" }], computers: ["cmp_vm"] },
  ];
  const { app, doc, registered, relayCalls } = await open("desktop-account-registry", {
    computers: [HOME, VM],
    registry,
    relays: { cmp_vm: { table: remote("Panel", "Tarea de la VM"), state: "offline" } },
  });
  assert.ok(registered.includes("Bearer client-tok"), "the registry is read with the client token");
  assert.ok(await until(() => doc.querySelector('[data-workspace-column] [data-workspace-tile="w2"]')), "the account's workspace is in the column");
  assert.ok(doc.querySelector('[data-workspace-column] [data-workspace-tile="w"]'), "next to the window's own");
  assert.ok(doc.querySelector('[data-sesion="t1"]'), "and the window stays in its own");
  assert.equal(relayCalls("cmp_vm", "send_message").length, 0, "reading wakes nothing");
  assert.deepEqual(app.failures, []);
});

test("a tab of another machine's task never moves this computer's reads, and an off machine without a copy never holds them", async () => {
  const VM2 = { computer_id: "cmp_vm2", name: "VM 2", state: "offline", provider: "aws-ec2" };
  const { app, doc, relayCalls, native } = await open("desktop-account-open-tabs", {
    computers: [HOME, { ...VM, state: "online" }, VM2],
    relays: {
      cmp_vm: { table: remote("Panel", "Tarea de la VM"), state: "online" },
      // Off and never read: neither the relay nor the window has a copy of it.
      cmp_vm2: { table: remote("Panel", "Tarea de la VM 2"), state: "offline" },
    },
  });
  await openTask(app, "cmp_vm~t1");
  await reread(app);
  const opens = native("list_live_sessions").map((c) => c.args.open ?? []);
  assert.ok(opens.length > 0);
  assert.ok(opens.every((open) => open.every((id) => !id.includes("~"))), `this computer only gets its own open tasks: ${JSON.stringify(opens.at(-1))}`);
  assert.ok(relayCalls("cmp_vm", "list_live_sessions").some((c) => (c.args.open ?? []).includes("t1")), "the VM gets its own, with its ids");
  assert.ok(doc.querySelector('[data-sesion="t1"]') && doc.querySelector('[data-sesion="cmp_vm~t1"]'), "both lists stay");
  assert.equal(relayCalls("cmp_vm2", "list_live_sessions").every((c) => !(c.args.open ?? []).length), true, "the off VM gets no other machine's tab");
  assert.deepEqual(relayCalls("cmp_vm2", "send_message"), [], "reading wakes nothing");
  assert.deepEqual(app.failures, []);
});

test("this computer's tasks paint without waiting for a VM that does not answer", async () => {
  const started = Date.now();
  const { app, doc, f, relayCalls } = await open("desktop-account-slow", {
    computers: [HOME, { ...VM, state: "online" }],
    relays: { cmp_vm: { table: remote("Panel", "Tarea de la VM"), state: "online", delay: 600_000 } },
  });
  assert.ok(doc.querySelector('[data-sesion="t1"]'), "the local task is in the sidebar");
  assert.equal(doc.querySelector('[data-sesion="cmp_vm~t1"]'), null, "the silent VM adds nothing");
  assert.ok(Date.now() - started < 8_000, "nothing waited on the VM");
  assert.ok(relayCalls("cmp_vm", "list_live_sessions").length > 0, "the VM was asked");
  assert.equal(f.relays.cmp_vm.sockets.length, 1);
  assert.deepEqual(app.failures, []);
});

test("a VM that stops answering, or turns off without a copy, keeps its last slice: never an invented empty list", async () => {
  const { app, doc, f } = await open("desktop-account-no-answer", {
    computers: [HOME, { ...VM, state: "online" }],
    relays: { cmp_vm: { table: remote("Panel", "Tarea de la VM"), state: "online" } },
  });
  assert.ok(doc.querySelector('[data-sesion="cmp_vm~t1"]'), "the VM's task shows");
  f.relays.cmp_vm.setDelay(600_000);
  await reread(app);
  // Longer than any wait of the window: the old fan-out dropped the VM after 6 s and the list lost its rows.
  await sleep(7_000);
  await reread(app);
  assert.ok(doc.querySelector('[data-sesion="cmp_vm~t1"]'), "a VM that does not answer keeps its rows");
  f.relays.cmp_vm.setDelay(0);
  f.relays.cmp_vm.setState("offline");
  await reread(app);
  await sleep(1_600);
  await reread(app);
  assert.ok(doc.querySelector('[data-sesion="cmp_vm~t1"]'), "off with no relay copy, the window's own copy stays");
  assert.ok(doc.querySelector('[data-sesion="t1"]'));
  const cache = JSON.parse(app.w.localStorage.getItem("harness:shell-cache") ?? "null");
  const rows = cache ? Object.values(JSON.parse(cache.workspaces.w.snapshot).sessions).flat() : [];
  assert.ok(!cache || rows.some((r) => r.id === "cmp_vm~t1"), "the sidebar photo keeps the VM's rows too");
  assert.deepEqual(app.failures, []);
});

test("a machine renamed in the account changes live, without reconnecting the others", async () => {
  const computers = [HOME, { ...VM, state: "online" }, { ...MAC, state: "online" }];
  const { app, doc, f } = await open("desktop-account-rename", {
    computers,
    relays: {
      cmp_vm: { table: remote("Panel", "Tarea de la VM"), state: "online" },
      cmp_mac: { table: remote("Notas", "Tarea del Mac"), state: "online" },
    },
  });
  computers[1] = { ...computers[1], name: "VM de trabajo" };
  app.w.dispatchEvent(new app.w.CustomEvent("harness:workspace"));
  await sleep(1_200);
  const fila = doc.querySelector('[data-sesion="cmp_vm~t1"]');
  assert.ok(fila, "the VM's tasks are still there");
  fila.closest("[data-sesion]").parentElement.dispatchEvent(new app.w.PointerEvent("pointerenter", { pointerType: "mouse" }));
  await sleep(900);
  assert.ok(doc.querySelector('[data-hover-machine="cmp_vm"]')?.parentElement.textContent.includes("VM de trabajo"), "the new name shows");
  assert.equal(f.relays.cmp_vm.sockets.length, 1, "the renamed machine was not reconnected");
  assert.equal(f.relays.cmp_mac.sockets.length, 1, "nor the others");
  assert.deepEqual(app.failures, []);
});

test("with one session per account, the open workspace talks as its own account", async () => {
  const asked = [];
  const { app, native, listed, relayCalls } = await open("desktop-account-per-workspace", {
    computers: [{ ...HOME, computer_id: "cmp_home_fdb" }, { ...VM, state: "online" }],
    relays: { cmp_vm: { table: remote("Panel", "Tarea de la VM"), state: "online" } },
    token: null,
    extra: {
      danil_sessions: [SESSION_A, SESSION_B],
      danil_workspace_account: { account: "u_fdb", email: "alberto@dondebanco.org", signed_in: true, linked: true },
      account_relay_token: (args) => {
        asked.push(args?.account ?? null);
        return { ...TOKEN(), token: `tok-${args?.account ?? "default"}`, computer_id: "cmp_home_fdb" };
      },
    },
  });
  assert.ok(asked.length > 0 && asked.every((a) => a === "u_fdb"), `the client token is the workspace's account: ${asked}`);
  assert.deepEqual(listed, ["Bearer tok-u_fdb"], "its computers, not the default account's");
  assert.equal(native("danil_connect_status").length, 0, "the sessions say who this computer is");
  assert.ok(relayCalls("cmp_vm", "list_projects").length > 0, "the account's VM is in the window");
  assert.deepEqual(app.failures, []);
});

test("a workspace whose account is signed out here keeps the window local", async () => {
  const { app, f, listed } = await open("desktop-account-signed-out-workspace", {
    relays: { cmp_vm: { table: remote("Panel", "Tarea de la VM"), state: "online" } },
    extra: {
      danil_sessions: [SESSION_A],
      danil_workspace_account: { account: "u_ytw", email: "alberto@yucatantechweek.mx", signed_in: false, linked: false },
    },
  });
  assert.equal(listed.length, 0, "no other account's computers");
  assert.equal(f.relays.cmp_vm.sockets.length, 0);
  assert.ok(!app.commands.includes("account_relay_token"), "no token of another account is asked for");
  assert.deepEqual(app.failures, []);
});

// Un cambio de contrato nunca deja sin uso máquinas enteras: como el teléfono,
// solo `version_mismatch` del relay o del motor la marca desactualizada.
test("a VM whose engine speaks another contract keeps adding its tasks", async () => {
  const { app, doc, f } = await open("desktop-account-contract", {
    computers: [HOME, { ...VM, state: "online" }],
    relays: { cmp_vm: { table: remote("Panel", "Tarea de la VM"), state: "online", contract: "otro-contrato" } },
  });
  const url = new URL(f.relays.cmp_vm.sockets[0].url.replace(/^ws/, "http"));
  assert.equal(url.searchParams.get("contracts"), null, "the session does not ask the relay to gate by contract");
  assert.ok(doc.querySelector('[data-sesion="t1"]'), "this computer's tasks are there");
  f.relays.cmp_vm.hello("otro-contrato");
  await reread(app);
  assert.ok(doc.querySelector('[data-sesion="cmp_vm~t1"]'), "an engine on another contract still adds its tasks");
  assert.deepEqual(app.failures, []);
});

test("when the relay stops the sessions for lack of a Terminus license, the VM keeps its rows and nothing reconnects in a loop", async () => {
  const { app, doc, f } = await open("desktop-account-license", {
    computers: [HOME, { ...VM, state: "online" }],
    relays: { cmp_vm: { table: remote("Panel", "Tarea de la VM"), state: "online" } },
  });
  assert.ok(doc.querySelector('[data-sesion="cmp_vm~t1"]'));
  const asked = f.relays.cmp_vm.calls.length;
  f.relays.cmp_vm.drop(4003, "license_required");
  await sleep(300);
  await reread(app);
  await sleep(2_500);
  assert.equal(f.relays.cmp_vm.sockets.length, 1, "no reconnection loop");
  assert.equal(f.relays.cmp_vm.calls.length, asked, "nothing more is asked of the VM");
  assert.ok(doc.querySelector('[data-sesion="cmp_vm~t1"]'), "its rows stay");
  assert.ok(doc.querySelector('[data-sesion="t1"]'), "this computer is untouched");
  assert.deepEqual(app.failures, []);
});

test("a machine just connected to the account adds its slice live, without reconnecting the others", async () => {
  const computers = [HOME, { ...VM, state: "online" }];
  const { app, doc, f } = await open("desktop-account-connected", {
    computers,
    relays: {
      cmp_vm: { table: remote("Panel", "Tarea de la VM"), state: "online" },
      cmp_mac: { table: remote("Notas", "Tarea del Mac"), state: "online" },
    },
  });
  assert.equal(doc.querySelector('[data-sesion="cmp_mac~t1"]'), null);
  computers.push({ ...MAC, state: "online" });
  app.w.dispatchEvent(new app.w.CustomEvent("harness:account-computers"));
  await sleep(1_200);
  await reread(app);
  assert.ok(doc.querySelector('[data-sesion="cmp_mac~t1"]'), "the new machine's tasks join");
  assert.equal(f.relays.cmp_vm.sockets.length, 1, "the VM was not reconnected");
  assert.deepEqual(app.failures, []);
});
