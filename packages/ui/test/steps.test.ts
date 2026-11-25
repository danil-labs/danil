import assert from "node:assert/strict";
import { test } from "node:test";
import { isQuestionFile, joinSteps, stepCounts } from "../src/lib/chat/steps.ts";

const kindOf = (step: { kind: string }) => step.kind;

test("los pasos seguidos de la misma clase son una fila y un comando nunca se junta", () => {
  const rows = joinSteps([{ kind: "read" }, { kind: "read" }, { kind: "run" }, { kind: "run" }, { kind: "read" }], kindOf);
  assert.deepEqual(rows.map((r) => [r.kind, r.steps.length]), [["read", 2], ["run", 1], ["run", 1], ["read", 1]]);
});

test("una decisión de permiso tampoco se junta con otra", () => {
  assert.equal(joinSteps([{ kind: "permission" }, { kind: "permission" }], kindOf).length, 2);
});

test("`canJoin` decide por encima de la clase: la regla propia de cada cliente", () => {
  const steps = [{ kind: "leer", body: null }, { kind: "leer", body: "salida" }, { kind: "leer", body: null }];
  const rows = joinSteps(steps, kindOf, (_kind, step, row) => step.body === null && row.every((s) => s.body === null));
  assert.deepEqual(rows.map((r) => r.steps.length), [1, 1, 1]);
});

test("las cuentas salen en orden de lectura, sin las vacías", () => {
  const counts = stepCounts([
    { kind: "run", target: "a" },
    { kind: "read", target: "x" },
    { kind: "permission", target: "b", allowed: true },
    { kind: "permission", target: "c", allowed: false },
    { kind: "permission", target: "d", allowed: false },
  ]);
  assert.deepEqual(counts, [{ kind: "read", count: 1 }, { kind: "run", count: 1 }, { kind: "allowed", count: 1 }, { kind: "denied", count: 2 }]);
});

test("varias ediciones del mismo archivo son un archivo; sin objetivo, cada una cuenta", () => {
  const counts = stepCounts([{ kind: "edit", target: "a.ts" }, { kind: "edit", target: "a.ts" }, { kind: "edit", target: null }, { kind: "edit", target: null }]);
  assert.deepEqual(counts, [{ kind: "edit", count: 3 }]);
});

test("lo que el agente pregunta por archivo no es un paso", () => {
  assert.equal(isQuestionFile("/repo/.preguntas.json"), true);
  assert.equal(isQuestionFile("/repo/a.ts"), false);
  assert.equal(isQuestionFile(null), false);
});
