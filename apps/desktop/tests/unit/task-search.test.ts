import assert from "node:assert/strict";
import test from "node:test";
import { matchesTaskQuery } from "../../../../packages/features/projects/src/model/taskSearch.ts";

const fields = ["Revisar la sesión de QA", "feat/excalidraw", null, "tech-lead"];

test("accents and case do not matter, in the query or in the task", () => {
  assert.equal(matchesTaskQuery(fields, "SESION"), true);
  assert.equal(matchesTaskQuery(["Sesion sin acento"], "sesión"), true);
});

test("every word must appear, in any field and any order", () => {
  assert.equal(matchesTaskQuery(fields, "excalidraw tech"), true);
  assert.equal(matchesTaskQuery(fields, "qa revisar"), true);
  assert.equal(matchesTaskQuery(fields, "excalidraw windows"), false);
});

test("an empty query matches everything and a missing field matches nothing", () => {
  assert.equal(matchesTaskQuery([], "   "), true);
  assert.equal(matchesTaskQuery([null, undefined], "algo"), false);
});
