import assert from "node:assert/strict";
import test from "node:test";
import { CHUNK, chunkIds, chunkOf, tailChunk } from "../../../../packages/features/chat/src/model/threadWindow.ts";

test("abrir uno largo monta sus dos últimos tramos, y el último puede ir a medias", () => {
  const total = 10 * CHUNK + 3;
  const first = tailChunk(total);
  assert.deepEqual(chunkIds(total, first), [9, 10]);
  const shown = chunkIds(total, first).flatMap((id) => chunkOf([...Array(total).keys()], id));
  assert.equal(shown.at(-1), total - 1, "el último bloque siempre está montado");
  assert.ok(shown.length > CHUNK && shown.length <= 2 * CHUNK);
});

test("si el hilo encoge por debajo de lo montado, el último tramo sigue a la vista", () => {
  assert.deepEqual(chunkIds(CHUNK, 4), [0]);
});

test("anteponer páginas del historial no cambia los tramos ya montados", async () => {
  const { chunkStart, headChunk } = await import("../../../../packages/features/chat/src/model/threadWindow.ts");
  const blocks = [...Array(30).keys()];
  const before = chunkIds(blocks.length, 1).map((id) => [id, chunkOf(blocks, id)]);
  // Entran 35 bloques por delante: los de antes conservan su id y su contenido.
  const grown = [...Array(35).keys()].map((n) => -35 + n).concat(blocks);
  for (const [id, shown] of before) assert.deepEqual(chunkOf(grown, id as number, 35), shown);
  assert.equal(headChunk(35), -4);
  assert.deepEqual(chunkOf(grown, -4, 35), grown.slice(0, 5));
  assert.equal(chunkStart(-4, 35), 0);
  assert.deepEqual(chunkIds(grown.length, -10, 35), [-4, -3, -2, -1, 0, 1, 2]);
});
