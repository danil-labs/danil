import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import solid from "vite-plugin-solid";
import { boot, sleep } from "../helpers/jsdom-app.mjs";
import { RESPONSES } from "../helpers/mount-guard.mjs";

const docStyle = (doc) => { const style = doc.createElement("style"); doc.head.append(style); return style; };
const until = async (read) => { for (let i = 0; i < 80; i++) { if (read()) return true; await sleep(50); } return false; };
test("account return opens first, announces counts, retries errors and keeps cancellation silent", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "danil-account-return-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const entry = fileURLToPath(new URL("../helpers/account-return.tsx", import.meta.url));
  await build({ configFile: false, root: fileURLToPath(new URL("../../", import.meta.url)), plugins: [solid()], logLevel: "silent", define: { __TERMINUS_VERSION__: JSON.stringify("test") }, build: { outDir: dir, emptyOutDir: true, lib: { entry, formats: ["es"], fileName: () => "fixture.mjs" }, rollupOptions: { output: { inlineDynamicImports: true } } } });
  const app = await boot("listo", "account-return-host", RESPONSES);
  app.w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  const root = app.w.document.createElement("div"); app.w.document.body.append(root);
  const sheet = docStyle(app.w.document);
  sheet.textContent = (await Promise.all((await readdir(dir)).filter((name) => name.endsWith(".css")).map((name) => readFile(join(dir, name), "utf8")))).join("\n");
  const { mountReturn } = await import(pathToFileURL(join(dir, "fixture.mjs")).href);
  const mounted = mountReturn(root); t.after(mounted.dispose);
  const doc = app.w.document;
  const add = () => [...root.querySelectorAll("button")].find((b) => b.textContent === "Agregar cuenta u organización").click();
  for (const detail of ["access_denied", "cancelled", "timeout"]) {
    add(); assert.equal(mounted.closes(), mounted.starts());
    mounted.fail(detail); await sleep(50);
    assert.ok(!doc.body.textContent.includes("No se pudo agregar la cuenta"));
    assert.ok(!doc.body.textContent.includes("Agregaste"));
  }
  add(); mounted.fail("network");
  assert.ok(await until(() => doc.body.textContent.includes("No se pudo agregar la cuenta")));
  const retry = [...doc.querySelectorAll("button")].find((b) => b.textContent === "Intentar de nuevo"); assert.ok(retry); retry.click();
  assert.equal(mounted.starts(), 5); mounted.success();
  assert.ok(await until(() => mounted.opened.length === 1));
  assert.deepEqual(mounted.opened, ["first"]);
  assert.ok(doc.body.textContent.includes("Agregaste Acme"));
  assert.ok(doc.body.textContent.includes("2 workspaces nuevos en la barra."));
  const tile = root.querySelector('[data-workspace-tile="first"]');
  assert.ok(tile.closest("[data-account-new][data-reduced-motion]"));
  assert.equal(app.w.getComputedStyle(tile.firstElementChild).animation, "none");
  await sleep(50); assert.ok(tile.closest("[data-account-new]"), "the reduced-motion halo is initially visible");
  await sleep(2200); assert.equal(tile.closest("[data-account-new]"), null, "the halo ends without a click even with reduced motion");
  mounted.dispose(); root.replaceChildren();
  app.w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const normal = mountReturn(root); t.after(normal.dispose);
  add(); normal.success(); assert.ok(await until(() => normal.opened.length === 1));
  assert.match(app.w.getComputedStyle(root.querySelector('[data-workspace-tile="first"] > span')).animation, /(?:180ms|\.18s)/);

  normal.dispose(); root.replaceChildren();
  const limit = mountReturn(root); t.after(limit.dispose);
  add(); limit.fail("too_many_contexts");
  assert.ok(await until(() => doc.body.textContent.includes("Llegaste al máximo de 20")));
  const alert = [...doc.querySelectorAll('[role="alert"]')].find((row) => row.textContent.includes("Llegaste al máximo de 20"));
  assert.ok(alert);
  assert.ok(!alert.textContent.includes("Revisa tu conexión"));
  assert.ok(!alert.textContent.includes("Intentar de nuevo"));
  assert.ok([...alert.querySelectorAll("p")].find((p) => p.textContent.startsWith("Llegaste al máximo de 20")).classList.contains("text-neutral-500"));
  limit.dispose(); root.replaceChildren();
  for (const [locale, names, expected] of [
    ["es", ["IYEM", "Danil"], "Agregaste IYEM y Danil"],
    ["es", ["IYEM", "Danil", "Acme"], "Agregaste IYEM, Danil y Acme"],
    ["en", ["IYEM", "Danil"], "You added IYEM and Danil"],
    ["en", ["IYEM", "Danil", "Acme"], "You added IYEM, Danil, and Acme"],
  ]) {
    const flow = mountReturn(root, locale);
    [...root.querySelectorAll("button")].find((b) => b.textContent === (locale === "es" ? "Agregar cuenta u organización" : "Add account or organization")).click();
    flow.success(names);
    assert.ok(await until(() => doc.body.textContent.includes(expected)), expected);
    flow.dispose(); root.replaceChildren();
  }

});
