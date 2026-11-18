import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { inferenceLevels, prepareCreditsV2 } from "../../src/features/chat/credits-v2.ts";

const catalog = JSON.parse(readFileSync(new URL("../../../../contracts/billing-v2/registry/catalog-seed.v2.json", import.meta.url), "utf8"));
const models = {
  object: "list",
  data: ["danil/ligero", "danil/equilibrado", "danil/avanzado"].map((id) => ({ id, object: "model", created: 1794000000, owned_by: "danil" })),
};

test("the pinned inference catalog supplies the three displayed levels and its default", () => {
  assert.deepEqual(inferenceLevels(models, catalog), [
    { id: "danil/ligero", label: "Ligero", default: false },
    { id: "danil/equilibrado", label: "Equilibrado", default: true },
    { id: "danil/avanzado", label: "Avanzado", default: false },
  ]);
});

test("only levels returned by the edge are offered", () => {
  assert.deepEqual(inferenceLevels({ ...models, data: [models.data[1]] }, catalog), [
    { id: "danil/equilibrado", label: "Equilibrado", default: true },
  ]);
  assert.deepEqual(inferenceLevels({ object: "list", data: [{ id: "unknown", object: "model" }] }, catalog), []);
});

test("v2 prepares the local workspace through the native credits command", async () => {
  const calls: Array<{ command: string; args: Record<string, unknown> }> = [];
  const invoke = async (command: string, args: Record<string, unknown>) => { calls.push({ command, args }); };
  await prepareCreditsV2({ "x-terminus-workspace": "workspace-1" }, invoke);
  assert.deepEqual(calls, [{ command: "credits_pilot_prepare", args: { workspace: "workspace-1", account: null } }]);
  await assert.rejects(prepareCreditsV2({ "x-terminus-workspace": "workspace-1", "x-terminus-machine": "remote" }, invoke));
  assert.equal(calls.length, 1);
});
