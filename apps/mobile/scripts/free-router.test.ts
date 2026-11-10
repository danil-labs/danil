import assert from "node:assert/strict";
import { test } from "node:test";
import type { FreeModels } from "../src/lib/engine.ts";
import { freeRouterState } from "../src/lib/free-router.ts";

const row = (accepted: boolean, usable: boolean, enabled = true): FreeModels => ({
  provider: "opencode-zen", label: "Danil", text: { lines: [], version: 3 }, accepted, usable,
  policy: { workspace_id: "w", version: 3, providers: ["kilo", "vercel", "reflection"], lines: [], acceptance_ref: "ref", enabled, accepted, terms: [] },
});

test("la fila del Router en el selector móvil dice una sola cosa", () => {
  assert.equal(freeRouterState(null), "loading");
  assert.equal(freeRouterState([]), "update_engine");
  assert.equal(freeRouterState([row(false, false)]), "activate");
  assert.equal(freeRouterState([row(true, false)]), "unavailable");
  assert.equal(freeRouterState([row(false, false, false)]), "unavailable");
  assert.equal(freeRouterState([row(true, true)]), "ready");
});
