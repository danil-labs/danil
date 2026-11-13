/**
 * La lista de máquinas del teléfono (`retryingRead` de `reload.ts`): si el plano de control aún
 * no la tiene (404/501) o no contesta, se vuelve a leer sola con espera creciente; una respuesta
 * buena reinicia la espera y una lectura vieja no pisa a una nueva.
 *
 *   node --test apps/mobile/scripts/retrying-read.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { retryingRead } from "../src/lib/reload.ts";

function clock() {
  const queue: { run: () => void; ms: number }[] = [];
  return {
    schedule: (run: () => void, ms: number) => {
      const item = { run, ms };
      queue.push(item);
      return () => void queue.splice(queue.indexOf(item), 1);
    },
    pending: () => queue.map((q) => q.ms),
    async tick() {
      const item = queue.shift();
      item?.run();
      await new Promise((r) => setTimeout(r, 0));
      return item?.ms;
    },
  };
}

test("un «aún no» se relee solo, cada vez más espaciado, y una respuesta buena lo detiene", async () => {
  const c = clock();
  const answers = ["no", "no", "no", "ok"];
  const seen: string[] = [];
  const read = retryingRead(async () => answers.shift()!, (v) => void seen.push(v), { retry: (v) => v === "no", schedule: c.schedule, first: 5_000, max: 12_000 });
  await read.run();
  assert.equal(await c.tick(), 5_000);
  assert.equal(await c.tick(), 10_000);
  assert.equal(await c.tick(), 12_000, "con techo");
  assert.deepEqual(seen, ["no", "no", "no", "ok"]);
  assert.deepEqual(c.pending(), []);
});

test("tras una respuesta buena la espera vuelve a empezar", async () => {
  const c = clock();
  const answers = ["no", "ok", "no"];
  const read = retryingRead(async () => answers.shift()!, () => {}, { retry: (v) => v === "no", schedule: c.schedule, first: 5_000, max: 60_000 });
  await read.run();
  await c.tick();
  await read.run();
  assert.deepEqual(c.pending(), [5_000]);
});

test("una lectura que llega tarde no pisa a la nueva, y `stop` cancela el reintento", async () => {
  const c = clock();
  let release: (v: string) => void = () => {};
  const reads = [new Promise<string>((r) => (release = r)), Promise.resolve("ok")];
  const seen: string[] = [];
  const read = retryingRead(() => reads.shift()!, (v) => void seen.push(v), { retry: (v) => v === "no", schedule: c.schedule, first: 1, max: 1 });
  const first = read.run();
  await read.run();
  release("no");
  await first;
  assert.deepEqual(seen, ["ok"]);
  assert.deepEqual(c.pending(), []);
  const failing = retryingRead(async () => "no", () => {}, { retry: () => true, schedule: c.schedule, first: 1, max: 1 });
  await failing.run();
  failing.stop();
  assert.deepEqual(c.pending(), []);
});

test("una lectura que lanza cuenta como fallo y se reintenta", async () => {
  const c = clock();
  const seen: unknown[] = [];
  const read = retryingRead<string>(async () => { throw new Error("red"); }, (v) => void seen.push(v), { retry: () => true, fallback: () => "no", schedule: c.schedule, first: 7, max: 7 });
  await read.run();
  assert.deepEqual(seen, ["no"]);
  assert.deepEqual(c.pending(), [7]);
});
