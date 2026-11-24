/**
 * Un turno que lanza varias subtareas y recibe un mensaje para una de ellas no
 * pinta nada dos veces. El motor guarda el turno en tramos (antes de cada
 * lanzamiento y antes del mensaje metido); releer la tarea con el turno
 * corriendo traía esos tramos del disco y los dejaba también en lo vivo.
 */

import assert from "node:assert/strict";
import test from "node:test";

import "../helpers/catalog.ts";
import type { Msg } from "../../../../packages/features/chat/src/screens/Chat.tsx";
import { ponerLanzamiento } from "../../../../packages/features/chat/src/model/launchGroups.ts";
import {
  anexarDelta,
  mensajesDelHilo,
  relevoDe,
  tramoGuardado,
  transcripcion,
  type Turn,
} from "../../../../packages/features/chat/src/model/transcript.ts";

const tarea = (n: number) => ({ folder: "p", task: `hija${n}`, title: `Hija ${n}`, agent: "claude", provider: "claude" });
const lanzada = (n: number): Msg => ({ role: "system", text: "", meta: "task_launched", fromTask: tarea(n), turno: `l${n}` });
const paso = (): Msg => ({ role: "system", text: "Agent", meta: "usó" });
const relevo = (titulo: string, texto: string) =>
  `[Mensaje para tu subagente «${titulo}»]\nRetómalo con SendMessage usando to: "af0e294546386cdd6" y pásale esto tal cual:\n\n${texto}\n\nNo hagas tú su trabajo. Cuando conteste, resume en una línea qué dijo.`;

const PLAN = "Me parece un plan mejor que el mío.";
const ESPERA = "Los tres agentes están trabajando.";

/** Lo vivo del turno tal como lo arman los eventos, con los `segment_saved` del motor. */
function vivoDelTurno(): Msg[] {
  let vivo: Msg[] = [];
  vivo = anexarDelta(vivo, { text: PLAN, author: null });
  for (const n of [1, 2, 3]) {
    vivo = [...vivo, paso(), lanzada(n)];
    vivo = tramoGuardado(vivo, `s${n}`);
  }
  vivo = anexarDelta(vivo, { text: ESPERA, author: null });
  // La persona escribe a la hija 1: el motor guarda lo dicho y mete el mensaje.
  return tramoGuardado(vivo, "s4");
}

/** Lo que el motor dejó en disco para ese mismo turno. */
const enDisco: Turn[] = [
  { role: "user", text: "Arma el taller.", id: "u1" },
  { role: "agent", text: PLAN, id: "s1", tools: [{ name: "Agent", target: null }] },
  { role: "system", text: "", meta: "task_launched", from_task: tarea(1), id: "l1" },
  { role: "agent", text: "", id: "s2", tools: [{ name: "Agent", target: null }] },
  { role: "system", text: "", meta: "task_launched", from_task: tarea(2), id: "l2" },
  { role: "agent", text: "", id: "s3", tools: [{ name: "Agent", target: null }] },
  { role: "system", text: "", meta: "task_launched", from_task: tarea(3), id: "l3" },
  { role: "agent", text: ESPERA, id: "s4" },
  { role: "user", text: relevo("Hija 1", "Usa cuatro piezas."), id: "u2" },
] as Turn[];

const ids = (turns: Turn[]) => new Set(turns.flatMap((t) => (t.id ? [t.id] : [])));
const veces = (msgs: Msg[], texto: string) => msgs.filter((m) => m.text === texto).length;

test("releer con el turno corriendo no repite lo que el motor ya guardó en tramos", () => {
  const vivo = vivoDelTurno();
  const pintado = mensajesDelHilo({ base: transcripcion(enDisco), vivo, guardados: ids(enDisco) });
  assert.equal(veces(pintado, PLAN), 1);
  assert.equal(veces(pintado, ESPERA), 1);
  assert.equal(pintado.filter((m) => m.meta === "task_launched").length, 3);
  assert.equal(pintado.at(-1)?.role, "user");
});

test("lo que el disco aún no trae sigue viéndose desde lo vivo", () => {
  const vivo = vivoDelTurno();
  const pintado = mensajesDelHilo({ base: transcripcion(enDisco.slice(0, 3)), vivo, guardados: ids(enDisco.slice(0, 3)) });
  assert.equal(veces(pintado, PLAN), 1);
  assert.equal(veces(pintado, ESPERA), 1);
});

test("lo que el agente dice después del mensaje abre su globo y no se esconde con el tramo", () => {
  const vivo = anexarDelta(vivoDelTurno(), { text: "Le pasé el mensaje.", author: null });
  const pintado = mensajesDelHilo({ base: transcripcion(enDisco), vivo, guardados: ids(enDisco) });
  assert.equal(pintado.at(-1)?.text, "Le pasé el mensaje.");
  assert.equal(pintado.at(-2)?.role, "user");
});

test("el mensaje para una subtarea se lee sin el encargo para el CLI", () => {
  const usuario = transcripcion(enDisco).at(-1);
  assert.equal(usuario?.text, "Usa cuatro piezas.");
  assert.deepEqual(usuario?.relevo, { titulo: "Hija 1" });
  const codex = relevoDe(
    `[Mensaje para tu subagente «Kit»]\nRetómalo con resume_agent si hace falta y usa send_input con id: "019a". Pásale esto tal cual y espera su resultado:\n\nOtra cosa.`,
  );
  assert.deepEqual(codex, { titulo: "Kit", texto: "Otra cosa." });
  assert.equal(relevoDe("Hola"), null);
});

type B = { tipo: "msg" | "pasos" | "trabajo"; pasos?: string[]; nombre: string };
const esLanzada = (b: B) => b.nombre.startsWith("L");

test("las subtareas de un turno quedan en un solo «Tareas creadas»", () => {
  const out: B[] = [{ tipo: "trabajo", pasos: ["Read"], nombre: "texto" }, { tipo: "pasos", pasos: ["Agent1"], nombre: "p1" }];
  ponerLanzamiento(out, { tipo: "msg", nombre: "L1" }, esLanzada);
  out.push({ tipo: "pasos", pasos: ["Agent2"], nombre: "p2" });
  ponerLanzamiento(out, { tipo: "msg", nombre: "L2" }, esLanzada);
  out.push({ tipo: "pasos", pasos: ["Agent3"], nombre: "p3" });
  ponerLanzamiento(out, { tipo: "msg", nombre: "L3" }, esLanzada);
  assert.deepEqual(out.map((b) => b.nombre), ["texto", "p1", "L1", "L2", "L3"]);
  assert.deepEqual(out[1].pasos, ["Agent1", "Agent2", "Agent3"]);
});

test("sin rastro delante, los pasos de en medio van delante del grupo", () => {
  const out: B[] = [{ tipo: "msg", nombre: "persona" }, { tipo: "msg", nombre: "L1" }, { tipo: "pasos", pasos: ["Agent2"], nombre: "p2" }];
  ponerLanzamiento(out, { tipo: "msg", nombre: "L2" }, esLanzada);
  assert.deepEqual(out.map((b) => b.nombre), ["persona", "p2", "L1", "L2"]);
});

// Un motor que no devuelve el turno metido (`inject_message` → `null`): el globo
// vivo no tiene id, y releer a mitad del turno lo traía también del disco.
const metido = (text: string, tras: string | null): Msg => ({ role: "user", text, inyectado: { tras } });

test("lo metido sin id no sale dos veces cuando el disco ya lo trae", () => {
  const disco = [...enDisco, { role: "user", text: "Cambia de rumbo.", id: "u3" }] as Turn[];
  const pintado = mensajesDelHilo({ base: transcripcion(disco), vivo: [metido("Cambia de rumbo.", "u2")], guardados: ids(disco) });
  assert.equal(veces(pintado, "Cambia de rumbo."), 1);
  assert.equal(pintado.at(-1)?.turno, "u3");
});

test("lo metido sin id sigue viéndose mientras el disco no lo trae", () => {
  const pintado = mensajesDelHilo({ base: transcripcion(enDisco), vivo: [metido("Cambia de rumbo.", "u2")], guardados: ids(enDisco) });
  assert.equal(veces(pintado, "Cambia de rumbo."), 1);
  assert.equal(pintado.at(-1)?.inyectado?.tras, "u2");
});

test("lo metido sin id no se confunde con un mensaje igual de antes ni cuenta un guardado dos veces", () => {
  const disco = [
    { role: "user", text: "sí", id: "u1" },
    { role: "agent", text: "Sigo.", id: "a1" },
    { role: "user", text: "sí", id: "u2" },
  ] as Turn[];
  const vivo = [metido("sí", "a1"), metido("sí", "a1")];
  const pintado = mensajesDelHilo({ base: transcripcion(disco), vivo, guardados: ids(disco) });
  assert.equal(veces(pintado, "sí"), 3);
  assert.equal(pintado.filter((m) => m.inyectado).length, 1);
});
