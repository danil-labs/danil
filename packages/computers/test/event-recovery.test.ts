import assert from "node:assert/strict";
import test from "node:test";
import { EventRecovery } from "../src/event-recovery.ts";
import type { EventsPage } from "../src/relay.ts";

const page = (cursor: number, complete: boolean, events: number[], id = "epoch"): EventsPage => ({ cursor, runtime: "rt", replay: true,
  recovery: { id, through: 9, complete }, events: events.map(seq => ({ seq, name: "chat", payload: { text: "legitimately identical text" } })) });

test("three recovery pages commit together, including an empty filtered page", () => {
  const recovery = new EventRecovery();
  assert.deepEqual(recovery.receive(page(3, false, [1, 2, 3])), { handled: true });
  assert.deepEqual(recovery.receive(page(6, false, [])), { handled: true });
  const result = recovery.receive(page(9, true, [7, 8, 9]));
  assert.ok(result.handled && result.page);
  assert.deepEqual(result.page.events?.map(event => event.seq), [1, 2, 3, 7, 8, 9]);
});
test("overlap uses sequence identity without removing equal text from distinct events", () => {
  const recovery = new EventRecovery();
  recovery.receive(page(3, false, [1, 2, 3]));
  const result = recovery.receive(page(9, true, [2, 3, 4, 9]));
  assert.ok(result.handled && result.page);
  assert.deepEqual(result.page.events?.map(event => event.seq), [1, 2, 3, 4, 9]);
});
test("a new subscription discards its uncommitted replay, never the caller's visible history", () => {
  const recovery = new EventRecovery(); recovery.receive(page(3, false, [1, 2, 3])); recovery.reset();
  const result = recovery.receive(page(9, true, [7, 8, 9], "new-epoch"));
  assert.ok(result.handled && result.page); assert.deepEqual(result.page.events?.map(event => event.seq), [7, 8, 9]);
});
test("malformed boundaries, missing sequence, overflow and explicit errors become a gap without advancing the resume cursor", () => {
  for (const invalid of [page(9, false, [9]), { ...page(9, true, [9]), recovery: "invalid" }, { ...page(9, true, []), events: [{ name: "chat", payload: {} }] }, { ...page(9, true, []), recovery: { id: "epoch", failed: true } }]) {
    const result = new EventRecovery().receive(invalid as EventsPage);
    assert.ok(result.handled && result.page); assert.equal(result.page.gap, true); assert.equal(result.page.cursor, null);
  }
  const overflow = new EventRecovery(1).receive(page(9, true, [9]));
  assert.ok(overflow.handled && overflow.page); assert.equal(overflow.page.gap, true);
});
test("legacy pages remain a streaming delivery", () => {
  assert.deepEqual(new EventRecovery().receive({ cursor: 4, events: [] }), { handled: false });
});


test("a failed recovery cannot commit only its later suffix", () => {
  const recovery = new EventRecovery();
  recovery.receive(page(3, false, [1, 2, 3]));
  const failed = recovery.receive({ ...page(6, false, []), recovery: { id: "epoch", failed: true } });
  assert.ok(failed.handled && failed.page?.gap);
  assert.deepEqual(recovery.receive(page(9, true, [7, 8, 9])), { handled: true });
  const fresh = recovery.receive(page(9, true, [1, 2, 3, 7, 8, 9], "retry-epoch"));
  assert.ok(fresh.handled && fresh.page);
  assert.deepEqual(fresh.page.events?.map(event => event.seq), [1, 2, 3, 7, 8, 9]);
});
