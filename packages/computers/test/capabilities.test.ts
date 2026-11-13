import assert from "node:assert/strict";
import { test } from "node:test";
import { announces, capabilityList, mayCall } from "../src/index.ts";

test("solo v1 y available cuentan; nombres y formas desconocidas se ignoran", () => {
  const list = capabilityList({ contract: "mvp-v1", items: [
    { name: "machines", version: 1, status: "available", routes: ["GET /v1/machines"], future: true },
    { name: "machines.start", version: 2, status: "available" },
    { name: "identity.organizations", version: 1, status: "degraded" },
    { name: "workspaces", version: 1, status: "future" },
    { name: "machines.session", status: "available" },
    null, "x", { version: 1, status: "available" },
  ] });
  assert.deepEqual([...(list ?? [])], ["machines"]);
});

test("sin lista: announces no supone, mayCall deja probar la ruta", () => {
  for (const body of [null, {}, { items: "x" }]) {
    const list = capabilityList(body);
    assert.equal(list, null);
    assert.equal(announces(list, "machines.session.renew"), false);
    assert.equal(mayCall(list, "machines"), true);
  }
  const empty = capabilityList({ contract: "mvp-v1", items: [] });
  assert.equal(mayCall(empty, "machines"), false);
});
