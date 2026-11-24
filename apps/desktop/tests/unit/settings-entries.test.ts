import assert from "node:assert/strict";
import test from "node:test";
import { SETTINGS_ENTRIES, settingsTarget } from "../../../../packages/features/settings/src/model/settings-entries.ts";

test("old settings ids open the entry and tab that now hold them", () => {
  assert.deepEqual(settingsTarget("general"), { entry: "general", tab: null });
  assert.deepEqual(settingsTarget("notify"), { entry: "general", tab: null });
  assert.deepEqual(settingsTarget("notifications"), { entry: "general", tab: null });
  assert.deepEqual(settingsTarget("appearance"), { entry: "appearance", tab: null });
  assert.deepEqual(settingsTarget("cuenta-danil"), { entry: "account", tab: "cuenta-danil" });
  assert.deepEqual(settingsTarget("security"), { entry: "security", tab: null });
  assert.deepEqual(settingsTarget("workspaces"), { entry: "preferences", tab: "workspaces" });
  assert.deepEqual(settingsTarget("languages"), { entry: "general", tab: null });
  assert.deepEqual(settingsTarget("proveedores-ia"), { entry: "ai-accounts", tab: "proveedores-ia" });
  assert.equal(settingsTarget("machines"), null);
  assert.equal(settingsTarget("entorno"), null);
  assert.equal(settingsTarget("activity"), null);
  assert.deepEqual(settingsTarget("fuentes"), { entry: "source-control", tab: "fuentes" });
  assert.deepEqual(settingsTarget("source-control"), { entry: "source-control", tab: null });
  assert.deepEqual(settingsTarget("plugins"), { entry: "connections", tab: "plugins" });
  assert.deepEqual(settingsTarget("mcp"), { entry: "connections", tab: "operation" });
  assert.deepEqual(settingsTarget("conexiones"), { entry: "connections", tab: "external" });
  assert.equal(settingsTarget("projects"), null);
  assert.equal(settingsTarget("proyectos"), null);
  assert.equal(settingsTarget("secrets"), null);
  assert.equal(settingsTarget("secretos"), null);
  assert.deepEqual(settingsTarget("radiant"), { entry: "connections", tab: "operation" });
  assert.equal(settingsTarget("integrations"), null);
  assert.equal(settingsTarget("support"), null);
  assert.equal(settingsTarget("customers"), null);
  assert.deepEqual(settingsTarget("connections"), { entry: "connections", tab: null });
  assert.deepEqual(settingsTarget("business"), { entry: "billing", tab: "business" });
  assert.deepEqual(settingsTarget("fiscal"), { entry: "billing", tab: "fiscal" });
  assert.deepEqual(settingsTarget("maintenance"), { entry: "maintenance", tab: null });
  assert.deepEqual(settingsTarget("download"), { entry: "maintenance", tab: null });
});

test("unknown or empty ids open nothing in particular", () => {
  assert.equal(settingsTarget(undefined), null);
  assert.equal(settingsTarget("bitacora"), null);
});

test("eleven entries, general first then appearance, security after account, maintenance in footer, every tab in exactly one", () => {
  assert.equal(SETTINGS_ENTRIES.length, 11);
  assert.equal(SETTINGS_ENTRIES[0].id, "general");
  assert.equal(SETTINGS_ENTRIES[0].group, "you");
  assert.deepEqual([...SETTINGS_ENTRIES[0].tabs], ["general"]);
  assert.equal(SETTINGS_ENTRIES[1].id, "appearance");
  assert.equal(SETTINGS_ENTRIES[1].group, "you");
  assert.deepEqual([...SETTINGS_ENTRIES[1].tabs], ["appearance"]);
  const accountIndex = SETTINGS_ENTRIES.findIndex((e) => e.id === "account");
  const securityIndex = SETTINGS_ENTRIES.findIndex((e) => e.id === "security");
  const preferences = SETTINGS_ENTRIES.find((e) => e.id === "preferences");
  const maintenance = SETTINGS_ENTRIES.find((e) => e.id === "maintenance");
  assert.equal(securityIndex, accountIndex + 1);
  assert.equal(SETTINGS_ENTRIES[securityIndex].group, "you");
  assert.deepEqual([...SETTINGS_ENTRIES[securityIndex].tabs], ["security"]);
  assert.ok(!(SETTINGS_ENTRIES[accountIndex].tabs as readonly string[]).includes("security"));
  assert.ok(preferences);
  assert.ok(!(preferences.tabs as readonly string[]).includes("general"));
  assert.ok(!(preferences.tabs as readonly string[]).includes("appearance"));
  assert.ok(!(preferences.tabs as readonly string[]).includes("notify"));
  assert.ok(!(preferences.tabs as readonly string[]).includes("download"));
  assert.equal(maintenance?.group, "footer");
  assert.deepEqual(maintenance ? [...maintenance.tabs] : [], ["maintenance"]);
  const tabs = SETTINGS_ENTRIES.flatMap((e) => [...e.tabs]);
  assert.ok(!tabs.includes("languages"));
  assert.equal(new Set(tabs).size, tabs.length);
});
