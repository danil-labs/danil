import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { HostError, type Host } from "../src/lib/hosts.ts";
import { __entries, __kick, __reset, bindHosts, clearError, enqueue, hydrate, setAccount, subscribe, type HostLookup, type QueueEntry, type QueueState, type Storage } from "../src/lib/taskQueue.ts";
import { GONE_AFTER_MS, createResolver } from "../src/lib/taskQueueHosts.ts";

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
  const seen: QueueState[] = [];
  subscribe((state) => seen.push(state));
  answer = "gone";
  await __kick();
  assert.equal(__entries().length, 0);
  assert.equal(seen.at(-1)?.notices.length, 1, "se avisa");
  assert.match(seen.at(-1)!.notices[0], /task\.queue\.gone/);
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
  assert.deepEqual(__entries().map((e) => e.id).sort(), ["other", "t"].sort(), "lo guardado y lo nuevo conviven en memoria");
  assert.deepEqual(store.raw().map((e) => e.id).sort(), ["other", "t"].sort(), "y en disco");
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
  const sentAt = writes.findIndex((w) => JSON.parse(w).some((e: QueueEntry) => e.sent));
  assert.ok(sentAt >= 0, "la marca se escribió");
  assert.equal(m.mutations().length, 1);
  // Ninguna escritura posterior a la marca vuelve a escribir la entrada sin ella mientras la entrada siga en la fila.
  for (const w of writes.slice(sentAt)) for (const e of JSON.parse(w) as QueueEntry[]) assert.equal(e.sent, true);
  assert.equal((JSON.parse(writes.at(-1)!) as QueueEntry[]).length, 0, "al final salió de la fila");
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

test("una lectura fallida del disco no borra lo guardado: se vuelve a leer", async () => {
  let reads = 0;
  let value: string | null = JSON.stringify([entry()]);
  const writes: string[] = [];
  const store: Storage = { getItem: async () => { if (reads++ === 0) throw new Error("transient"); return value; }, setItem: async (_k, v) => { writes.push(v); value = v; } };
  __reset({ storage: store });
  const m = machine("m1");
  bindHosts(() => m.host);
  await hydrate();
  assert.deepEqual(writes, [], "no se escribe nada encima");
  assert.equal(m.calls.length, 0);
  await hydrate(); // la relectura
  await __kick();
  assert.deepEqual(m.mutations().map((c) => c.command), ["delete_session"], "lo guardado sobrevivió");
});

test("contenido ilegible se guarda aparte antes de seguir", async () => {
  const written: Record<string, string> = {};
  const store: Storage = { getItem: async () => "{no es json", setItem: async (k, v) => { written[k] = v; } };
  __reset({ storage: store });
  await hydrate();
  assert.deepEqual(Object.entries(written).filter(([k]) => k.startsWith("terminus.taskQueue.unreadable.")).map(([, v]) => v), ["{no es json"]);
});

test("todos los avisos se conservan hasta cerrarlos", async () => {
  __reset({ storage: disk([entry({ sent: true }), entry({ sent: true, id: "u", key: "m1:w:f:u:finish", action: "finish", title: "U" })]) });
  let last: QueueState | null = null;
  subscribe((state) => (last = state));
  await hydrate();
  assert.equal(last!.notices.length, 2);
  clearError();
  assert.equal(last!.notices.length, 0);
});

test("la guardia local espera siempre, también con machine_off, antes o después de enviar", async () => {
  for (const code of ["machine_off", "machine_outdated", "machine_asleep"]) {
    const refused = new HostError(code, "m1");
    refused.notSent = true;
    __reset({ storage: disk() });
    await hydrate();
    const m = machine("m1", { fail: (c) => (c === "task_blockers" ? refused : null) });
    bindHosts(() => m.host);
    enqueue(m.host, task, "finish");
    await __kick();
    assert.equal(__entries().length, 1, code);
    assert.equal(m.mutations().length, 0, code);
  }
});

test("una caída de red antes de enviar espera con pausa: no se reintenta en cada cambio de la flota", async () => {
  __reset({ storage: disk() });
  await hydrate();
  const m = machine("m1", { fail: (c) => (c === "task_blockers" ? new HostError("io", "down") : null) });
  bindHosts(() => m.host);
  enqueue(m.host, task, "finish");
  await __kick();
  for (let i = 0; i < 5; i++) { bindHosts(() => m.host); await __kick(); }
  assert.equal(m.calls.filter((c) => c.command === "task_blockers").length, 1);
  assert.equal(__entries().length, 1);
});

test("un error inesperado antes de enviar se avisa y se retira; no espera para siempre", async () => {
  __reset({ storage: disk() });
  await hydrate();
  const m = machine("m1", { fail: (c) => (c === "task_blockers" ? new TypeError("bug") : null) });
  bindHosts(() => m.host);
  enqueue(m.host, task, "finish");
  await __kick();
  assert.equal(__entries().length, 0);
});

test("una entrada de otra cuenta espera sin llamadas ni avisos; una sin dueño la reclama quien inicia sesión y queda guardada", async () => {
  const store = disk([entry({ owner: "ana" }), entry({ id: "legacy", key: "m1:w:f:legacy:delete" })]);
  __reset({ storage: store });
  let now = 0;
  const resolver = createResolver(() => now);
  let notices = 0;
  subscribe((state) => (notices = state.notices.length));
  await hydrate();
  const m = machine("m1");
  const view = (user: string, hostOf: (id: string) => Host | undefined) => ({ hostOf, user, fleet: "ok", contextReady: true });
  bindHosts(resolver(view("beto", () => undefined)));
  now += GONE_AFTER_MS * 3;
  bindHosts(resolver(view("beto", () => undefined)));
  await __kick();
  assert.equal(m.calls.length, 0);
  assert.equal(notices, 0);
  assert.equal(__entries().length, 2, "ninguna se da por perdida");
  setAccount("ana");
  await __kick();
  assert.equal(store.raw().find((e) => e.id === "legacy")?.owner, "ana", "el dueño quedó en disco");
  bindHosts(resolver(view("ana", (id) => (id === "m1" ? m.host : undefined))));
  await __kick();
  assert.equal(m.mutations().length, 2, "con su cuenta, sí se ejecutan");
});

test("los fallos pasajeros esperan y no descartan; el archivado enviado repite sin tope al pasar la pausa", async () => {
  for (const code of ["machine_timeout", "machine_off", "start_failed", "start_timeout", "unreachable", "unknown_machine"]) {
    __reset({ storage: disk() });
    await hydrate();
    const m = machine("m1", { fail: (c) => (c === "task_blockers" ? new HostError(code) : null) });
    bindHosts(() => m.host);
    enqueue(m.host, task, "finish");
    await __kick();
    assert.equal(__entries().length, 1, code);
    assert.equal(m.mutations().length, 0, code);

    let now = 1_000;
    __reset({ storage: disk(), now: () => now });
    await hydrate();
    const a = machine("m1", { fail: (c) => (c === "set_task_archived" ? new HostError(code) : null) });
    bindHosts(() => a.host);
    enqueue(a.host, task, "archive");
    for (let i = 0; i < 6; i++) { await __kick(); now += 31_000; }
    assert.equal(a.mutations().length, 6, `${code}: un intento por pausa, sin tope`);
    assert.equal(__entries().length, 1, `${code} archivar`);
    assert.equal(__entries()[0].attempts, 0, `${code}: no cuenta contra el tope`);
  }
});

test("un rechazo por regla o un código ajeno antes de enviar se avisa y se retira", async () => {
  for (const code of ["command_unsupported", "algo_raro"]) {
    __reset({ storage: disk() });
    let notices: string[] = [];
    subscribe((state) => (notices = state.notices));
    await hydrate();
    const m = machine("m1", { fail: (c) => (c === "task_blockers" ? new HostError(code) : null) });
    bindHosts(() => m.host);
    enqueue(m.host, task, "finish");
    await __kick();
    assert.equal(__entries().length, 0, code);
    assert.equal(notices.length, 1, `${code} avisa`);
    assert.match(notices[0], /task\.error/);
  }
});

test("una entrada de otra cuenta espera; una sin dueño la reclama solo la cuenta cuya flota tiene su máquina", async () => {
  const store = disk([entry({ owner: "ana" }), entry({ id: "legacy", key: "m1:w:f:legacy:delete" })]);
  __reset({ storage: store });
  let now = 0;
  const resolver = createResolver(() => now);
  let notices = 0;
  subscribe((state) => (notices = state.notices.length));
  await hydrate();
  const m = machine("m1");
  const view = (user: string, hostOf: (id: string) => Host | undefined) => ({ hostOf, user, fleet: "ok", contextReady: true });
  // Beto inicia sesión: su flota no tiene m1. No reclama nada y nada se da por perdido.
  setAccount("beto", () => false);
  for (let i = 0; i < 3; i++) { bindHosts(resolver(view("beto", () => undefined))); now += GONE_AFTER_MS * 2; await __kick(); }
  assert.equal(notices, 0);
  assert.equal(__entries().length, 2);
  assert.equal(__entries().find((e) => e.id === "legacy")?.owner, undefined, "nadie la reclamó");
  // Ana: su flota tiene m1, la reclama y se guarda.
  setAccount("ana", (host) => host === "m1");
  assert.equal(__entries().find((e) => e.id === "legacy")?.owner, "ana");
  bindHosts(resolver(view("ana", (id) => (id === "m1" ? m.host : undefined))));
  await __kick();
  assert.equal(store.raw().length, 0, "con su cuenta se ejecutan y salen");
  assert.equal(m.mutations().length, 2);
});

test("al cambiar de cuenta se limpian los avisos de la anterior", async () => {
  __reset({ storage: disk([entry({ sent: true, owner: "ana" })]) });
  let notices: string[] = [];
  subscribe((state) => (notices = state.notices));
  setAccount("ana");
  await hydrate();
  assert.equal(notices.length, 1);
  setAccount("beto");
  assert.equal(notices.length, 0);
});

test("«gone» pide sesión, la flota cargada de esa cuenta y faltar un rato seguido; el bridge no", () => {
  const base = { hostOf: () => undefined, user: "ana", fleet: "ok", contextReady: true };
  let now = 1000;
  const resolver = createResolver(() => now);
  assert.equal(resolver({ ...base, user: null })("m1", "ana"), "pending", "sin sesión");
  assert.equal(resolver({ ...base, fleet: "loading" })("m1", "ana"), "pending", "flota cargando");
  assert.equal(resolver({ ...base, contextReady: false })("m1", "ana"), "pending", "contexto sin listo");
  assert.equal(resolver(base)("bridge", "ana"), "pending", "el bridge depende del emparejamiento");
  assert.equal(resolver(base)("m1", undefined), "pending", "sin dueño nunca es gone");
  assert.equal(resolver(base)("m1", "ana"), "pending", "recién faltó");
  now += GONE_AFTER_MS;
  assert.equal(resolver(base)("m1", "ana"), "gone");
  const host = { id: "m1" } as Host;
  assert.equal(resolver({ ...base, hostOf: () => host })("m1", "ana"), host, "si vuelve, se usa");
  now += 1;
  assert.equal(resolver(base)("m1", "ana"), "pending", "el reloj de la ausencia se reinicia");
});

test("una sesión que se anula un instante no borra los avisos; otra cuenta sí", async () => {
  __reset({ storage: disk([entry({ sent: true, owner: "ana" })]) });
  let notices: string[] = [];
  subscribe((state) => (notices = state.notices));
  setAccount("ana");
  await hydrate();
  setAccount(null);
  setAccount("ana");
  assert.equal(notices.length, 1);
});
