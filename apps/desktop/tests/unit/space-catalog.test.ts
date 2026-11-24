import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildInitialSeed,
  canonicalRef,
  projectCatalogSessions,
  projectCatalogSpaces,
} from "../../../../packages/shell/src/app/space-catalog.ts";

test("canonicalRef strips machine prefix and rejects invalid references", () => {
  assert.equal(canonicalRef("cmp_mac~task_123"), "task_123");
  assert.equal(canonicalRef("task_123"), "task_123");
  assert.equal(canonicalRef("cmp_vm~sp_abc-1"), "sp_abc-1");
  assert.equal(canonicalRef(""), null);
  assert.equal(canonicalRef(null), null);
  assert.equal(canonicalRef("bad id with spaces"), null);
});

test("projectCatalogSpaces returns authoritative catalog spaces without resurrecting engine rows", () => {
  const catalog = {
    version: 2,
    spaces: [
      { id: "sp_1", name: "Trabajo", folders: ["p1", "p2"] },
      { id: "sp_2", name: "Personal", folders: [] },
    ],
    order: ["sp_2", "sp_1"],
    task_spaces: {},
  };
  const raw = [
    { id: "sp_deleted", name: "Viejo", folders: ["p9"], created_at: 1, updated_at: 1, account: true },
    { id: "sp_1", name: "LocalName", folders: ["p99"], created_at: 1, updated_at: 1, account: true },
  ];

  const projected = projectCatalogSpaces(catalog, raw);
  assert.deepEqual(
    projected.map((s) => ({ id: s.id, name: s.name, folders: s.folders, account: s.account })),
    [
      { id: "sp_1", name: "Trabajo", folders: ["p1", "p2"], account: true },
      { id: "sp_2", name: "Personal", folders: [], account: true },
    ],
  );

  // Empty or absent catalog falls back to engine rows.
  assert.deepEqual(projectCatalogSpaces(undefined, raw), raw);
  assert.deepEqual(projectCatalogSpaces({ version: 0, spaces: [], order: [], task_spaces: {} }, raw), raw);
});

test("projectCatalogSessions maps task_spaces across machines, honors optimistic pending overrides, and inherits parent space", () => {
  const catalog = {
    version: 4,
    spaces: [
      { id: "sp_a", name: "A", folders: [] },
      { id: "sp_b", name: "B", folders: [] },
    ],
    order: ["sp_b", "sp_a"],
    task_spaces: {
      t1: "sp_a",
      t_parent: "sp_a",
      t_stale: "sp_deleted",
    },
  };
  const sesiones = {
    "": [
      { id: "cmp_vm~t1", space: "local_engine_space", parent: null },
      { id: "cmp_mac~t_parent", space: "local_engine_space", parent: null },
      { id: "cmp_mac~t_child", space: "local_engine_space", parent: "cmp_mac~t_parent" },
      { id: "t_unassigned", space: "local_engine_space", parent: null },
      { id: "t_stale", space: "sp_deleted", parent: null },
      { id: "cmp_vm~t_optimistic", space: "local_engine_space", parent: null },
    ],
  };

  const projected = projectCatalogSessions(catalog, { t_optimistic: "sp_a", t1: null }, sesiones);
  const byId = Object.fromEntries(projected[""].map((row) => [row.id, row.space]));
  assert.deepEqual(byId, {
    // Pending null clears assignment back to first space in order (sp_b).
    "cmp_vm~t1": "sp_b",
    // Saved mapping wins regardless of machine prefix.
    "cmp_mac~t_parent": "sp_a",
    // Unassigned subtask inherits parent's space.
    "cmp_mac~t_child": "sp_a",
    // Unassigned root falls back to default space (first in catalog.order = sp_b).
    t_unassigned: "sp_b",
    // Stale mapping to deleted space falls back to default space.
    t_stale: "sp_b",
    // Optimistic in-flight assignment wins before server round-trip settles.
    "cmp_vm~t_optimistic": "sp_a",
  });
});

test("buildInitialSeed normalizes machine-prefixed spaces, folders, and task assignments once", () => {
  const rows = [
    { id: "cmp_mac~s1", name: "  Trabajo  ", folders: ["cmp_mac~p1", "p1", "p2"], created_at: 1, updated_at: 1 },
    { id: "s1", name: "Duplicado", folders: ["p3"], created_at: 2, updated_at: 2 },
    { id: "s2", name: "", folders: [], created_at: 3, updated_at: 3 },
  ];
  const sesiones = {
    p1: [
      { id: "cmp_vm~t1", space: "cmp_mac~s1" },
      { id: "t2", space: "s2" },
      { id: "t3", space: "missing_space" },
    ],
  };

  const seed = buildInitialSeed(rows, sesiones);
  assert.deepEqual(seed, {
    spaces: [
      { id: "s1", name: "Trabajo", folders: ["p1", "p2"] },
      { id: "s2", name: null, folders: [] },
    ],
    task_spaces: {
      t1: "s1",
      t2: "s2",
    },
  });
  assert.equal(buildInitialSeed([], sesiones), null);
});
