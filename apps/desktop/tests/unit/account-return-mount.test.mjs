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
  const add = () => {
    root.querySelector("[data-add-workspace]").click();
    doc.querySelector("[data-add-danil-step]").click();
  };
  for (const detail of ["access_denied", "cancelled", "timeout"]) {
    add(); assert.equal(mounted.closes(), 1);
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
  const browserErr = mountReturn(root); t.after(browserErr.dispose);
  add(); browserErr.fail("browser");
  assert.ok(await until(() => doc.body.textContent.includes("No se pudo abrir el navegador para iniciar sesión.")));
  const browserAlert = [...doc.querySelectorAll('[role="alert"]')].find((row) => row.textContent.includes("No se pudo abrir el navegador"));
  assert.ok(browserAlert);
  assert.ok(!browserAlert.textContent.includes("Revisa tu conexión"));
  assert.ok(browserAlert.textContent.includes("Intentar de nuevo"));
  browserErr.dispose(); root.replaceChildren();

  const unavailableErr = mountReturn(root); t.after(unavailableErr.dispose);
  add(); unavailableErr.fail("unavailable");
  assert.ok(await until(() => doc.body.textContent.includes("Danil no responde ahora.")));
  const unavailableAlert = [...doc.querySelectorAll('[role="alert"]')].find((row) => row.textContent.includes("Danil no responde ahora."));
  assert.ok(unavailableAlert);
  assert.ok(!unavailableAlert.textContent.includes("Revisa tu conexión"));
  assert.ok(unavailableAlert.textContent.includes("Intentar de nuevo"));
  unavailableErr.dispose(); root.replaceChildren();
  for (const [locale, names, expected] of [
    ["es", ["IYEM", "Danil"], "Agregaste IYEM y Danil"],
    ["es", ["IYEM", "Danil", "Acme"], "Agregaste IYEM, Danil y Acme"],
    ["en", ["IYEM", "Danil"], "You added IYEM and Danil"],
    ["en", ["IYEM", "Danil", "Acme"], "You added IYEM, Danil, and Acme"],
  ]) {
    const flow = mountReturn(root, locale);
    add();
    flow.success(names);
    assert.ok(await until(() => doc.body.textContent.includes(expected)), expected);
    flow.dispose(); root.replaceChildren();
  }

  // El aviso de la adopción: cuenta lo traído, deja verlo y reintentar lo que falló.
  const notice = mountReturn(root); t.after(notice.dispose);
  notice.adopt({ context: "ctx-0", org: "org-0", org_name: "Cuenta de Ana", adopted: [{ id: "first", name: "Uno" }, { id: "second", name: "Dos" }], refused: [], failed: [], unavailable: false, cause: null });
  assert.ok(await until(() => doc.body.textContent.includes("Trajimos 2 workspaces a Cuenta de Ana")), "el aviso dice cuántos y a dónde");
  const see = [...doc.querySelectorAll("[data-adoption-report] button")].find((b) => b.textContent === "Ver");
  assert.ok(see); see.click();
  assert.deepEqual(notice.opened, ["first"]);
  notice.adopt({ context: "ctx-0", org: "org-0", org_name: "Cuenta de Ana", adopted: [], refused: [{ id: "qlocal01", name: "Uno", reason: "id_taken" }], failed: [{ id: "qlocal02", name: "Dos", reason: "id_format" }], unavailable: true, cause: "adoption_disabled" });
  assert.ok(await until(() => doc.body.textContent.includes("No se pudieron traer tus workspaces")), "el fallo no es un diálogo: es un aviso");
  assert.ok(doc.body.textContent.includes("ya está en otra cuenta"));
  assert.ok(doc.body.textContent.includes("La adopción está apagada en el servidor."));
  const retryAdoption = [...doc.querySelectorAll("[data-adoption-report] button")].find((b) => b.textContent === "Reintentar");
  assert.ok(retryAdoption); retryAdoption.click();
  assert.equal(notice.retries(), 1);
  notice.dispose(); root.replaceChildren();

});
