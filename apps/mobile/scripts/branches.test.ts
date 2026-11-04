import assert from "node:assert/strict";
import { test } from "node:test";
import { branchChoices } from "../src/lib/engine.ts";

test("remote booleano del motor sale como texto o null, nunca como booleano", () => {
  const list = branchChoices({
    selected: "refs/heads/main",
    branches: [
      { reference: "refs/heads/main", name: "main", remote: false, commit: "abc", ahead: null, behind: null },
      { reference: "refs/remotes/origin/dev", name: "origin/dev", remote: true, commit: "def", ahead: 0, behind: 1 },
    ],
  });
  assert.equal(list.selected, "refs/heads/main");
  assert.deepEqual(list.branches[0], { reference: "refs/heads/main", name: "main", remote: false, detail: null });
  assert.deepEqual(list.branches[1], { reference: "refs/remotes/origin/dev", name: "origin/dev", remote: true, detail: "origin" });
  assert.equal(typeof list.branches[1].detail, "string");
});

test("un remoto escrito como texto sigue siendo texto", () => {
  const list = branchChoices({
    branches: [{ reference: "refs/remotes/origin/dev", name: "origin/dev", remote: "origin" }],
    selected: null,
  });
  assert.equal(list.branches[0].detail, "origin");
  assert.equal(list.branches[0].remote, true);
});

test("descarta filas sin referencia y un selected que no es texto", () => {
  const list = branchChoices({ branches: [null, { name: "main", remote: false }, { reference: "refs/heads/main", remote: false }], selected: 1 });
  assert.equal(list.branches.length, 1);
  assert.equal(list.branches[0].detail, null);
  assert.equal(list.selected, null);
});
