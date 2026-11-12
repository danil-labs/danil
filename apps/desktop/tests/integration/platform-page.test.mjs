import assert from "node:assert/strict";
import test from "node:test";
import { boot } from "../helpers/jsdom-app.mjs";

// Requires a web bundle built with DANIL_WEB_SESSION=platform, and the ordinary desktop bundle.
async function until(read) {
  const deadline = Date.now() + 3000;
  while (!read()) {
    if (Date.now() >= deadline) throw new Error("Page condition timed out");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
let version = 0;
async function page(handler) {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === "http://localhost" && url.pathname.includes("/assets/")) return new Response("");
    assert.equal(url.origin, "https://api.danil.ai");
    assert.equal(init.credentials, "include");
    assert.equal(new Headers(init.headers).has("authorization"), false);
    return handler(url.pathname, init);
  };
  // The common mount helper's legacy registry stub uses this same /v1/workspaces path.
  globalThis.fetch.__jsdomApp = true;
  return boot("listo", `platform-${++version}`, {}, undefined, {}, { web: true, beforeImport(win) {
    win.history.replaceState(null, "", "/terminus/?signed_out=1");
    win.terminusWeb = { getToken: () => { throw new Error("Legacy token must not be read"); } };
  } });
}
const button = (w, text) => [...w.document.querySelectorAll("button")].find(b => b.textContent.includes(text));
const profile = () => Response.json({ id: "user_A", name: "A", organizations: [] });
const workspaces = () => Response.json({ items: [{ id: "11", org: "org_A", name: "Alpha", role: "owner" }], next_cursor: null });

test("platform page selects, retains an uncertain operation's key and signs out without login loop", async () => {
  const keys = [];
  let calls = 0;
  const app = await page((path, init) => {
    calls++;
    if (path.endsWith("/me")) return profile();
    if (path.endsWith("/workspaces")) return workspaces();
    if (path.endsWith("/csrf")) return Response.json({ csrf_token: "bound" });
    if (path.endsWith("/select")) {
      keys.push(new Headers(init.headers).get("idempotency-key"));
      return keys.length === 1 ? new Response(null, { status: 503 }) : Response.json({ workspace: "11", ctx: "ctx", authz_ver: 2 });
    }
    assert.ok(path.endsWith("/logout"));
    return new Response(null, { status: 204 });
  });
  const w = app.w;
  await until(() => button(w, "Alpha"));
  button(w, "Alpha").click();
  await until(() => w.document.querySelector('[role="alert"]'));
  button(w, "Alpha").click();
  await until(() => button(w, "Alpha").getAttribute("aria-pressed") === "true");
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  button(w, "Cerrar sesión").click();
  await until(() => w.document.querySelector('a[href*="/v1/identity/login"]'));
  assert.equal(w.document.querySelector('[aria-pressed="true"]'), null);
  assert.equal(calls, 8);
  assert.deepEqual(app.failures, []);
});

test("401 shows an explicit sign-in link with a clean return, without starting login", async () => {
  let calls = 0;
  const app = await page(() => { calls++; return new Response(null, { status: 401 }); });
  await until(() => app.w.document.querySelector('a[href*="/v1/identity/login"]'));
  const link = app.w.document.querySelector('a[href*="/v1/identity/login"]');
  assert.equal(new URL(link.href).searchParams.get("return_to"), "http://localhost/terminus/");
  assert.equal(calls, 1);
  assert.deepEqual(app.failures, []);
});

test("dependency failure stays visible and can recover without signing in again", async () => {
  let down = true;
  const app = await page(path => down ? new Response(null, { status: 503 }) : path.endsWith("/me") ? profile() : workspaces());
  await until(() => app.w.document.querySelector('[role="alert"]'));
  assert.equal(app.w.document.querySelector('a[href*="/login"]'), null);
  down = false;
  button(app.w, "Reintentar").click();
  await until(() => button(app.w, "Alpha"));
  assert.equal(app.w.document.querySelector('[role="alert"]'), null);
  assert.deepEqual(app.failures, []);
});
