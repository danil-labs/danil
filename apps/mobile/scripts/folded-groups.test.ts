import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeFolded, toggleFolded } from "../src/lib/foldedGroups.ts";

test("decodeFolded lee la lista y descarta lo que no es texto", () => {
  assert.deepEqual(decodeFolded('["a","b"]'), ["a", "b"]);
  assert.deepEqual(decodeFolded('["a",1,null]'), ["a"]);
});

test("decodeFolded devuelve vacío ante nada o ante un guardado roto", () => {
  assert.deepEqual(decodeFolded(null), []);
  assert.deepEqual(decodeFolded(""), []);
  assert.deepEqual(decodeFolded("{no es json"), []);
  assert.deepEqual(decodeFolded('{"a":1}'), []);
});

test("toggleFolded pliega y despliega sin tocar la lista original", () => {
  const start = ["a"];
  assert.deepEqual(toggleFolded(start, "b"), ["a", "b"]);
  assert.deepEqual(toggleFolded(start, "a"), []);
  assert.deepEqual(start, ["a"]);
});
