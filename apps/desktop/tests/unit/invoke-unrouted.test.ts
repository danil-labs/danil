/**
 * Sin ruta (`setMachineRoute(null)`, p. ej. en medio de un cambio de cuenta),
 * un IPC que no reparte por máquina (el motor de la ventana) ignoraría
 * `x-terminus-machine`: una orden para otra máquina se rechaza con su motivo y
 * nunca le llega. El que reparte (el router de la web) lo declara con
 * `routesMachines: true` y la cabecera pasa. Sin la marca, no reparte.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const native: { command: string; options: unknown }[] = [];
const target = globalThis as unknown as { window: unknown; __TAURI_INTERNALS__: unknown };
target.window = globalThis;
target.__TAURI_INTERNALS__ = {
  invoke: (command: string, _args: unknown, options: unknown) => {
    native.push({ command, options });
    return Promise.resolve("ok");
  },
  transformCallback: () => 0,
};

const { invoke, setMachineRoute } = await import("../../src/lib/invoke.ts");
const { capabilities, setCapabilities } = await import("../../src/lib/platform.ts");
const desktop = capabilities();
const internals = target.__TAURI_INTERNALS__ as { routesMachines?: unknown };
const on = (machine: string) => ({ headers: { "x-terminus-machine": machine } });

test("6. Without a route, an order for a VM fails as machine_off and the window's engine never gets it", async () => {
  setMachineRoute(null);
  native.length = 0;
  await assert.rejects(invoke("send_message", { message: "hola" }, on("lima:x")), (e: { code?: string; detail?: string }) => e.code === "machine_off" && e.detail === "lima:x");
  await assert.rejects(invoke("send_message", {}, on("wsl:Ubuntu")), (e: { code?: string }) => e.code === "machine_off");
  await assert.rejects(invoke("send_message", {}, on("cmp_vm")), (e: { code?: string }) => e.code === "unknown_machine");
  assert.deepEqual(native, [], "nothing reached the native IPC");
});

test("6b. Without a route, this computer's own orders still go to the window's engine", async () => {
  setMachineRoute(null);
  native.length = 0;
  assert.equal(await invoke("list_projects", {}), "ok");
  assert.equal(await invoke("list_projects", {}, on("local")), "ok");
  assert.deepEqual(native.map((c) => c.command), ["list_projects", "list_projects"]);
});

test("6c. An IPC that routes by machine (the web router) gets the call with its header, with a null route", async () => {
  setMachineRoute(null);
  internals.routesMachines = true;
  native.length = 0;
  try {
    assert.equal(await invoke("send_message", { message: "hola" }, on("cmp_vm")), "ok");
    assert.equal(await invoke("list_projects", {}, on("lima:x")), "ok");
    assert.deepEqual(native.map((c) => c.command), ["send_message", "list_projects"]);
  } finally {
    delete internals.routesMachines;
  }
});

test("6d. Without the mark an IPC does not route: a guest header never reaches it, whatever else says the window is", async () => {
  setMachineRoute(null);
  native.length = 0;
  for (const mark of [undefined, false, "yes", 1]) {
    if (mark === undefined) delete internals.routesMachines;
    else internals.routesMachines = mark;
    await assert.rejects(invoke("send_message", {}, on("lima:x")), (e: { code?: string }) => e.code === "machine_off", String(mark));
  }
  delete internals.routesMachines;
  // Ni una ventana que diga no ser la nativa lo cambia: la marca es del IPC.
  setCapabilities({ ...desktop, nativeWindow: false });
  try {
    await assert.rejects(invoke("send_message", {}, on("wsl:Ubuntu")), (e: { code?: string }) => e.code === "machine_off");
  } finally {
    setCapabilities(desktop);
  }
  assert.deepEqual(native, [], "nothing reached the IPC");
});
