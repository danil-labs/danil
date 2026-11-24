import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { sleep } from "../helpers/jsdom-app.mjs";
import { boot, RESPONSES } from "../helpers/mount-guard.mjs";

const DESKTOP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("Control git renders the official Git SVG mark and connections entry renders as Conectores/Connectors", async () => {
  const es = JSON.parse(readFileSync(join(DESKTOP_ROOT, "src/locales/es/settings.json"), "utf8"));
  const en = JSON.parse(readFileSync(join(DESKTOP_ROOT, "src/locales/en/settings.json"), "utf8"));
  const yua = JSON.parse(readFileSync(join(DESKTOP_ROOT, "src/locales/yua/settings.json"), "utf8"));
  assert.equal(es["settings.nav.connections"], "Conectores");
  assert.equal(en["settings.nav.connections"], "Connectors");
  assert.ok(!("settings.nav.connections" in yua), "yua falls back to es Conectores");

  const app = await boot("listo", "settings-git-icon-and-connectors", RESPONSES);
  const { w } = app;

  w.document.querySelector('button[aria-label="Configuración"]')?.click();
  await sleep(120);

  const sourceControlTab = w.document.querySelector("#cfg-tab-source-control");
  assert.ok(sourceControlTab, "source-control entry must render");
  assert.equal(sourceControlTab.textContent?.trim(), "Control git");

  const gitSvg = sourceControlTab.querySelector("svg");
  assert.ok(gitSvg, "source-control entry must render an SVG icon");
  assert.equal(gitSvg.getAttribute("width"), "15");
  assert.equal(gitSvg.getAttribute("height"), "15");
  assert.equal(gitSvg.getAttribute("viewBox"), "0 0 24 24");
  assert.equal(gitSvg.getAttribute("fill"), "currentColor");
  assert.ok(!gitSvg.getAttribute("class")?.includes("lucide-git-branch"), "must not use lucide GitBranch");
  const gitPath = gitSvg.querySelector("path")?.getAttribute("d") ?? "";
  assert.ok(gitPath.startsWith("M13.09 23.549"), "must render the official Git diamond logo path");

  const connectionsTab = w.document.querySelector("#cfg-tab-connections");
  assert.ok(connectionsTab, "connections entry must keep its internal id");
  assert.equal(connectionsTab.textContent?.trim(), "Conectores");

  connectionsTab.click();
  await sleep(80);
  assert.equal(w.document.querySelector("#cfg-panel h2")?.textContent?.trim(), "Conectores");
  assert.ok(w.document.querySelector("#cfg-sub-operation"), "connections internal tabs remain intact");
  assert.ok(w.document.querySelector("#cfg-sub-plugins"), "plugins sub-tab remains intact");
  assert.ok(w.document.querySelector("#cfg-sub-memory"), "memory sub-tab remains intact");

  assert.deepEqual(app.failures, []);
});
