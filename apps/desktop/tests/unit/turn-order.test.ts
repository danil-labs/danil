/**
 * Que una tarea reabierta enseñe el turno en el orden en que ocurrió.
 *
 * `transcripcion()` es lo único que traduce lo guardado a lo que se pinta.
 * Se afirma sobre la secuencia de mensajes, que es lo que `bloques()` agrupa
 * después en sus pliegues.
 */

import assert from "node:assert/strict";
import test from "node:test";

import "../helpers/catalog.ts";
import { cuentaDelTramo } from "../../src/lib/steps.ts";
import { transcripcion, type Turn } from "../../src/features/chat/transcript.ts";

const leer = { name: "Read", target: "a.txt", ok: true };

/** Un turno del agente que habló, leyó un archivo y volvió a hablar. */
const conOrden: Turn = {
  role: "agent",
  id: "t1",
  text: "Voy a leerlo.\n\nListo.",
  tools: [leer],
  pieces: [{ text: "Voy a leerlo." }, { tool: 0 }, { text: "\n\nListo." }],
  duration_ms: 1200,
  questions: null,
  artifacts: null,
};

test("un turno guardado con su orden se pinta en ese orden", () => {
  const msgs = transcripcion([conOrden]);
  assert.deepEqual(
    msgs.map((m) => [m.role, m.meta ?? null, m.text]),
    [
      ["agent", null, "Voy a leerlo."],
      ["system", "usó", "Read"],
      ["agent", null, "Listo."],
    ],
  );
});

test("los mensajes seguidos tras la última herramienta son una sola respuesta", () => {
  const msgs = transcripcion([
    {
      ...conOrden,
      text: "Voy a leerlo.\n\nListo.\n\nCommit abc.",
      pieces: [{ text: "Voy a leerlo." }, { tool: 0 }, { text: "Listo." }, { text: "Commit abc." }],
    },
  ]).filter((m) => m.role === "agent");
  assert.deepEqual(
    msgs.map((m) => [m.text, m.avanceDe ?? null]),
    [
      ["Voy a leerlo.", "t1"],
      ["Listo.\n\nCommit abc.", null],
    ],
  );
});

test("lo que arrastra el turno va solo en su último mensaje", () => {
  const msgs = transcripcion([{ ...conOrden, code: [], artifacts: [] }]).filter(
    (m) => m.role === "agent",
  );
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].turno, undefined);
  assert.equal(msgs[0].duration_ms, undefined);
  assert.equal(msgs[1].turno, "t1");
  assert.equal(msgs[1].duration_ms, 1200);
});

// El campo es opcional y su ausencia significa «no se registró». Una
// transcripción escrita antes de que existiera tiene que seguir leyéndose,
// con el rastro delante como siempre.
test("un turno sin orden registrado se pinta como antes", () => {
  const { pieces: _pieces, ...sinOrden } = conOrden;
  assert.deepEqual(
    transcripcion([sinOrden]).map((m) => [m.role, m.text]),
    [
      ["system", "Read"],
      ["agent", "Voy a leerlo.\n\nListo."],
    ],
  );
});

test("el mecanismo de preguntas no sale como paso", () => {
  const msgs = transcripcion([
    {
      ...conOrden,
      tools: [{ name: "Write", target: "/tmp/x/.preguntas.json", ok: true }],
    },
  ]);
  assert.deepEqual(
    msgs.map((m) => m.role),
    ["agent", "agent"],
  );
});

test("el razonamiento se coloca por before_piece, entre los mensajes", () => {
  const msgs = transcripcion([
    {
      ...conOrden,
      reasoning: [
        { text: "Pienso el encargo.", before_piece: 0, duration_ms: 2000 },
        { text: "Sigo pensando tras hablar.", before_piece: 1, duration_ms: 500 },
        { text: "Reviso el resultado.", before_piece: 2, duration_ms: 1000 },
      ],
    },
  ]);
  assert.deepEqual(
    msgs.map((m) => [m.role, m.text, m.razonamiento?.map((b) => b.text) ?? []]),
    [
      ["agent", "Voy a leerlo.", ["Pienso el encargo.", "Sigo pensando tras hablar."]],
      ["system", "Read", []],
      ["agent", "Listo.", ["Reviso el resultado."]],
    ],
  );
  assert.equal(msgs[0].razonamiento?.[0]?.durationMs, 2000);
  assert.equal(msgs[0].razonamiento?.[1]?.durationMs, 500);
  assert.equal(msgs[2].razonamiento?.[0]?.durationMs, 1000);
});

test("un turno que sólo pensó no se descarta", () => {
  const msgs = transcripcion([
    {
      role: "agent",
      id: "t1",
      text: "",
      duration_ms: 3000,
      reasoning: [{ text: "Le doy vueltas.", before_piece: 0, duration_ms: 3000 }],
    },
  ]);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].role, "agent");
  assert.equal(msgs[0].text, "");
  assert.deepEqual(msgs[0].razonamiento?.map((b) => b.text), ["Le doy vueltas."]);
});

test("sin reasoning la transcripción produce los mismos mensajes que antes", () => {
  const antes = transcripcion([conOrden]);
  const despues = transcripcion([{ ...conOrden, reasoning: null }]);
  assert.deepEqual(despues, antes);
  assert.ok(despues.every((m) => m.razonamiento === undefined));
});

test("el razonamiento no entra al texto ni cambia el tramo ni la duración", () => {
  const con = transcripcion([
    {
      ...conOrden,
      reasoning: [{ text: "Esto no es una respuesta.", before_piece: 0, duration_ms: 2000 }],
    },
  ]);
  const sin = transcripcion([conOrden]);
  assert.ok(con.every((m) => !m.text.includes("Esto no es una respuesta.")));
  const pasos = (msgs: typeof con) => msgs.flatMap((m) => (m.paso ? [m.paso] : []));
  assert.equal(cuentaDelTramo(pasos(con)), cuentaDelTramo(pasos(sin)));
  assert.equal(con.at(-1)?.duration_ms, 1200);
});
