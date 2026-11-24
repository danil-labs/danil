import assert from "node:assert/strict";
import test from "node:test";
import "../helpers/catalog.ts";
import { mergeGates } from "../../../../packages/features/chat/src/model/permissionGates.ts";
import { sinRespuesta } from "../../../../packages/features/chat/src/model/permissionRecovery.ts";

const gate = (requestId: string, extra: Record<string, unknown> = {}) =>
  ({ session: "s1", requestId, tool: "Bash", target: "echo", origin: null, ...extra }) as never;
const read = (id: string, request_id: string) => ({ id, request_id, revision: 1, tool: "Bash", target: "echo" });

test("a read keeps a gate that arrived after it started and is not in it yet", () => {
  const ps = [gate("old", { llegada: 1 }), gate("new", { llegada: 3 }), gate("other", { session: "s2", llegada: 1 })];
  const merged = mergeGates(ps, "s1", "w", [read("d-a", "a")], 2) as { session: string; requestId: string; durableId?: string }[];
  assert.deepEqual(merged.map((p) => `${p.session}:${p.requestId}`).sort(), ["s1:a", "s1:new", "s2:other"]);
  assert.equal(merged.find((p) => p.requestId === "a")?.durableId, "d-a");
});

test("the gate whose event triggered the read survives until the record appears", () => {
  const merged = mergeGates([gate("trigger", { llegada: 4 })], "s1", "w", [read("d-x", "x")], 4) as { requestId: string }[];
  assert.deepEqual(merged.map((p) => p.requestId).sort(), ["trigger", "x"]);
});

test("a read from an engine without durable ids only matches by request_id", () => {
  const ps = [gate("old", { llegada: 1 }), gate("live", { llegada: 3 })];
  const merged = mergeGates(ps, "s1", "w", [{ request_id: "a", tool: "Bash", target: "echo" }], 2) as { requestId: string; durableId?: string }[];
  assert.deepEqual(merged.map((p) => p.requestId).sort(), ["a", "live"]);
  assert.equal(merged.find((p) => p.requestId === "a")?.durableId, undefined);
});

test("an empty read removes nothing and a read gate keeps its origin", () => {
  const ps = [gate("a", { llegada: 1, origin: { kind: "task" } })];
  assert.equal(mergeGates(ps, "s1", "w", [], 5), ps);
  const merged = mergeGates(ps, "s1", "w", [read("d-a", "a")], 5) as { origin: unknown }[];
  assert.deepEqual(merged.map((p) => p.origin), [{ kind: "task" }]);
});

test("a failed reply reads the durable record instead of assuming the request closed", () => {
  const p = { session: "s1", requestId: "r1", durableId: "d1", tool: "Bash", target: null, origin: null };
  const records = (state: string) => ({ permissions: [], records: { permissions: [{ id: "d1", request_id: "r1", state }] } });
  for (const state of ["answering", "sent", "resolved"]) assert.equal(sinRespuesta(p, records(state), new Error("x")), "respondida", state);
  assert.equal(sinRespuesta(p, records("waiting"), { what: { clave: "cli.error.pending_already_decided" } }), "respondida");
  assert.equal(sinRespuesta(p, { permissions: [{ id: "d1", request_id: "r1" }] }, new Error("x")), null);
  const unknown = sinRespuesta(p, records("delivery_unknown"), new Error("x"));
  const lost = sinRespuesta(p, records("owner_lost"), new Error("x"));
  const closedLost = sinRespuesta(p, { permissions: [], records: { permissions: [{ id: "d1", request_id: "r1", state: "closed", closed: "owner_lost" }] } }, new Error("x"));
  assert.equal((closedLost as { text: string }).text, (lost as { text: string }).text);
  const gone = sinRespuesta(p, records("abandoned"), new Error("x"));
  for (const row of [unknown, lost, gone]) assert.ok(row && row !== "respondida" && row.meta === "fallo");
  const texts = [unknown, lost, gone].map((row) => (row as { text: string }).text);
  assert.equal(new Set(texts).size, 3);
  assert.doesNotMatch(texts.join(" "), /cli\.error|shell\.turn/);
});
