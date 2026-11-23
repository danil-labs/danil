import assert from "node:assert/strict";
import test from "node:test";
import { sleep } from "../helpers/jsdom-app.mjs";
import { RESPONSES, boot } from "../helpers/mount-guard.mjs";

test("Login y seguridad mounts as its own settings entry after Cuenta and opens its panel", async () => {
  const app = await boot("listo", "settings-login-security", RESPONSES);
  const { w } = app;

  w.document.querySelector('button[aria-label="Configuración"]')?.click();
  await sleep(120);

  const navTabs = [...w.document.querySelectorAll('[id^="cfg-tab-"]')].map((el) => el.id);
  assert.ok(navTabs.includes("cfg-tab-account"), "Cuenta entry must render");
  assert.ok(navTabs.includes("cfg-tab-security"), "Login y seguridad entry must render via entradasDe");
  assert.equal(navTabs.indexOf("cfg-tab-security"), navTabs.indexOf("cfg-tab-account") + 1);

  w.document.querySelector("#cfg-tab-account")?.click();
  await sleep(60);
  assert.equal(w.document.querySelector("#cfg-sub-security"), null);

  const securityTab = w.document.querySelector("#cfg-tab-security");
  assert.equal(securityTab?.textContent?.trim(), "Login y seguridad");
  securityTab?.click();
  await sleep(60);

  assert.equal(w.document.querySelector("#cfg-panel h2")?.textContent?.trim(), "Login y seguridad");
  assert.equal(w.document.querySelector('#cfg-panel [role="tablist"]'), null);
  const panel = w.document.querySelector("[data-settings-security]");
  assert.ok(panel, "LoginSecurity panel must mount");
  assert.ok(panel.textContent?.includes("Acceso y sesiones"));

  w.document.querySelector("#cfg-tab-account")?.click();
  await sleep(60);
  assert.equal(w.document.querySelector("[data-settings-security]"), null);

  w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "security" }));
  await sleep(60);
  assert.ok(w.document.querySelector("[data-settings-security]"), "harness:open-settings security activates the section");
  assert.deepEqual(app.failures, []);
});
