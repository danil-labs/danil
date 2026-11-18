import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import solid from "vite-plugin-solid";
import { boot } from "../helpers/jsdom-app.mjs";
import { RESPONSES } from "../helpers/mount-guard.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (read) => { for (let i = 0; i < 60; i++) { if (read()) return true; await sleep(20); } return false; };

test("a rail menu opened with the pointer focuses its panel; opened with the keyboard, its first row", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "danil-popover-focus-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const entry = fileURLToPath(new URL("../helpers/popover-focus.tsx", import.meta.url));
  await build({ configFile: false, root: fileURLToPath(new URL("../../", import.meta.url)), plugins: [solid()], logLevel: "silent", define: { __TERMINUS_VERSION__: JSON.stringify("test") }, build: { outDir: dir, emptyOutDir: true, lib: { entry, formats: ["es"], fileName: () => "fixture.mjs" }, rollupOptions: { output: { inlineDynamicImports: true } } } });
  const app = await boot("listo", "popover-focus-host", RESPONSES);
  const w = app.w;
  const host = w.document.createElement("div");
  w.document.body.append(host);
  const { mountMenus } = await import(pathToFileURL(join(dir, "fixture.mjs")).href);
  const dispose = mountMenus(host);
  t.after(dispose);
  const doc = w.document;
  const panel = (name) => doc.querySelector(`[data-panel="${name}"]`);
  const open = async (name, how) => {
    const trigger = doc.querySelector(`[data-trigger="${name}"]`);
    if (how === "pointer") trigger.dispatchEvent(new w.Event("pointerdown", { bubbles: true }));
    else trigger.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    trigger.click();
    assert.ok(await until(() => panel(name)), `${name} opens`);
    await sleep(60);
  };
  const close = async (name) => {
    doc.activeElement?.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.ok(await until(() => !panel(name)), `${name} closes`);
    await sleep(30);
  };

  await open("rows", "pointer");
  assert.equal(doc.activeElement, panel("rows"), "with the pointer the panel holds focus, so no row shows the ring");
  assert.notEqual(doc.activeElement.getAttribute("role"), "menuitem");
  await close("rows");

  await open("rows", "keyboard");
  assert.equal(doc.activeElement?.textContent, "Agregar cuenta u organización", "with the keyboard the first row is focused and shows the ring");
  await close("rows");

  await open("search", "pointer");
  assert.equal(doc.activeElement?.getAttribute("type"), "search", "a leading search field still takes focus with the pointer");
});
