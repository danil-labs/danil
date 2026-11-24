import assert from "node:assert/strict";
import test from "node:test";
import { createWebEventQueue } from "../../../../packages/features/machines/src/model/web-event-queue.ts";

test("a pending web poll wakes immediately and close settles a later reader", async () => {
  const queue = createWebEventQueue();
  const pending = queue.poll();
  queue.push([{ name: "chat", payload: { session: "s", kind: "delta", text: "progress" } }], { replay: true, replayId: "one", cursor: 9 });
  const result = await pending;
  assert.equal(result.batches?.[0].replayId, "one"); assert.equal(result.gap, false);
  const final = queue.poll(); queue.close();
  assert.deepEqual((await final).batches, []);
  queue.push([{ name: "chat", payload: "late" }]); assert.deepEqual((await queue.poll()).batches, []);
});

test("overflow and remote gaps request reconciliation instead of silently dropping a journal", async () => {
  const queue = createWebEventQueue(80);
  queue.push([{ name: "chat", payload: "x".repeat(80) }]);
  const over = await queue.poll(); assert.equal(over.gap, true); assert.deepEqual(over.batches, []);
  queue.push([], { gap: true }); assert.equal((await queue.poll()).gap, true);
  queue.close();
});


test("a connection resync wakes the reader without claiming lost live output", async () => {
  const queue = createWebEventQueue();
  const pending = queue.poll();
  queue.push([], { resync: true });
  let page;
  try { page = await Promise.race([pending, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("resync did not wake the reader")), 100))]); } catch (error) { queue.close(); throw error; }
  assert.equal(page.resync, true); assert.equal(page.gap, false);
  queue.push([], { gap: true, cursor: 7 });
  const lost = await queue.poll(); assert.equal(lost.gap, true); assert.equal(lost.resync, false);
  queue.close();
});
