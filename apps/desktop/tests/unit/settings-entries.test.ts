import assert from "node:assert/strict";
import test from "node:test";
import { SETTINGS_ENTRIES, settingsTarget } from "../../src/features/settings/settings-entries.ts";

test("old settings ids open the entry and tab that now hold them", () => {
  assert.deepEqual(settingsTarget("cuenta-danil"), { entry: "account", tab: "cuenta-danil" });
  assert.deepEqual(settingsTarget("workspaces"), { entry: "preferences", tab: "workspaces" });
  assert.deepEqual(settingsTarget("proveedores-ia"), { entry: "ai-accounts", tab: "proveedores-ia" });
  assert.deepEqual(settingsTarget("entorno"), { entry: "machines", tab: "entorno" });
  assert.deepEqual(settingsTarget("activity"), { entry: "machines", tab: "activity" });
  assert.deepEqual(settingsTarget("fuentes"), { entry: "source-control", tab: "fuentes" });
  assert.deepEqual(settingsTarget("source-control"), { entry: "source-control", tab: null });
  assert.deepEqual(settingsTarget("plugins"), { entry: "connections", tab: "plugins" });
  assert.deepEqual(settingsTarget("mcp"), { entry: "connections", tab: "operation" });
  assert.deepEqual(settingsTarget("conexiones"), { entry: "connections", tab: "external" });
  assert.deepEqual(settingsTarget("secretos"), { entry: "projects", tab: "secrets" });
  assert.deepEqual(settingsTarget("radiant"), { entry: "connections", tab: "operation" });
  assert.equal(settingsTarget("integrations"), null);
  assert.equal(settingsTarget("support"), null);
  assert.equal(settingsTarget("customers"), null);
  assert.deepEqual(settingsTarget("connections"), { entry: "connections", tab: null });
  assert.deepEqual(settingsTarget("business"), { entry: "billing", tab: "business" });
  assert.deepEqual(settingsTarget("fiscal"), { entry: "billing", tab: "fiscal" });
});

test("unknown or empty ids open nothing in particular", () => {
  assert.equal(settingsTarget(undefined), null);
  assert.equal(settingsTarget("bitacora"), null);
});

test("nine entries, every tab in exactly one", () => {
  assert.equal(SETTINGS_ENTRIES.length, 9);
  const tabs = SETTINGS_ENTRIES.flatMap((e) => [...e.tabs]);
  assert.equal(new Set(tabs).size, tabs.length);
});
