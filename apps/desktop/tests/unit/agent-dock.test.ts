import assert from "node:assert/strict";
import { test } from "node:test";
import { agentFolder, type DockAgent, dockCapacity, dockSources, orderDockAgents, planDock } from "../../../../packages/ui/src/lib/tasks/index.ts";
import { dockColumns, pageDock } from "../../../../packages/shell/src/shell/dockPagination.ts";

const agente = (name: string, status?: DockAgent["status"]): DockAgent => ({ name, status, liveTasks: 0 });
const nombres = (lista: { name: string }[]) => lista.map((a) => a.name);

test("paginar permite alcanzar todos los agentes una vez, con cinco como máximo por fila", () => {
  const roster = Array.from({ length: 14 }, (_, index) => agente(`agente-${index}`));
  const pages = Array.from({ length: pageDock(roster, 0).pages }, (_, index) => pageDock(roster, index));
  assert.deepEqual(pages.map(page => page.shown.length), [5, 5, 4]);
  assert.deepEqual(pages.flatMap(page => nombres(page.shown)), nombres(roster));
});

test("si se borra la última página, la paginación vuelve a una página que tiene agentes", () => {
  const roster = Array.from({ length: 6 }, (_, index) => agente(`agente-${index}`));
  assert.deepEqual(nombres(pageDock(roster, 1).shown), ["agente-5"]);
  const reduced = pageDock(roster.slice(0, 5), 1);
  assert.equal(reduced.page, 0);
  assert.deepEqual(nombres(reduced.shown), nombres(roster.slice(0, 5)));
  assert.equal(pageDock([], 7).pages, 1);
  assert.deepEqual(pageDock([], 7).shown, []);
});

test("un sidebar más ancho mete más agentes en la fila y el hueco entre ellos no cambia", () => {
  assert.equal(dockColumns(0), 5);
  assert.equal(dockColumns(40), 1);
  assert.equal(dockColumns(84), 2);
  assert.equal(dockColumns(236), 5);
  assert.equal(dockColumns(396), 9);
  const roster = Array.from({ length: 14 }, (_, index) => agente(`agente-${index}`));
  assert.equal(pageDock(roster, 0, dockColumns(396)).shown.length, 9);
  assert.deepEqual(nombres(pageDock(roster, 1, 9).shown), nombres(roster.slice(9)));
  assert.equal(pageDock(roster, 0).shown.length, 5);
});

test("la actividad fuera de página sigue señalada sin contar despiertos como trabajando", () => {
  const roster = Array.from({ length: 12 }, (_, index) => agente(`agente-${index}`, "awake"));
  assert.equal(pageDock(roster, 1).workingBefore, false);
  assert.equal(pageDock(roster, 1).workingAfter, false);
  roster[0] = agente("primero", "working");
  roster[11] = agente("ultimo", "working");
  const middle = pageDock(roster, 1);
  assert.equal(middle.workingBefore, true);
  assert.equal(middle.workingAfter, true);
  assert.equal(middle.shown.some(agent => agent.status === "working"), false);
});

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
