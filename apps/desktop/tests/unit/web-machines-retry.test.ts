/** El reintento de la lista de máquinas tras «sin acceso»: backoff acotado, una lectura a la vez y parada al cerrar. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createMachinesRetry, retryDelay, RETRY_CEILING_MS, RETRY_FIRST_MS } from "../../src/web/machines-retry.ts";

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

test("the backoff grows from 15 s, doubles and stops at 5 minutes, with bounded jitter", () => {
  const mid = () => 0.5;
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 12].map((n) => retryDelay(n, mid)), [15_000, 30_000, 60_000, 120_000, 240_000, 300_000, 300_000, 300_000]);
  assert.equal(RETRY_FIRST_MS, 15_000);
  for (const r of [0, 0.999]) for (let n = 0; n < 20; n++) {
    const d = retryDelay(n, () => r);
    assert.ok(d <= RETRY_CEILING_MS && d >= Math.min(RETRY_CEILING_MS, RETRY_FIRST_MS * 2 ** n) * 0.9 - 1, `${n} ${r} ${d}`);
  }
});

test("one retry at a time: failing again replaces the pending one instead of piling up reads", () => {
  const c = clock();
  let reads = 0;
  const retry = createMachinesRetry(() => { reads++; }, c.schedule, () => 0.5);
  retry.failed();
  retry.failed();
  assert.equal(c.timers.length, 1, "never two retries waiting");
  c.fire();
  assert.equal(reads, 1);
});

test("each failure waits longer, a success starts again from 15 s", () => {
  const c = clock();
  const retry = createMachinesRetry(() => {}, c.schedule, () => 0.5);
  const waits: number[] = [];
  for (let i = 0; i < 4; i++) { retry.failed(); waits.push(c.fire()!); }
  assert.deepEqual(waits, [15_000, 30_000, 60_000, 120_000]);
  retry.succeeded();
  assert.equal(c.timers.length, 0, "a success cancels the pending retry");
  retry.failed();
  assert.equal(c.fire(), 15_000);
});

test("stopping (sign-out, unmount) cancels the pending retry and nothing reads afterwards", () => {
  const c = clock();
  let reads = 0;
  const retry = createMachinesRetry(() => { reads++; }, c.schedule, () => 0.5);
  retry.failed();
  const late = c.timers[0];
  retry.stop();
  assert.equal(c.timers.length, 0, "no orphan timer");
  late.run();
  retry.failed();
  assert.equal(reads, 0);
  assert.equal(c.timers.length, 0);
  assert.equal(retry.pending(), false);
});
