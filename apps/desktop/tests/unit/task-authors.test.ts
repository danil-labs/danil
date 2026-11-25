import assert from "node:assert/strict";
import test from "node:test";

const { authorKey, authorKeys, isSubtask } = await import(
  "../../../../packages/features/projects/src/model/taskAuthors.ts"
);

// El orden de los grupos salía de la primera aparición de cada autor en una
// lista que va de la tarea más nueva a la más vieja: crear una tarea con un
// agente subía su grupo al tope y bajaba «Mis tareas».
const user = { launched_by: null };
const ana = { launched_by: "chat-a", launcher_name: "Ana" };
const beto = { launched_by: "chat-b", launcher_name: "Beto" };
const huerfana = { launched_by: "chat-x", launcher_name: null };
const sinDato = {};

test("el autor de una tarea sale de quién la lanzó", () => {
  assert.equal(authorKey(user), "user");
  assert.equal(authorKey(ana), "agent:Ana");
  assert.equal(authorKey(huerfana), "agent");
  assert.equal(authorKey(sinDato), "unknown");
  assert.equal(
    authorKey({ parent: "p", parent_agent: "Revisor" }),
    "agent:Revisor",
  );
});

test("Mis tareas va arriba aunque su tarea sea la más vieja", () => {
  assert.deepEqual(authorKeys([beto, ana, user]), [
    "user",
    "agent:Ana",
    "agent:Beto",
  ]);
});

test("el orden de los grupos de agente no sigue al de las tareas", () => {
  assert.deepEqual(
    authorKeys([beto, ana, user]),
    authorKeys([user, ana, beto]),
  );
});

test("los grupos sin autor resoluble van al final", () => {
  assert.deepEqual(authorKeys([sinDato, huerfana, ana, user]), [
    "user",
    "agent:Ana",
    "agent",
    "unknown",
  ]);
});

// Con el agrupado por encargado —el del riel y la vista del proyecto— el grupo
// no sale de quién lanzó sino del encargado, y el que no tiene ninguno es
// «Mis tareas». Sin esta rama, esa tarea caería en `unknown` y su grupo se iría
// al final.
test("con el agrupado por encargado, el grupo sale del encargado", () => {
  assert.equal(authorKey({ agent: "Ana" }, true), "agent:Ana");
  assert.equal(
    authorKey({ agent: null, launched_by: null }, true),
    "unassigned",
  );
});

test("con el agrupado por encargado, Mis tareas va arriba", () => {
  assert.deepEqual(
    authorKeys(
      [{ agent: "Beto" }, { agent: null }, { agent: "Ana" }],
      true,
    ),
    ["unassigned", "agent:Ana", "agent:Beto"],
  );
});

// El riel enseña solo lo que abrió la persona: una subtarea es de su madre, esté
// o no en la lista (archivada, en otra carpeta o sin cargar).
test("una subtarea lo es por su lanzador, no porque el lanzador esté a la vista", () => {
  assert.equal(isSubtask({ launched_by: "chat-a", launcher_available: true }), true);
  assert.equal(isSubtask({ launched_by: "chat-a", launcher_available: false }), true);
  assert.equal(isSubtask({ parent: "chat-a" }), true);
  assert.equal(isSubtask({ remote_launcher: "vm~coord" }), true);
  assert.equal(isSubtask({ launched_by: null }), false);
  assert.equal(isSubtask({}), false);
});
