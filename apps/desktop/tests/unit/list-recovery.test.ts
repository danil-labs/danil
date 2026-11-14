/** La lista de computadoras de la cuenta se vuelve a pedir sola tras fallar: en ≤ 30 s, un intento a la vez, y para al desmontar. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createListRecovery, RECOVERY_DELAYS_MS } from "../../src/features/machines/list-recovery.ts";

function clock() {
  const timers: { ms: number; run: () => void }[] = [];
  return {
    timers,
    schedule: (run: () => void, ms: number) => {
      const entry = { ms, run };
      timers.push(entry);
      return () => { const i = timers.indexOf(entry); if (i >= 0) timers.splice(i, 1); };
    },
    fire() { const next = timers.shift(); next?.run(); return next?.ms; },
  };
}

test("a failed list is asked again by itself within 30 s, never later", () => {
  const c = clock();
  const recovery = createListRecovery(() => {}, c.schedule);
  const waits: number[] = [];
  for (let i = 0; i < 6; i++) { recovery.failed(); waits.push(c.fire()!); }
  assert.deepEqual(waits, [10_000, 20_000, 30_000, 30_000, 30_000, 30_000]);
  assert.ok(RECOVERY_DELAYS_MS.every((ms) => ms <= 30_000));
});

test("one retry waits at a time, and a good answer starts again from the shortest wait", () => {
  const c = clock();
  let reads = 0;
  const recovery = createListRecovery(() => { reads++; }, c.schedule);
  recovery.failed();
  recovery.failed();
  assert.equal(c.timers.length, 1);
  c.fire();
  assert.equal(reads, 1);
  recovery.succeeded();
  assert.equal(c.timers.length, 0);
  recovery.failed();
  assert.equal(c.fire(), 10_000);
});

test("unmounting stops it: no orphan timer and no read afterwards", () => {
  const c = clock();
  let reads = 0;
  const recovery = createListRecovery(() => { reads++; }, c.schedule);
  recovery.failed();
  const late = c.timers[0];
  recovery.stop();
  assert.equal(c.timers.length, 0);
  late.run();
  recovery.failed();
  assert.equal(reads, 0);
  assert.equal(c.timers.length, 0);
});
