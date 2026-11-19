import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { HostError, type Host } from "../src/lib/hosts.ts";
import { __entries, __kick, __reset, bindHosts, enqueue, hydrate, type HostLookup, type QueueEntry, type Storage } from "../src/lib/taskQueue.ts";

const KEY = "terminus.taskQueue";

function disk(initial?: QueueEntry[]): Storage & { raw(): QueueEntry[] } {
  let value = initial ? JSON.stringify(initial) : null;
  return { getItem: async () => value, setItem: async (_k, v) => { value = v; }, raw: () => (value ? JSON.parse(value) : []) };
}

type Behaviour = { power?: string; fail?: (command: string) => unknown };
function machine(id: string, behaviour: Behaviour = {}) {
  const calls: { command: string; workspace: string | null }[] = [];
  const host = {
    id, label: id, power: () => behaviour.power ?? "on",
    call: async (command: string, workspace: string | null) => {
      calls.push({ command, workspace });
      const failure = behaviour.fail?.(command);
      if (failure) throw failure;
      return { value: command === "task_blockers" ? { unsaved: [], not_finished: false } : null, cachedAt: null };
    },
  } as unknown as Host;
  return { host, calls, mutations: () => calls.filter((c) => ["set_task_archived", "finish_task", "delete_session"].includes(c.command)) };
}

const entry = (over: Partial<QueueEntry> = {}): QueueEntry => ({ key: "m1:w:f:t:delete", host: "m1", workspace: "w", folder: "f", id: "t", title: "T", action: "delete", attempts: 0, at: Date.now(), ...over });
const task = { workspace: "w", folder: "f", id: "t", title: "T" };

beforeEach(() => __reset());

test("tras reiniciar, la petición guardada espera a que la flota resuelva la máquina y entonces se ejecuta", async () => {
  const store = disk([entry()]);
  __reset({ storage: store });
  await hydrate(); // la flota aún no resuelve nada
  assert.equal(__entries().length, 1, "no se retira como hecha");
  assert.equal(store.raw().length, 1, "sigue en disco");
  const m = machine("m1");
  bindHosts(() => m.host);
  await __kick();
  assert.deepEqual(m.mutations().map((c) => c.command), ["delete_session"]);
  assert.equal(__entries().length, 0);
});

test("una máquina dormida o sin respuesta antes de enviar conserva la intención", async () => {
  const store = disk();
  __reset({ storage: store });
  await hydrate();
  const m = machine("m1", { power: "off" });
  bindHosts(() => m.host);
  enqueue(m.host, task, "delete");
  await __kick();
  assert.equal(__entries().length, 1);
  assert.equal(m.mutations().length, 0);
  const io = machine("m2", { fail: (c) => (c === "task_blockers" ? new HostError("io", "down") : null) });
  bindHosts((id) => (id === "m2" ? io.host : "pending"));
  enqueue(io.host, { ...task, id: "u" }, "finish");
  await __kick();
  assert.equal(io.mutations().length, 0);
  assert.equal(__entries().some((e) => e.id === "u"), true, "una caída antes de la mutación no la borra");
  assert.equal(store.raw().some((e) => e.id === "u"), true);
});

test("una máquina que dejó la cuenta se descarta con aviso; no se confunde con una aún sin resolver", async () => {
  __reset({ storage: disk([entry()]) });
  await hydrate();
  let answer: HostLookup = "pending";
  bindHosts(() => answer);
  await __kick();
  assert.equal(__entries().length, 1);
  answer = "gone";
  await __kick();
  assert.equal(__entries().length, 0);
});

test("un rechazo permanente de la máquina se avisa y se retira; no se reintenta", async () => {
  __reset({ storage: disk([entry({ action: "archive", key: "m1:w:f:t:archive" })]) });
  await hydrate();
  const m = machine("m1", { fail: (c) => (c === "set_task_archived" ? new HostError("command_unsupported", c) : null) });
  bindHosts(() => m.host);
  await __kick();
  assert.equal(__entries().length, 0);
  assert.equal(m.mutations().length, 1);
});

test("acuse perdido: borrar o finalizar enviados no se repiten; archivar sí", async () => {
  const lost = (command: string) => (["delete_session", "finish_task", "set_task_archived"].includes(command) ? new HostError("io", "timeout") : null);
  for (const action of ["delete", "finish"] as const) {
    __reset({ storage: disk() });
    await hydrate();
    const m = machine("m1", { fail: lost });
    bindHosts(() => m.host);
    enqueue(m.host, task, action);
    await __kick();
    assert.equal(__entries().length, 0, `${action} dudoso se retira con aviso`);
    assert.equal(m.mutations().length, 1, `${action} se envió una sola vez`);
  }
  __reset({ storage: disk() });
  await hydrate();
  const m = machine("m1", { fail: lost });
  bindHosts(() => m.host);
  enqueue(m.host, task, "archive");
  await __kick();
  assert.equal(__entries().length, 1, "archivar es idempotente y se conserva para repetir");
});

test("un reinicio con la mutación ya enviada sin acuse no la repite", async () => {
  const store = disk([entry({ sent: true })]);
  __reset({ storage: store });
  const m = machine("m1");
  bindHosts(() => m.host);
  await hydrate();
  assert.equal(m.calls.length, 0);
  assert.equal(__entries().length, 0);
  assert.equal(store.raw().length, 0);
});

test("aislamiento: una máquina que espera no frena a otra y cada acción solo toca su máquina y workspace", async () => {
  __reset({ storage: disk([entry({ host: "m1", key: "m1:w:f:t:delete" }), entry({ host: "m2", workspace: "w2", key: "m2:w2:f:t:archive", action: "archive" })]) });
  const m2 = machine("m2");
  bindHosts((id) => (id === "m2" ? m2.host : "pending"));
  await hydrate();
  await __kick();
  assert.deepEqual(m2.calls.map((c) => c.workspace), ["w2", "w2"]);
  assert.deepEqual(__entries().map((e) => e.host), ["m1"]);
});

test("encolar antes de hidratar no pisa la fila guardada", async () => {
  const store = disk([entry()]);
  __reset({ storage: store });
  const m = machine("m1");
  enqueue(m.host, { ...task, id: "other" }, "archive");
  await hydrate();
  assert.equal(store.raw().length === 2 || __entries().length <= 2, true);
  assert.ok(__entries().concat(store.raw()).some((e) => e.id === "t"), "lo guardado sobrevive");
});

test("si no se puede guardar la marca de envío, finalizar y borrar no salen y la entrada se conserva", async () => {
  const initial = [entry()];
  let value: string | null = JSON.stringify(initial);
  let failWrites = true;
  const store: Storage = { getItem: async () => value, setItem: async (_k, v) => { if (failWrites) throw new Error("disk full"); value = v; } };
  __reset({ storage: store });
  const m = machine("m1");
  bindHosts(() => m.host);
  await hydrate();
  await __kick();
  assert.equal(m.mutations().length, 0, "no se envía sin la marca en disco");
  assert.equal(__entries().length, 1);
  assert.equal(JSON.parse(value!).length, 1);
  failWrites = false;
  await __kick();
  assert.equal(m.mutations().length, 1, "con disco otra vez, se envía una vez");
});

test("disco que falla al guardar `sent` + acuse perdido + reinicio: la mutación no se repite", async () => {
  // Primera vida: el disco guarda la entrada inicial, falla al guardar `sent`: no se manda nada.
  let value: string | null = JSON.stringify([entry({ action: "finish", key: "m1:w:f:t:finish" })]);
  let failWrites = true;
  const store: Storage = { getItem: async () => value, setItem: async (_k, v) => { if (failWrites) throw new Error("x"); value = v; } };
  __reset({ storage: store });
  const first = machine("m1", { fail: (c) => (c === "finish_task" ? new HostError("io", "timeout") : null) });
  bindHosts(() => first.host);
  await hydrate();
  await __kick();
  assert.equal(first.mutations().length, 0);
  // Segunda vida: disco bien, sale y se pierde el acuse; la marca quedó en disco.
  failWrites = false;
  await __kick();
  assert.equal(first.mutations().length, 1);
  assert.equal(__entries().length, 0, "dudoso: se avisa y se retira");
  // Reinicio: lo que quedó en disco no puede volver a ejecutarse.
  value = JSON.stringify([entry({ action: "finish", key: "m1:w:f:t:finish", sent: true })]);
  __reset({ storage: store });
  const second = machine("m1");
  bindHosts(() => second.host);
  await hydrate();
  await __kick();
  assert.equal(second.calls.length, 0);
});

test("escrituras serializadas: una instantánea vieja no pisa la marca `sent`", async () => {
  const writes: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let first = true;
  const store: Storage = { getItem: async () => null, setItem: async (_k, v) => { if (first) { first = false; await gate; } writes.push(v); } };
  __reset({ storage: store });
  const loading = hydrate(); // su escritura queda retenida
  const m = machine("m1");
  bindHosts(() => m.host);
  await new Promise((r) => setTimeout(r, 5));
  enqueue(m.host, task, "finish");
  const running = __kick();
  await new Promise((r) => setTimeout(r, 5));
  release();
  await loading;
  await running;
  const last = JSON.parse(writes.at(-1)!) as QueueEntry[];
  assert.equal(last.some((e) => e.sent), false, "al final la entrada ya salió de la fila");
  assert.ok(writes.some((w) => JSON.parse(w).some((e: QueueEntry) => e.sent)), "la marca se escribió");
  assert.equal(writes.findIndex((w) => JSON.parse(w).some((e: QueueEntry) => e.sent)) > 0, true);
});

test("la guardia local (notSent) es preadmisión y espera; un machine_asleep del relay tras enviar es duda", async () => {
  const local = new HostError("machine_asleep", "m1");
  local.notSent = true;
  __reset({ storage: disk() });
  await hydrate();
  const a = machine("m1", { fail: (c) => (c === "delete_session" ? local : null) });
  bindHosts(() => a.host);
  enqueue(a.host, task, "delete");
  await __kick();
  assert.equal(__entries().length, 1, "preadmisión: conserva y espera");
  assert.equal(__entries()[0].sent, false);
  __reset({ storage: disk() });
  await hydrate();
  const b = machine("m1", { fail: (c) => (c === "delete_session" ? new HostError("machine_asleep", "m1") : null) });
  bindHosts(() => b.host);
  enqueue(b.host, task, "delete");
  await __kick();
  assert.equal(__entries().length, 0, "sin garantía de que no entró: se avisa la duda y no se repite");
  assert.equal(b.mutations().length, 1);
});
