import assert from "node:assert/strict";
import { test } from "node:test";
import { createdTasks, filtrarTareas, primerasRaices } from "../../../../packages/features/projects/src/model/agentPageFilters.ts";
import type { SessionRow } from "../../../../packages/features/projects/src/screens/Sessions.tsx";

const fila = (id: string, created_at: number, parent: string | null = null, extra: Partial<SessionRow> = {}) =>
  ({ id, created_at, parent, esperando: false, stage: null, ...extra }) as SessionRow;

test("la página corta por tareas raíz y una subtarea vieja sigue con su padre nuevo", () => {
  const rows = [
    fila("vieja", 10),
    fila("nieta", 1, "hija"),
    fila("nueva", 30),
    fila("hija", 2, "nueva"),
    fila("media", 20),
  ];
  const { rows: vistas, quedan } = primerasRaices(rows, 1);
  assert.deepEqual(vistas.map(row => row.id).sort(), ["hija", "nieta", "nueva"]);
  assert.equal(quedan, true);
});

test("sin más raíces que la página no ofrece ver más", () => {
  const rows = [fila("a", 2), fila("b", 1), fila("hija", 0, "a")];
  assert.equal(primerasRaices(rows, 2).quedan, false);
});

test("una hija filtrada sin su padre cuenta como raíz y no se pierde", () => {
  const rows = [fila("hija", 5, "padre-fuera-del-filtro")];
  assert.deepEqual(primerasRaices(rows, 1).rows.map(row => row.id), ["hija"]);
});

test("esperan incluye la que espera una aprobación aunque no haya preguntado", () => {
  const rows = [fila("pregunta", 1, null, { esperando: true }), fila("aprobar", 2), fila("nada", 3)];
  assert.deepEqual(filtrarTareas(rows, "waiting", [], ["aprobar"]).map(row => row.id), ["pregunta", "aprobar"]);
});

test("paginar una delegación independiente conserva sus encargos transitivos", () => {
  const rows = [
    fila("root", 40),
    fila("child", 30, null, { launched_by: "root", pinned: true }),
    fila("grandchild", 20, "child"),
    fila("other", 10),
  ];
  const page = primerasRaices(rows, 1);
  assert.deepEqual(page.rows.map(row => row.id), ["root", "child", "grandchild"]);
  assert.equal(page.quedan, true);
});

test("un ciclo de delegaciones permanece accesible al paginar", () => {
  const rows = [fila("a", 20, null, { launched_by: "b" }), fila("b", 10, "a")];
  assert.deepEqual(primerasRaices(rows, 1).rows.map(row => row.id), ["a", "b"]);
});


test("el agente conserva encargos en otra carpeta y sus descendientes", () => {
  const rows = [
    fila("conversation", 1, null, { chat_de_agente: true, agent: "qa-agent", folder: "A", machine: "m", workspace: "w" }),
    fila("child", 2, null, { launched_by: "conversation", launcher_name: "qa-agent", folder: "B", machine: "m", workspace: "w" }),
    fila("grandchild", 3, null, { launched_by: "child", folder: "B", machine: "m", workspace: "w" }),
    fila("conversation", 1, null, { chat_de_agente: true, agent: "other", folder: "C", machine: "other", workspace: "w" }),
    fila("unrelated", 2, null, { launched_by: "conversation", folder: "C", machine: "other", workspace: "w" }),
  ];
  for (const thread of [null, "conversation"]) {
    assert.deepEqual(createdTasks(rows, "qa-agent", thread, "A").map(row => row.id), ["child", "grandchild"]);
  }
});

test("el nombre del agente solo recupera lanzamientos sin conversación en su carpeta", () => {
  const rows = [
    fila("own", 1, null, { launched_by: "missing", launcher_name: "qa-agent", folder: "A" }),
    fila("other", 2, null, { launched_by: "missing-other", launcher_name: "qa-agent", folder: "B" }),
    fila("child", 3, null, { launched_by: "own", folder: "B" }),
  ];
  assert.deepEqual(createdTasks(rows, "qa-agent", null, "A").map(row => row.id), ["own", "child"]);
  assert.deepEqual(createdTasks(rows, "qa-agent", "missing", "A").map(row => row.id), ["own", "child"]);
});
