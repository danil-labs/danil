import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTaskTree, delegatedOf, flattenTasks, REMOTE_CHILD_FEATURE, remoteLauncherOf, taskDescendants, withRemoteLaunchers, type RemoteScope } from "../src/lib/tasks.ts";

// El panel del escritorio: la Mac es la ventana (ids sueltos); la VM lleva prefijo.
const panel = (features: Record<string, string[]>): RemoteScope => ({
  announces: (machine) => (features[machine ?? "mac"] ?? []).includes(REMOTE_CHILD_FEATURE),
  idOf: (machine, task) => (machine === "mac" ? task : `${machine}~${task}`),
});
const on = panel({ mac: [REMOTE_CHILD_FEATURE], vm: [REMOTE_CHILD_FEATURE] });
const off = panel({ mac: [REMOTE_CHILD_FEATURE], vm: [] });

const coordinador = { id: "coord", created_at: 3 };
const hija = { id: "vm~hija", created_at: 2, machine: "vm", remote_parent: { machine: "mac", workspace: "w", task: "coord", request_id: "r1" } };
const nieta = { id: "vm~nieta", created_at: 1, machine: "vm", launched_by: "vm~hija", launcher_available: true };

test("la hija remota se identifica por máquina y tarea del coordinador", () => {
  assert.equal(remoteLauncherOf(hija, on), "coord");
  assert.equal(remoteLauncherOf({ ...hija, machine: null, remote_parent: { machine: "vm", task: "t" } }, on), "vm~t");
  assert.equal(remoteLauncherOf({ ...hija, remote_parent: { machine: "", task: "t" } }, on), null, "sin máquina no se entiende");
  assert.equal(remoteLauncherOf({ ...hija, remote_parent: "coord" }, on), null);
});

test("sin `remote_child_v1` en la máquina de la hija nada cambia", () => {
  assert.equal(remoteLauncherOf(hija, off), null);
  const [fila] = withRemoteLaunchers([hija], off);
  assert.equal(fila, hija, "la misma fila");
  assert.deepEqual(flattenTasks({ p: withRemoteLaunchers([coordinador, hija], off) }).map((t) => t.row.id), ["coord", "vm~hija"]);
});

test("un motor viejo (sin `remote_parent`) sale igual", () => {
  const rows = [coordinador, { id: "vm~x", created_at: 1, machine: "vm" }];
  assert.deepEqual(withRemoteLaunchers(rows, on), rows);
});

test("el riel no la enseña aunque el coordinador esté en otra carpeta; sale al buscar o fijada", () => {
  const byProject = { a: [coordinador], b: withRemoteLaunchers([hija], on) };
  assert.deepEqual(flattenTasks(byProject).map((t) => t.row.id), ["coord"]);
  assert.deepEqual(flattenTasks(byProject, true).map((t) => t.row.id), ["coord", "vm~hija"]);
  const fijada = { a: [coordinador], b: withRemoteLaunchers([{ ...hija, pinned: true }], on) };
  assert.deepEqual(flattenTasks(fijada).map((t) => t.row.id), ["coord", "vm~hija"]);
  const sinCoordinador = { b: withRemoteLaunchers([hija], on) };
  assert.deepEqual(flattenTasks(sinCoordinador).map((t) => t.row.id), [], "sin coordinador a la vista tampoco sube");
});

test("en la vista de subtareas cuelga del coordinador, con sus propias delegadas debajo", () => {
  const rows = withRemoteLaunchers([coordinador, hija, nieta], on);
  const tree = buildTaskTree(rows);
  assert.deepEqual(tree.map((b) => b.tarea.id), ["coord"]);
  assert.deepEqual(tree[0].hijas.map((b) => b.tarea.id), ["vm~hija"]);
  assert.deepEqual(tree[0].hijas[0].hijas.map((b) => b.tarea.id), ["vm~nieta"]);
  assert.deepEqual(taskDescendants(rows, [coordinador]).map((r) => r.id), ["vm~hija", "vm~nieta"]);
  assert.deepEqual(delegatedOf(rows, "coord").map((r) => r.id), ["vm~hija"]);
});

test("sin la función, el árbol no la cuelga del coordinador", () => {
  const tree = buildTaskTree(withRemoteLaunchers([coordinador, hija], off));
  assert.deepEqual(tree.map((b) => [b.tarea.id, b.hijas.length]), [["coord", 0], ["vm~hija", 0]]);
});

test("la web (sin ventana) y el teléfono (`host/id`) resuelven igual con su propio id", () => {
  const web: RemoteScope = { announces: () => true, idOf: (m, t) => `${m}~${t}` };
  const rows = withRemoteLaunchers([{ ...coordinador, id: "mac~coord", machine: "mac" }, hija], web);
  assert.deepEqual(flattenTasks({ p: rows }).map((t) => t.row.id), ["mac~coord"]);
  const phone: RemoteScope = { announces: () => true, idOf: (m, t) => `${m}/${t}` };
  assert.equal(remoteLauncherOf(hija, phone), "mac/coord");
});
