/**
 * Llevar trabajo entre máquinas (`packages/carry`) contra dos motores falsos:
 * el origen exporta un archivo, el cliente lo copia por partes y el destino lo
 * importa. Se comprueba lo que la hoja promete: reintentar sigue desde la parte
 * que falló, la base que falta pide el bundle completo, un proyecto que falta
 * se clona antes de importar y cancelar borra en las dos máquinas.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  type CarryEngine,
  type CarryProgress,
  CarryError,
  PART_ATTEMPTS,
  cancelCarry,
  carryWork,
  initialSelection,
  needsSheet,
  newState,
  sizeVerdict,
  type WorkStatus,
  bringBranch,
  bringSelection,
  keyVerdict,
  withoutRemote,
} from "../../../../packages/carry/src/index.ts";

const status = (extra: Partial<WorkStatus> = {}): WorkStatus => ({
  branch: "feat/run-on-bundle",
  head: "a1",
  upstream: "origin/feat/run-on-bundle",
  remoteBase: "9f",
  remoteUrl: "https://github.com/danil-labs/danil.git",
  ahead: 3,
  changed: 5,
  untracked: 2,
  largeUntracked: [{ path: "data/big.csv", bytes: 300 * 1024 * 1024 }],
  ignored: [
    { path: ".env.local", bytes: 812, suggested: true },
    { path: ".claude/settings.local.json", bytes: 1100, suggested: false },
    { path: "dump.sql", bytes: 5 * 1024 * 1024, suggested: false },
  ],
  ignoredSkipped: ["node_modules/", "target/"],
  lfs: false,
  submodules: false,
  takenAt: 1_760_000_000,
  ...extra,
});

type Machine = { transfers: Map<string, Buffer>; projects: Set<string>; calls: string[]; missingBase?: boolean };

/** Dos motores en memoria con las reglas del contrato: partes idempotentes por offset, sha256 al importar. */
function fakeEngines(payload: Buffer, opts: { failWriteAt?: number[]; failWith?: string; tooLarge?: boolean } = {}) {
  const machines: Record<string, Machine> = {
    mac: { transfers: new Map(), projects: new Set(["p1"]), calls: [] },
    vm: { transfers: new Map(), projects: new Set(["p1"]), calls: [] },
  };
  const failWriteAt = [...(opts.failWriteAt ?? [])];
  const exports: { full: boolean; files: string[]; exclude: string[]; recipientKey?: string | null }[] = [];
  const imports: Parameters<CarryEngine["importWork"]>[1][] = [];
  const engine: CarryEngine = {
    async status(machine) {
      machines[machine].calls.push("work_status");
      return status();
    },
    async exportWork(machine, args) {
      machines[machine].calls.push("work_export");
      exports.push({ full: args.full, files: args.files, exclude: args.exclude, recipientKey: args.recipientKey });
      if (opts.tooLarge) throw { what: { clave: "work.error.too_large" }, detail: "" };
      const transfer = `t-${args.operation}`;
      machines[machine].transfers.set(transfer, payload);
      return { transfer, bytes: payload.length, sha256: createHash("sha256").update(payload).digest("hex"), head: "a1", wip: "w1", base: args.full ? null : "9f" };
    },
    async readPart(machine, { transfer, offset, size }) {
      machines[machine].calls.push(`read@${offset}`);
      const all = machines[machine].transfers.get(transfer);
      if (!all) throw { what: { clave: "work.error.transfer_missing" }, detail: "" };
      const chunk = all.subarray(offset, offset + Math.min(size, 4 * 1024 * 1024));
      return { data: chunk.toString("base64"), eof: offset + chunk.length >= all.length };
    },
    async writePart(machine, { transfer, offset, data }) {
      if (failWriteAt[0] === offset) {
        failWriteAt.shift();
        throw { what: { clave: "shell.service.unreachable" }, detail: opts.failWith ?? "io" };
      }
      machines[machine].calls.push(`write@${offset}`);
      const bytes = Buffer.from(data, "base64");
      const prev = machines[machine].transfers.get(transfer) ?? Buffer.alloc(0);
      const next = Buffer.alloc(Math.max(prev.length, offset + bytes.length));
      prev.copy(next);
      bytes.copy(next, offset);
      machines[machine].transfers.set(transfer, next);
      return { received: next.length };
    },
    async importWork(machine, args) {
      const m = machines[machine];
      imports.push(args);
      if (args.probe) {
        m.calls.push("probe");
        return { head: "", base: "", branch: null, files: [], snapshot: false };
      }
      m.calls.push("work_import");
      if (!m.projects.has(args.project) && args.create && exports.at(-1)?.full) m.projects.add(args.create.id);
      if (!m.projects.has(args.project)) throw { what: { clave: "work.error.project_missing" }, detail: "" };
      const got = m.transfers.get(args.transfer) ?? Buffer.alloc(0);
      if (createHash("sha256").update(got).digest("hex") !== args.sha256) throw { what: { clave: "work.error.sha_mismatch" }, detail: "" };
      if (m.missingBase && exports.at(-1)?.full !== true) throw { what: { clave: "work.error.missing_base" }, detail: "" };
      return { head: "a1", base: "w1", branch: null, files: [".env.local"], snapshot: true };
    },
    async key(machine) {
      return { publicKey: `key-of-${machine}` };
    },
    async cancel(machine, { transfer }) {
      machines[machine].calls.push("work_cancel");
      machines[machine].transfers.delete(transfer);
    },
  };
  return { engine, machines, exports, imports };
}

const PART = 256 * 1024;
const payload = Buffer.from(Array.from({ length: 700 * 1024 }, (_, i) => i % 251));
const job = (extra = {}) => ({ source: "mac", target: "vm", project: "p1", task: null, selection: initialSelection(status()), partSize: PART, ...extra });

test("la hoja abre con los .env marcados, sin ignorados grandes y con los archivos nuevos grandes fuera", () => {
  const s = status();
  const selection = initialSelection(s);
  assert.deepEqual(selection.files, [".env.local"]);
  assert.deepEqual(selection.exclude, ["data/big.csv"]);
  assert.equal(selection.includeWork, true);
  assert.equal(selection.full, false);
  assert.equal(initialSelection(status({ remoteBase: null })).full, true, "sin remoto viaja la historia completa");
});

test("sin trabajo sin subir y con el proyecto en el destino se manda sin hoja", () => {
  const clean = status({ ahead: 0, changed: 0, untracked: 0 });
  assert.equal(needsSheet(clean, true), false);
  assert.equal(needsSheet(clean, false), true, "el destino sin el proyecto abre la hoja para clonar con avance");
  assert.equal(needsSheet(status(), true), true);
  assert.equal(sizeVerdict(50 * 1024 * 1024), "ok");
  assert.equal(sizeVerdict(150 * 1024 * 1024), "warn");
  assert.equal(sizeVerdict(1500 * 1024 * 1024), "block");
});

test("copia por partes y la tarea nace en la foto, con el mismo contenido en las dos máquinas", async () => {
  const { engine, machines } = fakeEngines(payload);
  const seen: CarryProgress[] = [];
  const state = newState("op1");
  const result = await carryWork(engine, job(), state, { progress: (p) => seen.push(p) });
  assert.equal(result.baseRef, "w1");
  assert.equal(result.unwrapSnapshot, true);
  assert.ok(machines.vm.transfers.get("t-op1")?.equals(payload), "el destino no tiene el mismo archivo");
  assert.deepEqual(machines.vm.calls.filter((c) => c.startsWith("write@")), ["write@0", `write@${PART}`, `write@${2 * PART}`]);
  assert.equal(machines.vm.calls[0], "probe", "el destino no se despertó antes de copiar");
  assert.deepEqual([...new Set(seen.map((p) => p.step))], ["wake", "copy", "ready"]);
  assert.equal(seen.at(-1)?.sent, payload.length);
  assert.equal(seen.find((p) => p.step === "copy" && p.bytes > 0)?.parts, 3);
});

test("el relay perdió el conector en una parte: se repite esa parte sola y la copia sigue", async () => {
  const { engine, machines } = fakeEngines(payload, { failWriteAt: [PART], failWith: "machine_lost" });
  const result = await carryWork(engine, job(), newState("op-lost"), {});
  assert.equal(result.baseRef, "w1");
  assert.deepEqual(machines.vm.calls.filter((c) => c.startsWith("write@")), ["write@0", `write@${PART}`, `write@${2 * PART}`]);
  assert.ok(machines.vm.transfers.get("t-op-lost")?.equals(payload));
});

test("una parte que falla con un error del motor no se repite sola", async () => {
  const { engine, machines } = fakeEngines(payload, { failWriteAt: [PART], failWith: "work.error.storage" });
  await assert.rejects(carryWork(engine, job(), newState("op-engine"), {}), (e: unknown) => e instanceof CarryError && e.failure.code === "interrupted");
  assert.deepEqual(machines.vm.calls.filter((c) => c.startsWith("write@")), ["write@0"]);
});

test("se cortó la copia: dice en qué parte y reintentar sigue desde ahí sin volver a exportar", async () => {
  // Tantas veces seguidas como intentos tiene una parte: ya no es un tropiezo del camino.
  const { engine, machines } = fakeEngines(payload, { failWriteAt: Array(PART_ATTEMPTS).fill(PART), failWith: "machine_timeout" });
  const state = newState("op2");
  await assert.rejects(carryWork(engine, job(), state, {}), (e: unknown) => {
    assert.ok(e instanceof CarryError);
    assert.deepEqual({ code: e.failure.code, part: "part" in e.failure ? e.failure.part : 0, parts: "parts" in e.failure ? e.failure.parts : 0 }, { code: "interrupted", part: 2, parts: 3 });
    return true;
  });
  machines.mac.calls.length = 0;
  machines.vm.calls.length = 0;
  const result = await carryWork(engine, job(), state, {});
  assert.equal(result.baseRef, "w1");
  assert.ok(!machines.mac.calls.includes("work_export"), "reintentar volvió a exportar");
  assert.deepEqual(machines.vm.calls.filter((c) => c.startsWith("write@")), [`write@${PART}`, `write@${2 * PART}`], "reintentar no siguió desde la parte que falló");
  assert.ok(machines.vm.transfers.get("t-op2")?.equals(payload));
});

test("al destino le falta la base: se pide la rama completa con otra transferencia", async () => {
  const { engine, machines, exports } = fakeEngines(payload);
  machines.vm.missingBase = true;
  const first = newState("op3");
  await assert.rejects(carryWork(engine, job(), first, {}), (e: unknown) => e instanceof CarryError && e.failure.code === "missing_base");
  await cancelCarry(engine, job(), first);
  assert.ok(!machines.mac.transfers.has("t-op3") && !machines.vm.transfers.has("t-op3"), "la transferencia vieja quedó en alguna máquina");
  const full = job({ selection: { ...initialSelection(status()), full: true } });
  const result = await carryWork(engine, full, newState("op4"), {});
  assert.equal(result.baseRef, "w1");
  assert.equal(exports.at(-1)?.full, true);
});

test("sin el proyecto en el destino se clona antes de copiar; si el import lo echa en falta, también", async () => {
  const { engine, machines } = fakeEngines(payload);
  machines.vm.projects.clear();
  const clones: string[] = [];
  const clone = async (progress: (phase: string, percent: number | null) => void) => {
    progress("receiving", 40);
    clones.push("clone");
    machines.vm.projects.add("p1");
  };
  const steps: string[] = [];
  await carryWork(engine, job(), newState("op5"), { hasProject: async () => machines.vm.projects.has("p1"), clone, progress: (p) => steps.push(p.step) });
  assert.deepEqual(clones, ["clone"]);
  assert.ok(steps.indexOf("clone") < steps.indexOf("copy"));

  machines.vm.projects.clear();
  clones.length = 0;
  await carryWork(engine, job(), newState("op6"), { clone });
  assert.deepEqual(clones, ["clone"], "el import sin proyecto no clonó y reintentó");
});

test("pasa de 1 GB: el origen lo rechaza y no se copia nada", async () => {
  const { engine, machines } = fakeEngines(payload, { tooLarge: true });
  await assert.rejects(carryWork(engine, job(), newState("op7"), {}), (e: unknown) => e instanceof CarryError && e.failure.code === "too_large");
  assert.ok(!machines.vm.calls.some((c) => c.startsWith("write@")));
});

test("cancelar a media copia se detiene entre partes y borra en las dos máquinas", async () => {
  const { engine, machines } = fakeEngines(payload);
  const state = newState("op8");
  let parts = 0;
  const cancelled = () => parts >= 1;
  await assert.rejects(
    carryWork(engine, job(), state, { cancelled, progress: (p) => { if (p.step === "copy" && p.sent > 0) parts++; } }),
    (e: unknown) => e instanceof CarryError && e.failure.code === "cancelled",
  );
  await cancelCarry(engine, job(), state);
  assert.ok(!machines.mac.transfers.has("t-op8"));
  assert.ok(!machines.vm.transfers.has("t-op8"));
});

test("traer: sin ignorados marcados y la rama local que recibe el trabajo viaja en el import", async () => {
  assert.deepEqual(bringSelection(status()).files, [], "al traer se marcó un ignorado");
  assert.equal(bringBranch(status(), "vm-alberto"), "feat/run-on-bundle");
  assert.equal(bringBranch(status({ branch: null, head: "0123456789" }), "VM Alberto"), "terminus/vm-alberto-0123456");
  const { engine, imports } = fakeEngines(payload);
  const back = { source: "vm", target: "mac", project: "p1", task: "t1", selection: bringSelection(status()), partSize: PART, branchAs: "feat/run-on-bundle" };
  // El falso guarda la transferencia en la máquina que exporta: aquí, la VM.
  await carryWork(engine, back, newState("op9"));
  assert.equal(imports.at(-1)?.branchAs, "feat/run-on-bundle");
  assert.equal(imports.find((a) => a.probe)?.branchAs, undefined, "despertar no lleva rama");
});

test("un proyecto sin remoto viaja entero y el destino lo crea con el mismo id, sin clonar", async () => {
  const local = status({ remoteBase: null, remoteUrl: null, upstream: null });
  assert.equal(withoutRemote(local, null), true);
  assert.equal(withoutRemote(status(), null), false);
  const { engine, machines, imports, exports } = fakeEngines(payload);
  machines.vm.projects.clear();
  const job = { source: "mac", target: "vm", project: "p1", task: null, selection: initialSelection(local), partSize: PART, create: { name: "notas", id: "p1" } };
  const result = await carryWork(engine, job, newState("op10"), { hasProject: async () => false, clone: undefined });
  assert.equal(result.baseRef, "w1");
  assert.equal(exports.at(-1)?.full, true, "sin remoto no viajó la historia completa");
  assert.deepEqual(imports.at(-1)?.create, { name: "notas", id: "p1" });
  assert.ok(machines.vm.projects.has("p1"));
});

test("sellado: la llave del destino se fija la primera vez, un cambio se nota y el export sale sellado con ella", async () => {
  assert.equal(keyVerdict(undefined, "k1"), "new");
  assert.equal(keyVerdict("k1", "k1"), "same");
  assert.equal(keyVerdict("k1", "k2"), "changed");
  const { engine, exports } = fakeEngines(payload);
  const { publicKey } = await engine.key("vm");
  await carryWork(engine, job({ recipientKey: publicKey }), newState("op11"));
  assert.equal(exports.at(-1)?.recipientKey, "key-of-vm");
  await carryWork(engine, job(), newState("op12"));
  assert.equal(exports.at(-1)?.recipientKey, undefined, "sin llave el export no lleva recipientKey");
});


test("ignored files are applied to the task even when the import has no snapshot commit", async () => {
  const { engine } = fakeEngines(payload);
  const importWork = engine.importWork;
  engine.importWork = async (machine, args) => {
    const result = await importWork(machine, args);
    return args.probe ? result : { ...result, snapshot: false, files: [".env.local"] };
  };
  const result = await carryWork(engine, job(), newState("files-only"));
  assert.equal(result.unwrapSnapshot, true);
});
