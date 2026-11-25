import assert from "node:assert/strict";
import { test } from "node:test";
import { workspaceSpacesClient } from "../src/workspace-spaces.ts";

const catalog = {
  version: 2,
  spaces: [{ id: "space1", name: "Producto", folders: ["proj_1"] }],
  order: ["space1"],
  task_spaces: { task_1: "space1" },
};

test("the catalog captures the authorized context and preserves IDs on edits", async () => {
  const calls: unknown[][] = [];
  const client = workspaceSpacesClient(async (...args) => {
    calls.push(args);
    return { status: 200, body: catalog };
  }, "ctx_a", "42");
  assert.deepEqual(await client.read(), catalog);
  assert.deepEqual(await client.update(1, { kind: "rename", id: "space1", name: "Producto" }), catalog);
  assert.deepEqual(await client.update(2, { kind: "create", name: "Diseño", folders: ["proj_1"] }), catalog);
  assert.deepEqual(await client.update(3, { kind: "set_folders", id: "space1", folders: ["proj_1"] }), catalog);
  assert.deepEqual(await client.assignTask("task_1", "space1"), catalog);
  assert.deepEqual(calls, [
    ["ctx_a", "GET", "/v1/workspaces/42/spaces", undefined],
    ["ctx_a", "POST", "/v1/workspaces/42/spaces", { kind: "rename", id: "space1", name: "Producto", if_version: 1 }],
    ["ctx_a", "POST", "/v1/workspaces/42/spaces", { kind: "create", name: "Diseño", folders: ["proj_1"], if_version: 2 }],
    ["ctx_a", "POST", "/v1/workspaces/42/spaces", { kind: "set_folders", id: "space1", folders: ["proj_1"], if_version: 3 }],
    ["ctx_a", "POST", "/v1/workspaces/42/spaces", { kind: "assign_task", task: "task_1", space: "space1" }],
  ]);
});

test("legacy responses without task_spaces default cleanly to an empty map", async () => {
  const client = workspaceSpacesClient(async () => ({
    status: 200,
    body: { version: 1, spaces: [{ id: "space1", name: null, folders: [] }], order: ["space1"] },
  }), "ctx_a", "42");
  assert.deepEqual(await client.read(), {
    version: 1,
    spaces: [{ id: "space1", name: null, folders: [] }],
    order: ["space1"],
    task_spaces: {},
  });
});

test("an invalid catalog or a version conflict is surfaced without a retry", async () => {
  const invalid = workspaceSpacesClient(async () => ({
    status: 200, body: { ...catalog, order: ["unknown"] },
  }), "ctx_a", "42");
  await assert.rejects(invalid.read(), /invalid_space_catalog/);
  const invalidTaskMap = workspaceSpacesClient(async () => ({
    status: 200, body: { ...catalog, task_spaces: { "bad space": "space1" } },
  }), "ctx_a", "42");
  await assert.rejects(invalidTaskMap.read(), /invalid_space_catalog/);
  let sent = 0;
  const stale = workspaceSpacesClient(async () => {
    sent++;
    return { status: 409, body: { code: "version_conflict" } };
  }, "ctx_a", "42");
  await assert.rejects(stale.update(1, { kind: "reorder", order: ["space1"] }), { status: 409, detail: "version_conflict" });
  assert.equal(sent, 1);
});

test("delete edits target the authorized workspace catalog", async () => {
  const calls: unknown[][] = [];
  const client = workspaceSpacesClient(async (...args) => {
    calls.push(args);
    return { status: 200, body: { version: 3, spaces: [], order: [], task_spaces: {} } };
  }, "ctx_a", "42");
  assert.deepEqual(await client.update(2, { kind: "delete", id: "space1" }), { version: 3, spaces: [], order: [], task_spaces: {} });
  assert.deepEqual(calls, [["ctx_a", "POST", "/v1/workspaces/42/spaces", { kind: "delete", id: "space1", if_version: 2 }]]);
});
