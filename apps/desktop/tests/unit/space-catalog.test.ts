import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildInitialSeed,
  buildTaskSpacesBackfill,
  buildTaskSpacesBackfillEdit,
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

test("projectCatalogSessions preserves valid engine row.space when task_spaces has no entry", () => {
  const catalog = {
    version: 1,
    spaces: [
      { id: "sp_default", name: "Default", folders: [] },
      { id: "sp_product", name: "Producto", folders: [] },
    ],
    order: ["sp_default", "sp_product"],
    task_spaces: {
      t_override: "sp_default",
    },
  };
  const sesiones = {
    "": [
      { id: "t_bare", space: "sp_product", parent: null },
      { id: "cmp_vm~t_prefixed", space: "cmp_vm~sp_product", parent: null },
      { id: "t_override", space: "sp_product", parent: null },
      { id: "t_cleared", space: "sp_product", parent: null },
      { id: "t_unknown", space: "sp_deleted", parent: null },
      { id: "t_empty", space: null, parent: null },
    ],
  };

  const projected = projectCatalogSessions(catalog, { t_cleared: null }, sesiones);
  const byId = Object.fromEntries(projected[""].map((row) => [row.id, row.space]));
  assert.deepEqual(byId, {
    t_bare: "sp_product",
    "cmp_vm~t_prefixed": "sp_product",
    t_override: "sp_default",
    t_cleared: "sp_default",
    t_unknown: "sp_default",
    t_empty: "sp_default",
  });
});

test("buildTaskSpacesBackfill collects missing valid engine assignments, skips inherited subtasks, pending, attempted, deleted spaces, and foreign workspaces", () => {
  const catalog = {
    version: 12,
    spaces: [
      { id: "sp_default", name: "Default", folders: ["p1"] },
      { id: "sp_agents", name: "Agents", folders: ["p2"] },
      { id: "sp_general", name: "General", folders: [] },
    ],
    order: ["sp_default", "sp_agents", "sp_general"],
    task_spaces: {
      t_saved: "sp_default",
      t_saved_parent: "sp_general",
    },
  };
  const sesiones = {
    p1: [
      { id: "t_saved", space: "sp_agents", parent: null, workspace: "ws_1", updated_at: 100 },
      { id: "t_pending", space: "sp_agents", parent: null, workspace: "ws_1", updated_at: 100 },
      { id: "t_attempted", space: "sp_agents", parent: null, workspace: "ws_1", updated_at: 100 },
      { id: "t_deleted_space", space: "sp_deleted", parent: null, workspace: "ws_1", updated_at: 100 },
      { id: "t_null_space", space: null, parent: null, workspace: "ws_1", updated_at: 100 },
      { id: "t_other_ws", space: "sp_agents", parent: null, workspace: "ws_other", updated_at: 100 },
    ],
    p2: [
      { id: "cmp_mac~t_root", space: "cmp_mac~sp_agents", parent: null, workspace: "ws_1", updated_at: 200 },
      // Subtask sharing its root's space is inherited via lookup(parent) and skipped to save quota.
      { id: "cmp_mac~t_child_same", space: "cmp_mac~sp_agents", parent: "cmp_mac~t_root", workspace: "ws_1", updated_at: 210 },
      // Subtask whose saved parent already has the same space is also skipped.
      { id: "t_child_of_saved", space: "sp_general", parent: "t_saved_parent", workspace: "ws_1", updated_at: 220 },
      // Subtask whose parent is archived/absent must still be backfilled.
      { id: "t_orphan_child", space: "sp_general", parent: "t_archived_parent", workspace: "ws_1", updated_at: 150 },
      // Subtask with a different space than its parent must be preserved explicitly.
      { id: "t_child_diff", space: "sp_general", parent: "cmp_mac~t_root", workspace: "ws_1", updated_at: 160 },
    ],
  };

  const backfill = buildTaskSpacesBackfill(
    catalog,
    { t_pending: "sp_default" },
    sesiones,
    new Set(["t_attempted"]),
    "ws_1",
  );
  assert.deepEqual(backfill, {
    t_root: "sp_agents",
    t_orphan_child: "sp_general",
    t_child_diff: "sp_general",
  });

  const edit = buildTaskSpacesBackfillEdit(
    catalog,
    { t_pending: "sp_default" },
    sesiones,
    new Set(["t_attempted"]),
    "ws_1",
  );
  assert.deepEqual(edit, {
    kind: "import",
    spaces: [catalog.spaces[0]],
    task_spaces: {
      t_root: "sp_agents",
      t_orphan_child: "sp_general",
      t_child_diff: "sp_general",
    },
  });
});

test("buildTaskSpacesBackfill respects remaining maxTaskSpaces quota, prioritizing root tasks and most recent first", () => {
  const catalog = {
    version: 3,
    spaces: [
      { id: "sp_a", name: "A", folders: [] },
      { id: "sp_b", name: "B", folders: [] },
    ],
    order: ["sp_a", "sp_b"],
    task_spaces: {
      t_existing_1: "sp_a",
      t_existing_2: "sp_a",
    },
  };
  const sesiones = {
    "": [
      { id: "t_old_root", space: "sp_b", parent: null, updated_at: 10 },
      { id: "t_new_root", space: "sp_b", parent: null, updated_at: 50 },
      { id: "t_orphan_newest", space: "sp_b", parent: "t_archived", updated_at: 99 },
    ],
  };

  // Limit 4 minus 2 existing = 2 remaining slots -> picks both roots before orphan child.
  assert.deepEqual(
    buildTaskSpacesBackfill(catalog, {}, sesiones, new Set(), null, 4),
    { t_new_root: "sp_b", t_old_root: "sp_b" },
  );
  // Limit 3 minus 2 existing = 1 remaining slot -> picks the most recent root.
  assert.deepEqual(
    buildTaskSpacesBackfill(catalog, {}, sesiones, new Set(), null, 3),
    { t_new_root: "sp_b" },
  );
  // Quota already full -> returns null.
  assert.equal(buildTaskSpacesBackfill(catalog, {}, sesiones, new Set(), null, 2), null);
  assert.equal(buildTaskSpacesBackfillEdit(catalog, {}, sesiones, new Set(), null, 2), null);
});
