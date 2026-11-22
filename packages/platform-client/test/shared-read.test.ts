import assert from "node:assert/strict";
import { test } from "node:test";
import { sharedRead, sharedReads } from "../src/shared-read.ts";

const counter = () => {
  let calls = 0;
  return { read: async () => ++calls, calls: () => calls };
};

test("dos lecturas a la vez y una reciente comparten un solo request", async () => {
  let t = 0;
  const c = counter();
  const r = sharedRead(c.read, { now: () => t, freshMs: 1000 });
  assert.deepEqual(await Promise.all([r.read(), r.read()]), [1, 1]);
  t = 999;
  assert.equal(await r.read(), 1);
  t = 1000;
  assert.equal(await r.read(), 2);
  assert.equal(c.calls(), 2);
});

test("fresh relee siempre e invalidate olvida lo guardado y lo que está en curso", async () => {
  const c = counter();
  const r = sharedRead(c.read);
  assert.equal(await r.read(), 1);
  assert.equal(await r.read({ fresh: true }), 2);
  const pending = r.read({ fresh: true });
  r.invalidate();
  assert.equal(await r.read(), 4);
  assert.equal(await pending, 3);
  assert.equal(await r.read(), 4, "la lectura anterior a la invalidación no se guarda");
});

test("un fallo o una respuesta que keep rechaza no se guarda", async () => {
  let calls = 0;
  const r = sharedRead(async () => { calls++; if (calls === 1) throw new Error("red"); return calls; }, { keep: (n) => n > 2 });
  await assert.rejects(r.read());
  assert.equal(await r.read(), 2);
  assert.equal(await r.read(), 3);
  assert.equal(await r.read(), 3);
});

test("el aborto de uno corta su espera, no la lectura de los demás", async () => {
  let release!: (n: number) => void;
  const r = sharedRead(() => new Promise<number>((ok) => { release = ok; }));
  const stop = new AbortController();
  const mine = r.read({ signal: stop.signal });
  const other = r.read();
  stop.abort(new Error("cerrada"));
  await assert.rejects(mine, /cerrada/);
  release(7);
  assert.equal(await other, 7);
});

test("por clave: cada contexto su lectura; invalidate sin clave las olvida todas", async () => {
  const seen: string[] = [];
  const r = sharedReads(async (key) => { seen.push(key); return key; });
  await Promise.all([r.read("a"), r.read("a"), r.read("b")]);
  assert.deepEqual(seen, ["a", "b"]);
  r.invalidate();
  await r.read("a");
  assert.deepEqual(seen, ["a", "b", "a"]);
});
