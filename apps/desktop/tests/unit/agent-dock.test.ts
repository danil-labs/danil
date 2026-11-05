import assert from "node:assert/strict";
import { test } from "node:test";
import { agentFolder, type DockAgent, dockCapacity, dockSources, orderDockAgents, planDock } from "../../src/features/shell/dockLayout.ts";

const agente = (name: string, status?: DockAgent["status"]): DockAgent => ({ name, status, liveTasks: 0 });
const nombres = (lista: { name: string }[]) => lista.map((a) => a.name);

test("el dock pone primero a quien trabaja, luego despiertos y dormidos, por nombre visible", () => {
  const lista = [
    agente("zeta", "asleep"),
    agente("beta", "awake"),
    agente("sin-estado"),
    agente("omega", "working"),
    agente("alfa", "working"),
    agente("Ana", "awake"),
  ];
  assert.deepEqual(nombres(orderDockAgents(lista)), ["alfa", "omega", "Ana", "beta", "sin-estado", "zeta"]);
  const visibles: Record<string, string> = { omega: "Abeja" };
  assert.deepEqual(
    nombres(orderDockAgents(lista, (a) => visibles[a.name] ?? a.name)).slice(0, 2),
    ["omega", "alfa"],
  );
});

test("los agentes ocultos en su perfil no entran en el dock", () => {
  const lista = [agente("ada", "working"), agente("bob", "asleep")];
  assert.deepEqual(nombres(orderDockAgents(lista, undefined, (a) => a.name === "ada")), ["bob"]);
});

test("la capacidad cuenta huecos de 26 px con 6 de separación", () => {
  assert.equal(dockCapacity(26), 1);
  assert.equal(dockCapacity(57), 1);
  assert.equal(dockCapacity(58), 2);
  assert.equal(dockCapacity(224), 7);
  assert.equal(dockCapacity(0), 7);
});

test("si no caben todos, el último hueco libre es «+k» y el «+» de nuevo agente ocupa uno", () => {
  const lista = ["a", "b", "c", "d", "e"].map((n) => agente(n));
  assert.deepEqual(planDock(lista, 6, { hasNew: true }), { shown: lista, overflow: 0 });
  const justo = planDock(lista, 5, { hasNew: true });
  assert.deepEqual(nombres(justo.shown), ["a", "b", "c"]);
  assert.equal(justo.overflow, 2);
  const sinNuevo = planDock(lista, 4);
  assert.deepEqual(nombres(sinNuevo.shown), ["a", "b", "c"]);
  assert.equal(sinNuevo.overflow, 2);
  assert.deepEqual(planDock(lista, 1, { hasNew: true }), { shown: [], overflow: 5 });
});

test("el agente elegido nunca queda escondido detrás de «+k»", () => {
  const lista = ["a", "b", "c", "d", "e"].map((n) => agente(n));
  const plan = planDock(lista, 4, { selected: "e" });
  assert.deepEqual(nombres(plan.shown), ["a", "b", "e"]);
  assert.equal(plan.overflow, 2);
});

test("el chat con un agente se abre en la carpeta de lo abierto, en la única que lo tiene, o se pregunta", () => {
  assert.equal(agentFolder(["web", "terminus"], "terminus"), "terminus");
  assert.equal(agentFolder(["web"], "terminus"), "web");
  assert.equal(agentFolder(["web"], null), "web");
  assert.equal(agentFolder(["web", "terminus"], "otra"), null);
  assert.equal(agentFolder(["web", "terminus"], null), null);
  assert.equal(agentFolder([], "web"), null);
});

test("los agentes se piden a cada máquina donde la carpeta tiene tareas, una vez por par", () => {
  const fuentes = dockSources([
    { project: "app", row: { machine: "vm-1" } },
    { project: "app", row: { machine: "vm-1" } },
    { project: "app", row: {} },
    { project: "web", row: { machine: null } },
    { project: "", row: { machine: "vm-1" } },
  ]);
  assert.deepEqual(fuentes, [
    { project: "app", machine: "" },
    { project: "app", machine: "vm-1" },
    { project: "web", machine: "" },
  ]);
});
