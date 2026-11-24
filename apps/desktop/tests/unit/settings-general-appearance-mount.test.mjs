import assert from "node:assert/strict";
import test from "node:test";
import { sleep } from "../helpers/jsdom-app.mjs";
import { boot, RESPONSES } from "../helpers/mount-guard.mjs";

test("General and Apariencia mount first in Settings, Notificaciones lives in General, and permissions default to auto", async () => {
  const saves = [];
  const workspaces = {
    workspaces: [{ id: "w", name: "W", context_root: null, default_permission_mode: null }],
    active: "w",
  };
  const app = await boot("listo", "settings-general-appearance", {
    ...RESPONSES,
    list_workspaces: () => workspaces,
    workspaces_startup: () => workspaces,
    list_language_packs: [],
    list_bundled_language_packs: [],
    set_workspace_permission_mode: ({ id, mode }) => {
      saves.push([id, mode]);
      return { ...workspaces.workspaces[0], default_permission_mode: mode };
    },
  });
  const { w } = app;

  w.document.querySelector('button[aria-label="Configuración"]')?.click();
  await sleep(120);

  const navTabs = [...w.document.querySelectorAll('[id^="cfg-tab-"]')].map((el) => el.id);
  assert.equal(navTabs[0], "cfg-tab-general", "General must be the first Settings entry");
  assert.equal(navTabs[1], "cfg-tab-appearance", "Apariencia must appear right below General");

  const generalTab = w.document.querySelector("#cfg-tab-general");
  const appearanceTab = w.document.querySelector("#cfg-tab-appearance");
  assert.equal(generalTab?.textContent?.trim(), "General");
  assert.equal(appearanceTab?.textContent?.trim(), "Apariencia");

  assert.equal(w.document.querySelector("#cfg-panel h2")?.textContent?.trim(), "General");
  assert.equal(w.document.querySelector('#cfg-panel [role="tablist"]'), null, "General has no inner tablist");

  const headings = [...w.document.querySelectorAll("#cfg-panel h3")].map((h) => h.textContent?.trim());
  assert.ok(headings.includes("Notificaciones"), "General contains Notificaciones as a SettingsSection");
  const notifyRow = w.document.querySelector('[data-setting="notify-behavior"]');
  assert.ok(notifyRow, "NotifyBehavior mounts inside General");
  const notifySelect = notifyRow.querySelector("select");
  assert.ok(notifySelect);
  assert.ok(!notifySelect.className.includes("focus-visible:outline-solid"), "NotifyBehavior select has no focus outline");

  const permSelect = w.document.querySelector('[data-setting="default-permissions"] select');
  assert.ok(permSelect, "DefaultPermissions select mounts inside General");
  assert.equal(permSelect.value, "auto", "unset workspace default_permission_mode displays auto");
  assert.ok(!permSelect.className.includes("focus-visible:outline-solid"), "DefaultPermissions select has no focus outline");

  permSelect.value = "ediciones";
  permSelect.dispatchEvent(new w.Event("change", { bubbles: true }));
  await sleep(80);
  assert.deepEqual(saves, [["w", "ediciones"]]);

  assert.equal(w.document.querySelector("#cfg-tab-preferences"), null);
  assert.equal(w.document.querySelector("#cfg-sub-general"), null);
  assert.equal(w.document.querySelector("#cfg-sub-appearance"), null);
  assert.equal(w.document.querySelector("#cfg-sub-notify"), null);

  w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "notify" }));
  await sleep(60);
  assert.equal(w.document.querySelector("#cfg-panel h2")?.textContent?.trim(), "General");
  assert.ok(w.document.querySelector('[data-setting="notify-behavior"]'));

  w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "appearance" }));
  await sleep(120);
  assert.equal(w.document.querySelector("#cfg-panel h2")?.textContent?.trim(), "Apariencia");
  assert.equal(w.document.querySelector('#cfg-panel [role="tablist"]'), null, "Apariencia has no inner tablist");

  w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "notifications" }));
  await sleep(60);
  assert.equal(w.document.querySelector("#cfg-panel h2")?.textContent?.trim(), "General");

  assert.deepEqual(app.failures, []);
});
