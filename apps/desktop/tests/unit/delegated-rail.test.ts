import assert from "node:assert/strict";
import { test } from "node:test";
import { delegatedRailRows } from "../../../../packages/features/projects/src/model/delegatedRail.ts";
import type { SessionRow } from "../../../../packages/features/projects/src/screens/Sessions.tsx";

const fila = (id: string, extra: Partial<SessionRow> = {}) =>
  ({ id, parent: "raiz", esperando: false, stage: null, archived: false, ...extra }) as SessionRow;

test("una subtarea terminada sale del riel aunque el motor la siga devolviendo", () => {
  const rows = [fila("terminada", { archived: true, sin_ver: true }), fila("viva"), fila("quieta")];
  assert.deepEqual(delegatedRailRows(rows, true, ["viva"], []).map(row => row.id), ["viva", "quieta"]);
  assert.deepEqual(delegatedRailRows(rows, false, ["viva"], []).map(row => row.id), ["viva"]);
});
