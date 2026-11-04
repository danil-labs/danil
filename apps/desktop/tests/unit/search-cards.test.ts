import assert from "node:assert/strict";
import test from "node:test";

const { dayKey, groupSearchHits, searchMatchCards } = await import("../../src/features/chat/searchCards.ts");

const at = (year: number, month: number, day: number, hour = 9) => new Date(year, month - 1, day, hour).getTime();

test("una consulta vacía no arma tarjetas", () => {
  assert.deepEqual(searchMatchCards([{ block: 0, text: "hola", role: "user", speaker: null }], ""), []);
});

test("marca el texto original, cuenta cada aparición y no inventa el día", () => {
  const hits = searchMatchCards([
    { block: 1, text: "Hola Mundo, mundo otra vez", role: "user", speaker: null },
    { block: 2, text: "mundo con fecha", role: "agent", speaker: null, at: at(2026, 1, 2, 15) },
  ], "mundo");
  assert.equal(hits.length, 3);
  assert.equal(hits[0].mark, "Mundo");
  assert.equal(hits[1].mark, "mundo");
  assert.equal(hits[0].occurrence, 0);
  assert.equal(hits[1].occurrence, 1);
  assert.equal(hits[2].occurrence, 0);
  assert.equal(hits[0].speaker, null);
  assert.equal(hits[0].day, null);
  assert.equal(hits[0].at, undefined);
  assert.equal(hits[2].day, dayKey(at(2026, 1, 2, 15)));
  assert.equal(hits[2].speaker, null);
});

test("un punto en la consulta no vale como cualquier carácter", () => {
  const hits = searchMatchCards([{ block: 0, text: "axb y a.b", role: "agent", speaker: "Ada" }], "a.b");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].mark, "a.b");
  assert.equal(hits[0].speaker, "Ada");
});

test("el tramo largo se recorta y agrupa por el día que ya trae el mensaje", () => {
  const text = `${"a".repeat(100)}clave${"b".repeat(100)}`;
  const first = at(2026, 1, 2);
  const second = at(2026, 1, 2, 18);
  const third = at(2026, 1, 3);
  const hits = searchMatchCards([
    { block: 0, text, role: "user", speaker: "Ada", at: first },
    { block: 1, text: "clave", role: "agent", speaker: "Bea", at: second },
    { block: 2, text: "clave", role: "user", speaker: null },
    { block: 3, text: "clave", role: "agent", speaker: "Cia", at: third },
  ], "clave");
  assert.equal(hits[0].before.startsWith("…"), true);
  assert.equal(hits[0].after.endsWith("…"), true);
  assert.equal(hits[0].mark, "clave");
  const groups = groupSearchHits(hits);
  assert.deepEqual(groups.map((group) => group.day), [dayKey(first), null, dayKey(third)]);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[0].at, first);
  assert.equal(groups[1].items[0].hit.day, null);
});
