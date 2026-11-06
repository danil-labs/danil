/**
 * `features/chat/secretRequestsBook.ts`: la lista es la verdad (lo que falta y seguía
 * abierto se cierra como vencido), `secret_requested` sustituye por id sin reabrir
 * una cerrada, y `secret_request_closed` pone su desenlace.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyClosed, applyList, applyRequested, type SecretRequestWire, sameTask } from "../../src/features/chat/secretRequestsBook.ts";

const wire = (id: string, task = "t1"): SecretRequestWire => ({ request_id: id, workspace: "w", task, folder: "p1", name: "STRIPE_KEY", reason: "para el checkout", reason_author: "agent", replace: false, created_at: "", expires_at: "" });

test("a replayed request does not reopen one already closed", () => {
  let book = applyRequested(new Map(), wire("r1"));
  assert.equal(book.get("r1")?.state, "open");
  book = applyClosed(book, { request_id: "r1", outcome: "fulfilled" });
  assert.equal(book.get("r1")?.state, "saved");
  book = applyRequested(book, wire("r1"));
  assert.equal(book.get("r1")?.state, "saved");
  assert.equal(applyClosed(book, { request_id: "r1", outcome: "declined" }).get("r1")?.state, "declined");
  assert.equal(applyClosed(new Map(), { request_id: "nope", outcome: "expired" }).size, 0, "an unknown close adds nothing");
});

test("the list closes as expired the open cards of that task it no longer has, and leaves other tasks alone", () => {
  let book = applyRequested(new Map(), wire("r1"));
  book = applyRequested(book, wire("r2"));
  book = applyRequested(book, wire("o1", "t2"));
  book = applyList(book, (task) => task === "t1", [wire("r2"), wire("r3")]);
  assert.equal(book.get("r1")?.state, "expired");
  assert.equal(book.get("r2")?.state, "open");
  assert.equal(book.get("r3")?.state, "open", "a window that opens late gets what is open");
  assert.equal(book.get("o1")?.state, "open", "another task is not touched");
});

test("on the web the conversation carries the machine in front", () => {
  assert.ok(sameTask("t1", "t1"));
  assert.ok(sameTask("cmp_vm~t1", "t1"));
  assert.ok(!sameTask("cmp_vm~t10", "t1"));
});
