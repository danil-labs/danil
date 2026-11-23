import assert from "node:assert/strict";
import { test } from "node:test";
import { workspaceSpacesClient } from "../src/workspace-spaces.ts";

const catalog = { version: 2, spaces: [{ id: "space1", name: "Producto", folders: [] }], order: ["space1"] };

test("the catalog captures the authorized context and preserves IDs on edits", async () => {
  const calls: unknown[][] = [];
  const client = workspaceSpacesClient(async (...args) => {
    calls.push(args);
    return { status: 200, body: catalog };
  }, "ctx_a", "42");
  assert.deepEqual(await client.read(), catalog);
  assert.deepEqual(await client.update(1, { kind: "rename", id: "space1", name: "Producto" }), catalog);
  assert.deepEqual(calls, [
    ["ctx_a", "GET", "/v1/workspaces/42/spaces", undefined],
    ["ctx_a", "POST", "/v1/workspaces/42/spaces", { kind: "rename", id: "space1", name: "Producto", if_version: 1 }],
  ]);
});

test("an invalid catalog or a version conflict is surfaced without a retry", async () => {
  const invalid = workspaceSpacesClient(async () => ({
    status: 200, body: { ...catalog, order: ["unknown"] },
  }), "ctx_a", "42");
  await assert.rejects(invalid.read(), /invalid_space_catalog/);
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
    return { status: 200, body: { version: 3, spaces: [], order: [] } };
  }, "ctx_a", "42");
  assert.deepEqual(await client.update(2, { kind: "delete", id: "space1" }), { version: 3, spaces: [], order: [] });
  assert.deepEqual(calls, [["ctx_a", "POST", "/v1/workspaces/42/spaces", { kind: "delete", id: "space1", if_version: 2 }]]);
});
