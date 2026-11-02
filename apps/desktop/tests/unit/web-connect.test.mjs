/**
 * `app.danil.ai/terminus/connect?code=…`: with the Danil session the browser
 * already has, the page shows which computer asks to join, lets the person
 * rename it and approves it; an expired code says so. Mounts `dist-web/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

// Each mount is a tab of its own; in one process their Supabase clients would
// share Node's BroadcastChannel and hand jsdom a Node MessageEvent.
globalThis.BroadcastChannel = undefined;

const SUPABASE = "https://supabase.test";
const API = "https://machines.danil.ai/v1/devices";
const session = (token) => JSON.stringify({
  access_token: token,
  refresh_token: `r-${token}`,
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "u1", aud: "authenticated", role: "authenticated", email: "persona@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
});

let mounts = 0;

async function page(path, handler) {
  const requests = [];
  const own = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input?.url ?? input);
    if (!url.startsWith(API)) return own(input, init);
    const request = { url, method: init?.method ?? "GET", token: new Headers(init?.headers).get("authorization"), body: init?.body ? JSON.parse(init.body) : null };
    requests.push(request);
    const { status, body } = handler(request);
    return new Response(JSON.stringify(body ?? {}), { status });
  };
  let w;
  const app = await boot("listo", `web-connect-${++mounts}`, {}, undefined, { "sb-supabase-auth-token": session("stored") }, {
    web: true,
    beforeImport: (win) => {
      w = win;
      win.history.replaceState(null, "", path);
      win.terminusWeb = { supabaseUrl: SUPABASE, supabaseKey: "public-anon-key" };
    },
  });
  await sleep(300);
  return { app, w, requests, restore: () => (globalThis.fetch = own) };
}

test("the page shows the computer, takes a new name and approves the code", async () => {
  const { app, w, requests, restore } = await page("/terminus/connect?code=wdjb-mjht", (r) =>
    r.url.includes("/lookup") ? { status: 200, body: { hostname: "alberto-mbp", platform: "macOS" } } : { status: 200, body: { computer_id: "cmp_1" } },
  );
  try {
    const root = () => w.document.querySelector("[data-web-connect]");
    const text = () => root()?.textContent ?? "";
    assert.equal(root()?.dataset.webConnect, "ask", text());
    assert.equal(requests[0].url, `${API}/lookup?user_code=WDJB-MJHT`);
    assert.equal(requests[0].token, "Bearer stored", "it uses the session the Danil app stored");
    assert.ok(text().includes("¿Conectar alberto-mbp (macOS) a tu cuenta?"), text());
    assert.ok(!w.document.querySelector("[data-web-gate]"), "no computer picker on this page");

    const input = root().querySelector("input");
    assert.equal(input.value, "alberto-mbp");
    assert.ok(text().includes("Nombre de esta computadora"), "the field names the machine, not the account");
    assert.ok(text().includes("No cambia tu nombre en la cuenta."), text());
    input.value = "Mac de Alberto";
    input.dispatchEvent(new w.Event("input", { bubbles: true }));
    root().querySelector("form").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
    await sleep(300);
    const approve = requests.find((r) => r.method === "POST");
    assert.equal(approve?.url, `${API}/approve`);
    assert.deepEqual(approve?.body, { user_code: "WDJB-MJHT", name: "Mac de Alberto" });
    assert.equal(root()?.dataset.webConnect, "done");
    assert.ok(text().includes("Listo, vuelve a Danil."));
    assert.deepEqual(app.failures, []);
  } finally {
    restore();
  }
});

test("an unknown or expired code and a session without account are explained", async () => {
  for (const [status, body, view, phrase] of [
    [404, { error: "invalid_user_code" }, "invalid", "no existe o ya venció"],
    [403, { error: "unknown_user" }, "no_account", "no corresponde a una cuenta de Danil"],
  ]) {
    const { w, restore } = await page(`/terminus/connect?code=AAAA-${status}`, () => ({ status, body }));
    try {
      const root = w.document.querySelector("[data-web-connect]");
      assert.equal(root?.dataset.webConnect, view);
      assert.ok(root.textContent.includes(phrase), root.textContent);
    } finally {
      restore();
    }
  }
});

const lookup = (r, approve) => {
  if (r.url.includes("/lookup")) return { status: 200, body: { hostname: "vm-linux", platform: "linux", expires_at: "2026-10-19T12:15:00Z" } };
  if (r.url.endsWith("/approve")) return approve;
  return { status: 200, body: { denied: true } };
};

test("approving without a license or on a used code says why", async () => {
  for (const [approve, view] of [
    [{ status: 403, body: { error: "license_required" } }, "license"],
    [{ status: 409, body: { error: "code_already_used" } }, "used"],
  ]) {
    const { w, restore } = await page("/terminus/connect?code=BCDF-GHJK", (r) => lookup(r, approve));
    try {
      const root = () => w.document.querySelector("[data-web-connect]");
      root().querySelector("form").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
      await sleep(300);
      assert.equal(root()?.dataset.webConnect, view);
      if (view === "license") {
        const text = root().textContent;
        assert.ok(text.includes("Activa Danil") && text.includes("99 MXN al mes con IVA incluido"), text);
        const buttons = [...root().querySelectorAll("[data-terminus-license] button")].map((b) => b.textContent.trim());
        assert.deepEqual(buttons, ["Empezar prueba gratis", "Ya lo activé · Reintentar"]);
        root().querySelector("[data-license-retry]").click();
        await sleep(300);
        assert.equal(root()?.dataset.webConnect, "ask", "retrying looks the code up again");
      }
    } finally {
      restore();
    }
  }
});

test("the person can decline the computer", async () => {
  const { w, requests, restore } = await page("/terminus/connect?code=BCDF-GHJK", (r) => lookup(r, { status: 500 }));
  try {
    const root = () => w.document.querySelector("[data-web-connect]");
    [...root().querySelectorAll("button")].find((b) => b.textContent.trim() === "No conectar").click();
    await sleep(300);
    assert.deepEqual(requests.find((r) => r.url.endsWith("/deny"))?.body, { user_code: "BCDF-GHJK" });
    assert.ok(!requests.some((r) => r.url.endsWith("/approve")));
    assert.equal(root()?.dataset.webConnect, "denied");
    assert.ok(root().textContent.includes("no se conectó"));
  } finally {
    restore();
  }
});
