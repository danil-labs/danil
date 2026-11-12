/**
 * A build deployed after the tab loaded is offered, not imposed: the notice asks
 * and «Para después» keeps the tab. A chunk the deploy removed reloads only when
 * no app is on screen yet; with the app mounted it brings the notice back.
 * Mounts `dist-web/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const pageWith = (entry) => `<!doctype html><html><head><script type="module" src="/terminus/assets/${entry}.js"></script></head></html>`;

async function open(t) {
  const own = globalThis.fetch;
  const page = { html: null };
  globalThis.fetch = async (input, init) => {
    const url = String(input?.url ?? input);
    if (url.endsWith("/terminus/") && page.html) return new Response(page.html, { status: 200 });
    if (url.endsWith("/v1/identity/me")) return Response.json({ id: "user_A", name: "Ana", workspace: "11", organizations: [] });
    if (url.endsWith("/v1/workspaces")) return Response.json({ items: [{ id: "11", org: "org_A", name: "Alpha", role: "owner" }], next_cursor: null });
    if (url.includes("/v1/messaging/")) return Response.json({ data: [], page: { has_more: false, next_cursor: null } });
    if (url.startsWith("http://localhost/") && url.includes("/assets/")) return new Response("");
    return own(input, init);
  };
  globalThis.fetch.__jsdomApp = true;
  t.after(() => {
    globalThis.fetch = own;
  });
  let w;
  const app = await boot("listo", "web-stale-chunk", {}, undefined, {}, {
    web: true,
    beforeImport: (win) => {
      w = win;
    },
  });
  await sleep(1500);
  const notice = () => w.document.querySelector("[data-web-update]");
  const check = async () => {
    Object.defineProperty(w.document, "visibilityState", { value: "visible", configurable: true });
    w.document.dispatchEvent(new w.Event("visibilitychange"));
    await sleep(100);
  };
  return { app, w, page, notice, check };
}

test("a new build is offered, a gone chunk asks, and «Para después» keeps the tab", async (t) => {
  const { app, w, page, notice, check } = await open(t);
  page.html = w.document.documentElement.outerHTML;
  await check();
  assert.equal(notice(), null, "the same build says nothing");

  page.html = pageWith("bootstrap-new").replace("/terminus/assets/", "/elsewhere/");
  await check();
  assert.equal(notice(), null, "another app's page, like the sign-in, is not an update");

  page.html = pageWith("bootstrap-new");
  await check();
  assert.match(notice()?.textContent ?? "", /Nueva versión de esta página/);

  w.document.querySelector("[data-web-update-later]").click();
  await sleep(50);
  assert.equal(notice(), null, "«Para después» closes it");
  await check();
  assert.equal(notice(), null, "the build already postponed does not ask again");
  assert.ok(!app.failures.some((f) => /navigation/i.test(f)), "nothing reloads the page");

  const event = new w.Event("vite:preloadError", { cancelable: true });
  w.dispatchEvent(event);
  await sleep(50);
  assert.equal(event.defaultPrevented, true, "the failed chunk is handled");
  assert.ok(notice(), "a chunk gone brings the notice back");
  assert.equal(w.sessionStorage.getItem("terminus.web.reloaded-at"), null, "no forced reload");
  w.document.querySelector("[data-web-update-later]").click();
  await sleep(50);

  page.html = pageWith("bootstrap-newer");
  await check();
  assert.ok(notice(), "a newer deploy asks again");

  w.document.querySelector("[data-web-update-reload]").click();
  await sleep(50);
  assert.ok(app.failures.some((f) => /navigation/i.test(f)), `«Recarga ahora» reloads: ${app.failures.join(" | ")}`);
});
