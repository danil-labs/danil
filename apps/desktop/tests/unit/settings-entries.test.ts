import assert from "node:assert/strict";
import test from "node:test";
import { SETTINGS_ENTRIES, settingsTarget } from "../../../../packages/features/settings/src/model/settings-entries.ts";

test("old settings ids open the entry and tab that now hold them", () => {
  assert.deepEqual(settingsTarget("general"), { entry: "general", tab: null });
  assert.deepEqual(settingsTarget("notify"), { entry: "general", tab: null });
  assert.deepEqual(settingsTarget("notifications"), { entry: "general", tab: null });
  assert.deepEqual(settingsTarget("appearance"), { entry: "appearance", tab: null });
  assert.deepEqual(settingsTarget("account"), { entry: "account", tab: null });
  assert.deepEqual(settingsTarget("cuenta-danil"), { entry: "account", tab: "cuenta-danil" });
  assert.deepEqual(settingsTarget("emails"), { entry: "account", tab: "cuenta-danil" });
  assert.deepEqual(settingsTarget("usage"), { entry: "account", tab: "cuenta-danil" });
  assert.deepEqual(settingsTarget("plan"), { entry: "account", tab: "cuenta-danil" });
  assert.deepEqual(settingsTarget("billing"), { entry: "account", tab: "cuenta-danil" });
  assert.deepEqual(settingsTarget("business"), { entry: "account", tab: "cuenta-danil" });
  assert.deepEqual(settingsTarget("fiscal"), { entry: "account", tab: "cuenta-danil" });
  assert.deepEqual(settingsTarget("security"), { entry: "security", tab: null });
  assert.equal(settingsTarget("workspaces"), null);
  assert.equal(settingsTarget("preferences"), null);
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
  assert.deepEqual(settingsTarget("maintenance"), { entry: "maintenance", tab: null });
  assert.deepEqual(settingsTarget("download"), { entry: "maintenance", tab: null });
});

test("unknown or empty ids open nothing in particular", () => {
  assert.equal(settingsTarget(undefined), null);
  assert.equal(settingsTarget("bitacora"), null);
});

test("nine flat entries in final order, account unified without sub-tabs, no billing entry, maintenance in footer, every tab in exactly one", () => {
  assert.deepEqual(
    SETTINGS_ENTRIES.map((e) => e.id),
    [
      "general",
      "appearance",
      "account",
      "security",
      "ai-accounts",
      "source-control",
      "agents-skills",
      "connections",
      "maintenance",
    ],
  );
  assert.deepEqual([...SETTINGS_ENTRIES[0].tabs], ["general"]);
  assert.deepEqual([...SETTINGS_ENTRIES[1].tabs], ["appearance"]);
  const accountIndex = SETTINGS_ENTRIES.findIndex((e) => e.id === "account");
  const securityIndex = SETTINGS_ENTRIES.findIndex((e) => e.id === "security");
  const maintenance = SETTINGS_ENTRIES.find((e) => e.id === "maintenance");
  assert.deepEqual([...SETTINGS_ENTRIES[accountIndex].tabs], ["cuenta-danil"]);
  assert.equal(securityIndex, accountIndex + 1);
  assert.deepEqual([...SETTINGS_ENTRIES[securityIndex].tabs], ["security"]);
  assert.ok(!(SETTINGS_ENTRIES[accountIndex].tabs as readonly string[]).includes("security"));
  assert.ok(maintenance && "footer" in maintenance && maintenance.footer === true);
  assert.deepEqual(maintenance ? [...maintenance.tabs] : [], ["maintenance"]);
  const tabs = SETTINGS_ENTRIES.flatMap((e) => [...e.tabs]);
  assert.ok(!tabs.includes("languages"));
  assert.ok(!tabs.includes("workspaces"));
  assert.ok(!tabs.includes("notify"));
  assert.ok(!tabs.includes("download"));
  assert.ok(!tabs.includes("emails"));
  assert.ok(!tabs.includes("usage"));
  assert.ok(!tabs.includes("plan"));
  assert.ok(!tabs.includes("business"));
  assert.ok(!tabs.includes("fiscal"));
  assert.equal(new Set(tabs).size, tabs.length);
});
