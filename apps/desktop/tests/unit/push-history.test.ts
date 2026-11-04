/**
 * Cómo se juntan las páginas de `service history`: la relectura del final conserva lo
 * anterior ya cargado y una página anterior se antepone solo si encaja.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { prependHistory, refreshHistory } from "../../src/features/chat/history.ts";
import { conservarPorElFinal } from "../../src/lib/sessionRefresh.ts";

const turns = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => `t${from + i}`);
const page = (start: number, end: number, total: number) => ({ start, end, total, limit: 150, has_more: start > 0 });

test("sin página la transcripción vino entera", () => {
  assert.deepEqual(refreshHistory(undefined, turns(0, 3), null), { start: 0, total: 3, turns: turns(0, 3) });
});

test("una página anterior se antepone y la relectura del final la conserva", () => {
  const first = refreshHistory(undefined, turns(250, 400), page(250, 400, 400));
  const older = prependHistory(first, turns(100, 250), page(100, 250, 400));
  assert.ok(older);
  assert.equal(older.start, 100);
  assert.equal(older.turns.length, 300);
  // Cerró un turno: el final se relee y lo de antes sigue.
  const grown = refreshHistory(older, turns(251, 401), page(251, 401, 401));
  assert.equal(grown.start, 100);
  assert.deepEqual(grown.turns.slice(0, 2), ["t100", "t101"]);
  assert.equal(grown.turns.at(-1), "t400");
  assert.equal(grown.turns.length, 301);
});

test("una transcripción reescrita no mezcla páginas", () => {
  const first = refreshHistory(undefined, turns(250, 400), page(250, 400, 400));
  assert.equal(prependHistory(first, turns(0, 150), page(0, 150, 300)), null);
  assert.equal(prependHistory(first, turns(0, 100), page(0, 100, 400)), null);
  const shorter = refreshHistory(first, turns(150, 300), page(150, 300, 300));
  assert.deepEqual(shorter, { start: 150, total: 300, turns: turns(150, 300) });
});

test("anteponer conserva los objetos de lo que ya estaba", () => {
  const before = [{ id: 3 }, { id: 4 }];
  const after = conservarPorElFinal(before, [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
  assert.equal(after[2], before[0]);
  assert.equal(after[3], before[1]);
  assert.equal(after.length, 4);
});

test("una reescritura invalida páginas aunque conserve el número de turnos", () => {
  const first = refreshHistory(undefined, turns(250, 400), { ...page(250, 400, 400), revision: "original" });
  assert.equal(prependHistory(first, turns(100, 250), { ...page(100, 250, 400), revision: "rewritten" }), null);
  const rewritten = turns(300, 400).map((turn) => `${turn}!`);
  const fresh = refreshHistory(first, rewritten, { ...page(300, 400, 400), revision: "rewritten" });
  assert.equal(fresh.start, 300);
  assert.equal(fresh.revision, "rewritten");
  assert.deepEqual(fresh.turns, rewritten);
});

test("bounded history drops a recoverable edge instead of retaining every visited page", () => {
  const records = Array.from({ length: 12 }, (_, id) => ({ id, text: "x".repeat(250_000) }));
  const versioned = { ...page(0, 12, 12), version: 1, revision: "same" };
  const tail = refreshHistory(undefined, records, versioned);
  assert.ok(tail.start > 0);
  assert.equal(tail.turns.at(-1)?.id, 11);
  assert.ok(Buffer.byteLength(JSON.stringify(tail.turns)) <= 2 * 1024 * 1024);
  const older = prependHistory(tail, records.slice(0, tail.start), { ...versioned, end: tail.start });
  assert.ok(older);
  assert.equal(older.start, 0);
  assert.equal(older.turns[0].id, 0);
  assert.ok(older.turns.length < older.total);
  assert.ok(Buffer.byteLength(JSON.stringify(older.turns)) <= 2 * 1024 * 1024);
});
