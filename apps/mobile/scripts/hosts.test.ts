/**
 * Las computadoras del teléfono sobre la flota compartida (`accountFleet` en
 * `src/lib/hosts.ts`, `@terminus/fleet`) con sockets falsos: los eventos de un
 * workspace no vinculado no llegan, una máquina apagada con copia no se
 * pregunta, un mensaje a la VM
 * apagada la enciende y se entrega, y la Mac apagada lo dice con su nombre.
 *
 *   node --test apps/mobile/scripts/hosts.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Computer, SocketLike } from "@terminus/computers";
import type { EngineEvent } from "@terminus/protocol";
import { loadTask } from "../src/lib/engine.ts";
import type { Host } from "../src/lib/hosts.ts";
import { HostError, accountFleet } from "../src/lib/hosts.ts";

type Reply = (call: { id: string; command: string; args: Record<string, unknown> }) => unknown;

/** Un relay por computadora: contesta `call` con `reply` (o nada, si devuelve `undefined`). */
class FakeSocket implements SocketLike {
  static all: FakeSocket[] = [];
  static replies = new Map<string, Reply>();
  readyState = 0;
  computer: string;
  sent: { type: string; id?: string; command?: string; args?: Record<string, unknown> }[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number; reason?: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(url: string) {
    this.computer = decodeURIComponent(/\/v1\/computers\/([^/]+)\/session/.exec(url)?.[1] ?? "");
    FakeSocket.all.push(this);
  }
  open(state: string) {
    this.readyState = 1;
    this.onopen?.({});
    this.push({ type: "state", state });
  }
  push(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  send(data: string) {
    const m = JSON.parse(data);
    this.sent.push(m);
    if (m.type !== "call") return;
    const answer = FakeSocket.replies.get(this.computer)?.(m);
    if (answer !== undefined) setTimeout(() => this.push({ type: "result", id: m.id, ...(answer as object) }), 0);
  }
  close(code = 1000, reason?: string) {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const socketOf = (id: string) => FakeSocket.all.filter((s) => s.computer === id).at(-1) as FakeSocket;
const calls = (id: string, command: string) => FakeSocket.all.filter((s) => s.computer === id).flatMap((s) => s.sent).filter((m) => m.type === "call" && m.command === command);

const VM = { computer_id: "cmp_vm", name: "VM", state: "offline", provider: "aws-ec2", workspaces: ["w1"] } as Computer;
const MAC = { computer_id: "cmp_mac", name: "Mac de Ana", state: "offline", provider: "self", kind: "physical", workspaces: ["w1"] } as Computer;

/** Una memoria como `localStorage`, para lo guardado de cada máquina. */
function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

async function start(computers: Computer[], options: { storage?: ReturnType<typeof memory>; wake?: (id: string) => Promise<boolean> } = {}) {
  const machines = accountFleet({ endpoint: "https://computers.example", getToken: () => "jwt", storage: options.storage ?? null, wake: options.wake }, (url) => new FakeSocket(url));
  const hosts = machines.set(computers);
  await sleep(0);
  return { machines, hosts, byId: (id: string) => hosts.find((h) => h.id === id)! };
}

test("el teléfono filtra los eventos por el workspace del payload, como la ventana", async () => {
  const { machines, byId } = await start([{ ...VM, state: "online" }]);
  const seen: EngineEvent[] = [];
  byId("cmp_vm").onEvents((events) => seen.push(...events));
  socketOf("cmp_vm").open("online");
  const events = [
    { name: "chat", payload: { kind: "delta", workspace: "w1", session: "a" } },
    { name: "chat", payload: { kind: "delta", workspace: "w2", session: "b" } },
    { name: "session", workspace: "w2", payload: { session: "c" } },
    { name: "attention", payload: [{ workspace: "w1", tasks: [] }, { workspace: "w2", tasks: [{ session: "b", project: "", state: "asked" }] }] },
  ];
  socketOf("cmp_vm").push({ type: "events", cursor: 1, gap: false, replay: false, runtime: "rt", events });
  assert.deepEqual(seen, [events[0], { name: "attention", payload: [{ workspace: "w1", tasks: [] }] }], "con los ids de su máquina, sin prefijo");
  machines.close();
});

test("una máquina apagada con copia guardada contesta de la copia sin preguntar", async () => {
  const storage = memory();
  FakeSocket.replies.set("cmp_vm", ({ command }) => (command === "list_projects" ? { value: [{ id: "p1", name: "P1" }] } : undefined));
  const first = await start([{ ...VM, state: "online" }], { storage });
  socketOf("cmp_vm").open("online");
  const live = await first.byId("cmp_vm").call("list_projects", "w1", {});
  assert.deepEqual(live, { value: [{ id: "p1", name: "P1" }], cachedAt: null });
  first.machines.close();

  // Otra apertura con la VM apagada: lo guardado sale ya, sin mandar nada.
  const before = calls("cmp_vm", "list_projects").length;
  const again = await start([VM], { storage });
  const saved = await again.byId("cmp_vm").call("list_projects", "w1", {});
  assert.deepEqual(saved.value, [{ id: "p1", name: "P1" }]);
  assert.ok(saved.cachedAt !== null, "dice que es una copia, con su hora");
  assert.equal(calls("cmp_vm", "list_projects").length, before, "no se le preguntó");
  again.machines.close();
});

test("un mensaje a la VM apagada la enciende el relay y se entrega; a la Mac apagada no se manda y dice su nombre", async () => {
  FakeSocket.replies.set("cmp_vm", ({ command }) => {
    if (command !== "send_message") return undefined;
    // Como el relay: un intent enciende la VM y se entrega con su `hello`.
    setTimeout(() => socketOf("cmp_vm").push({ type: "state", state: "online" }), 5);
    return { value: "t9" };
  });
  FakeSocket.replies.set("cmp_mac", () => ({ error: { code: "not_remotely_startable" } }));
  const { machines, byId } = await start([VM, MAC]);
  socketOf("cmp_vm").open("offline");
  socketOf("cmp_mac").open("offline");
  const sent = await byId("cmp_vm").call("send_message", "w1", { project: "p1", session: null, prompt: "hola" });
  assert.equal(sent.value, "t9");
  assert.equal(calls("cmp_vm", "send_message").length, 1);

  await assert.rejects(byId("cmp_mac").call("send_message", "w1", { project: "p1", session: "t1", prompt: "hola" }), (e: HostError) => e.code === "machine_asleep" && e.message.includes("Mac de Ana") && e.notSent === undefined);
  assert.equal(calls("cmp_mac", "send_message").length, 0, "a una máquina propia apagada ni se manda");
  await assert.rejects(byId("cmp_mac").call("mark_task_seen", "w1", { session: "t1" }), (e: HostError) => e.code === "machine_asleep" && e.notSent === true);
  machines.close();
});

test("una máquina de otro contrato sale desactualizada y no recibe acciones", async () => {
  FakeSocket.replies.set("cmp_vm", () => ({ error: { code: "version_mismatch" } }));
  const { machines, byId } = await start([{ ...VM, state: "online" }]);
  socketOf("cmp_vm").open("online");
  await assert.rejects(byId("cmp_vm").call("list_projects", "w1", {}), (e: HostError) => e.code === "machine_outdated");
  assert.equal(byId("cmp_vm").canAct(), "outdated");
  await assert.rejects(byId("cmp_vm").call("send_message", "w1", { prompt: "hola" }), (e: HostError) => e.code === "machine_outdated");
  machines.close();
});

test("altas y bajas de máquinas se aplican en vivo, sin reabrir las demás", async () => {
  const { machines } = await start([VM]);
  const vmSocket = socketOf("cmp_vm");
  const hosts = machines.set([VM, MAC]);
  assert.deepEqual(hosts.map((h) => h.id), ["cmp_vm", "cmp_mac"]);
  assert.equal(socketOf("cmp_vm"), vmSocket, "la VM sigue con su sesión");
  machines.set([MAC]);
  assert.equal(vmSocket.readyState, 3, "la que se fue se cierra");
  machines.close();
});

test("sin Terminus de pago el relay detiene la sesión: la flota lo dice y «Reintentar» la reabre", async () => {
  const { machines } = await start([{ ...VM, state: "online" }]);
  socketOf("cmp_vm").open("online");
  assert.equal(machines.license(), null);
  const before = FakeSocket.all.filter((s) => s.computer === "cmp_vm").length;
  socketOf("cmp_vm").close(4003, "license_required");
  await sleep(10);
  assert.equal(machines.license(), "license_required");
  // Detenida: no reintenta sola en bucle.
  assert.equal(FakeSocket.all.filter((s) => s.computer === "cmp_vm").length, before);
  machines.retry();
  await sleep(0);
  assert.equal(machines.license(), null);
  assert.equal(FakeSocket.all.filter((s) => s.computer === "cmp_vm").length, before + 1);
  machines.close();
});

test("una lista de turnos guardada no deja en cola los mensajes a una VM apagada", async () => {
  let on = false;
  const host = {
    power: () => on ? "on" : "off",
    async call(command: string) {
      const value = command === "list_active_turns" ? ["task"] : command === "load_session" ? { id: "task", turns: [] } : null;
      return { value, cachedAt: on ? null : 1234567890000 };
    },
  } as unknown as Host;
  const cached = await loadTask(host, "w", "p", "task");
  assert.equal(cached.running, false, "el mensaje debe enviarse al relay para encender la VM");
  on = true;
  assert.equal((await loadTask(host, "w", "p", "task")).running, true);
});

test("un motor anterior que no conoce un comando de la UI nueva: error claro, se oculta esa función y la máquina sigue", async () => {
  FakeSocket.replies.set("cmp_vm", ({ command }) => {
    if (command === "list_ports") return { error: { code: "command", detail: "list_ports" } };
    if (command === "set_keep_awake") return { error: { code: "command_failed", detail: { what: { clave: "shell.service.command" }, detail: "set_keep_awake" } } };
    if (command === "keep_awake_status") return { value: { mode: "agent", active: false, supported: true } };
    if (command === "list_projects") return { value: [] };
    return undefined;
  });
  const { machines, byId } = await start([{ ...VM, state: "online" }]);
  socketOf("cmp_vm").open("online");
  const vm = byId("cmp_vm");
  let changes = 0;
  vm.onChange(() => changes++);
  assert.equal(vm.available?.("ports"), "unknown");
  await assert.rejects(vm.call("list_ports", "w1", {}), (e: HostError) => e.code === "command_unsupported" && e.detail === "list_ports");
  assert.equal(vm.available?.("ports"), "no");
  assert.ok(changes > 0, "la UI se entera y la oculta");
  assert.deepEqual((await vm.call("keep_awake_status", "w1", {})).value, { mode: "agent", active: false, supported: true });
  assert.equal(vm.available?.("keep_awake"), "yes");
  await assert.rejects(vm.call("set_keep_awake", "w1", { mode: "on" }), (e: HostError) => e.code === "command_unsupported");
  assert.equal(vm.available?.("keep_awake"), "no", "si rechaza cambiarlo, tampoco se enseña");
  assert.deepEqual((await vm.call("list_projects", "w1", {})).value, [], "la máquina sigue en servicio");
  assert.notEqual(vm.canAct(), "outdated");
  machines.close();
});

test("crear, renombrar y eliminar espacios y cambiar Mantener despierta encienden antes la VM; leer puertos o archivadas no", async () => {
  const woken: string[] = [];
  FakeSocket.replies.set("cmp_vm", ({ command, args }) => {
    if (command === "create_space") return { value: { id: "s9", name: args.name, folders: [] } };
    return { error: { code: "machine_off" } };
  });
  const { machines, byId } = await start([VM], {
    wake: async (id) => {
      woken.push(id);
      setTimeout(() => socketOf("cmp_vm").push({ type: "state", state: "online" }), 5);
      return true;
    },
  });
  socketOf("cmp_vm").open("offline");
  const vm = byId("cmp_vm");
  await assert.rejects(vm.call("list_ports", "w1", {}), (e: HostError) => e.code === "machine_off" && e.notSent === undefined);
  await assert.rejects(vm.call("archived_tasks", "w1", {}), (e: HostError) => e.code === "machine_off");
  assert.deepEqual(woken, [], "leer no enciende");
  assert.equal(vm.available?.("ports"), "unknown", "apagada no dice si lo conoce");
  const made = await vm.call<{ id: string }>("create_space", "w1", { name: "Pagos" });
  assert.equal(made.value.id, "s9");
  assert.deepEqual(woken, ["cmp_vm"]);
  machines.close();
});

test("set_keep_awake desde una sesión que no es la de la máquina: command_not_here, sin ocultar Mantener despierta", async () => {
  FakeSocket.replies.set("cmp_vm", ({ command }) => {
    if (command === "keep_awake_status") return { value: { mode: "agent", active: false, supported: true } };
    if (command === "set_keep_awake") return { error: { code: "command_not_allowed", detail: { command: "set_keep_awake", scope: "machine" } } };
    return undefined;
  });
  const { machines, byId } = await start([{ ...VM, state: "online" }]);
  socketOf("cmp_vm").open("online");
  const vm = byId("cmp_vm");
  await vm.call("keep_awake_status", "w1", {});
  await assert.rejects(vm.call("set_keep_awake", "w1", { mode: "on" }), (e: HostError) => e.code === "command_not_here" && e.detail === "set_keep_awake");
  assert.equal(vm.available?.("keep_awake"), "yes");
  machines.close();
});
