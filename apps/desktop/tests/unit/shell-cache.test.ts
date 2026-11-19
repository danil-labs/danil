import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  },
});
const { forgetShellCache, readShellCache, setShellCacheScope, shellCacheMatches, shellCacheWriter, writeShellCache, SAVE_DELAY } = await import("../../src/lib/shellCache.ts");

type Snapshot = Parameters<typeof writeShellCache>[0];
const row = (id: string, text = "") => ({ id, title: `Tarea ${id}`, last_message: text }) as unknown as Snapshot["sessions"][string][number];
const snapshot = (workspace: string, rows = 3, text = ""): Snapshot => ({
  workspace,
  projects: [{ id: "p" } as Snapshot["projects"][number]],
  sessions: { "": Array.from({ length: rows }, (_, n) => row(`${workspace}${n}`, text)), p: [] },
  spaces: [],
  desk: null,
});

beforeEach(() => {
  store.clear();
  setShellCacheScope(null);
});

test("la última foto guardada es la que se lee al arrancar", () => {
  writeShellCache(snapshot("a"), 1);
  writeShellCache(snapshot("b"), 2);
  assert.equal(readShellCache()?.workspace, "b");
  assert.deepEqual(readShellCache()?.sessions[""].map((r) => r.id), ["b0", "b1", "b2"]);
});

test("solo se guardan los cuatro workspaces más recientes", () => {
  for (const [n, id] of ["a", "b", "c", "d", "e"].entries()) writeShellCache(snapshot(id), n);
  const stored = JSON.parse(store.get("harness:shell-cache") ?? "{}");
  assert.deepEqual(Object.keys(stored.workspaces).sort(), ["b", "c", "d", "e"]);
});

test("una foto demasiado grande se recorta por carpeta y, si no cabe, no se guarda", () => {
  writeShellCache(snapshot("a", 200, "x".repeat(1000)), 1);
  assert.equal(readShellCache()?.sessions[""].length, 80);
  writeShellCache(snapshot("a", 200, "x".repeat(50_000)), 2);
  assert.equal(readShellCache(), null);
});

test("guardar espera a que pare de cambiar y escribe solo la última", () => {
  const written: string[] = [];
  const timers: { run: () => void; ms: number }[] = [];
  const writer = shellCacheWriter(
    (s) => void written.push(s.workspace),
    (run, ms) => timers.push({ run, ms }) - 1,
    (handle) => {
      timers[handle as number] = { run: () => {}, ms: 0 };
    },
  );
  writer.save(snapshot("a"));
  writer.save(snapshot("b"));
  assert.equal(timers.at(-1)?.ms, SAVE_DELAY);
  for (const t of timers) t.run();
  assert.deepEqual(written, ["b"]);
  writer.save(snapshot("c"));
  writer.cancel();
  writer.flush();
  assert.deepEqual(written, ["b"]);
});

test("una foto ilegible no rompe el arranque", () => {
  store.set("harness:shell-cache", "{no es json");
  assert.equal(readShellCache(), null);
});

test("la misma foto no se vuelve a escribir", () => {
  writeShellCache(snapshot("a"), 1);
  const before = store.get("harness:shell-cache");
  writeShellCache(snapshot("a"), 2);
  assert.equal(store.get("harness:shell-cache"), before);
  writeShellCache(snapshot("a", 4), 3);
  assert.notEqual(store.get("harness:shell-cache"), before);
});

test("con otra máquina, las filas de la foto vuelven como copia de esa hora", () => {
  const vm = { ...row("cmp_vm~t1"), machine: "cmp_vm", machine_on: false, machine_status: "ok", machine_at: 5 } as Snapshot["sessions"][string][number];
  const late = { ...row("cmp_mac~t2"), machine: "cmp_mac", machine_on: true, machine_status: "no_answer", machine_at: 3 } as Snapshot["sessions"][string][number];
  writeShellCache({ ...snapshot("a", 1), sessions: { "": [row("a0"), vm, late], p: [] } }, 1);
  const read = readShellCache();
  assert.deepEqual(read?.sessions[""].map((r) => [r.id, r.machine_status ?? null, r.machine_at ?? null]), [["a0", null, null], ["cmp_vm~t1", "cached", 5], ["cmp_mac~t2", "no_answer", 3]]);
});

test("en la web con varias cuentas solo se pinta la foto de un workspace de la cuenta abierta", () => {
  writeShellCache(snapshot("mio"), 1);
  writeShellCache(snapshot("ajeno"), 2);
  // La última es de otra cuenta: no se enseña.
  setShellCacheScope({ mine: (w) => w === "mio", prefer: null });
  assert.equal(readShellCache(), null);
  // El pedido en `?w=` gana a la última.
  setShellCacheScope({ mine: (w) => w === "mio", prefer: "mio" });
  assert.equal(readShellCache()?.workspace, "mio");
  // Sin alcance (el escritorio) sigue siendo la última.
  setShellCacheScope(null);
  assert.equal(readShellCache()?.workspace, "ajeno");
});

test("quitar una cuenta olvida las fotos de sus workspaces", () => {
  writeShellCache(snapshot("a"), 1);
  writeShellCache(snapshot("b"), 2);
  forgetShellCache(["b"]);
  const stored = JSON.parse(store.get("harness:shell-cache") ?? "{}");
  assert.deepEqual(Object.keys(stored.workspaces), ["a"]);
});

test("shell snapshots and delayed flushes stay in the context that produced them", async () => {
  const { setDisplayWorkspaceContext } = await import("../../src/lib/workspace-context.ts");
  try {
    setDisplayWorkspaceContext("ana");
    const pending = shellCacheWriter(writeShellCache, () => 1, () => {});
    pending.save(snapshot("same", 1, "Ana private"));
    setDisplayWorkspaceContext("bea");
    pending.flush();
    assert.equal(readShellCache(), null);
    writeShellCache(snapshot("same", 1, "Bea private"));
    assert.equal(readShellCache()?.sessions[""][0].last_message, "Bea private");
    const beaSnapshot = readShellCache();
    assert.equal(shellCacheMatches(beaSnapshot, "same"), true);
    setDisplayWorkspaceContext("ana");
    assert.equal(shellCacheMatches(beaSnapshot, "same"), false);
    assert.equal(readShellCache()?.sessions[""][0].last_message, "Ana private");
  } finally { setDisplayWorkspaceContext(null); }
});
