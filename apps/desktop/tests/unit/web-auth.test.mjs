import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

globalThis.BroadcastChannel = undefined;
const SUPABASE = "https://supabase.test";
let mounts = 0;

async function page(path, handler) {
  const requests = [];
  const own = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input?.url ?? input);
    if (new URL(url).origin !== SUPABASE) throw new Error(`unexpected request: ${url}`);
    const request = { url, method: init?.method, body: init?.body ? JSON.parse(init.body) : null };
    requests.push(request);
    const answer = handler(request);
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json", "x-supabase-api-version": "2024-01-01" } });
  };
  let w;
  const app = await boot("listo", `web-auth-${++mounts}`, {}, undefined, {}, {
    web: true,
    beforeImport: (win) => {
      w = win;
      win.history.replaceState(null, "", path);
      win.terminusWeb = { supabaseUrl: SUPABASE, supabaseKey: "public-anon-key" };
    },
  });
  await sleep(300);
  return { app, w, requests, restore: () => { globalThis.fetch = own; } };
}

function fill(w, name, value) {
  const input = w.document.querySelector(`[name="${name}"]`);
  input.value = value;
  input.dispatchEvent(new w.Event("input", { bubbles: true }));
}
const click = (w, text) => [...w.document.querySelectorAll("button")].find((button) => button.textContent.trim() === text).click();
const submit = (w) => w.document.querySelector("form").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));

test("new people can request access by email without a signup request", async () => {
  const { app, w, requests, restore } = await page("/terminus/auth?next=%2Fterminus%2Fconnect%3Fcode%3DABCD-EFGH", () => ({ status: 500, body: {} }));
  try {
    const link = w.document.querySelector('[data-access-request] a');
    assert.equal(link.textContent.trim(), "Solicitar acceso");
    const mail = new URL(link.href);
    assert.equal(mail.protocol, "mailto:");
    assert.equal(mail.pathname, "hola@danil.ai");
    assert.equal(mail.searchParams.get("subject"), "Solicitar acceso a Danil");
    assert.match(w.document.querySelector('[data-access-request]').textContent, /hola@danil.ai/);
    assert.equal(w.document.querySelector('[autocomplete="new-password"]'), null);
    assert.equal(requests.length, 0);
    assert.deepEqual(app.failures, []);
  } finally { restore(); }
});

test("incorrect credentials keep the account and destination, then allow a retry", async () => {
  const { app, w, requests, restore } = await page("/terminus/auth?next=%2Fterminus%2Fm%2F", () => ({ status: 400, body: { code: "invalid_credentials", msg: "Invalid login credentials" } }));
  try {
    fill(w, "email", "persona@example.com");
    fill(w, "password", "incorrect");
    submit(w);
    await sleep(200);
    assert.match(w.document.querySelector('[role="alert"]')?.textContent, /no son correctos/);
    assert.equal(w.document.querySelector('[name="email"]').value, "persona@example.com");
    assert.equal(w.document.querySelector('[name="password"]').value, "");
    assert.equal(new URL(requests[0].url).searchParams.get("grant_type"), "password");
    assert.equal(new URL(w.location.href).searchParams.get("next"), "/terminus/m/");
    assert.deepEqual(app.failures, []);
  } finally { restore(); }
});

test("a rejected callback is explained and its credentials are removed without entering the gate", async () => {
  const { app, w, requests, restore } = await page("/terminus/auth?next=%2Fterminus%2Fconnect%3Fcode%3DABCD-EFGH#error=access_denied&error_description=secret", () => ({ status: 500, body: {} }));
  try {
    assert.match(w.document.querySelector('[role="alert"]')?.textContent, /El enlace venció/);
    assert.equal(w.location.hash, "");
    assert.equal(new URL(w.location.href).searchParams.get("next"), "/terminus/connect?code=ABCD-EFGH");
    assert.equal(requests.length, 0);
    assert.deepEqual(app.failures, []);
  } finally { restore(); }
});

test("email confirmation in a fresh tab stores the identity in the shared Danil session key", async () => {
  const { app, w, requests, restore } = await page("/terminus/auth?next=%2Fterminus%2Fconnect%3Fcode%3DABCD-EFGH&token_hash=confirmation-token&type=signup", () => ({
    status: 200,
    body: {
      access_token: "confirmed-token", refresh_token: "confirmed-refresh", token_type: "bearer", expires_in: 3600,
      user: { id: "same-danil-person", email: "persona@example.com", email_confirmed_at: "2026-10-27T00:00:00Z", app_metadata: {}, user_metadata: {} },
    },
  }));
  try {
    assert.equal(new URL(requests[0].url).pathname, "/auth/v1/verify");
    assert.equal(requests[0].body.token_hash, "confirmation-token");
    const saved = JSON.parse(w.localStorage.getItem("sb-supabase-auth-token"));
    assert.equal(saved.user.id, "same-danil-person");
    assert.equal(saved.access_token, "confirmed-token");
    assert.equal(w.location.search.includes("token_hash"), false);
    assert.equal(new URL(w.location.href).searchParams.get("next"), "/terminus/connect?code=ABCD-EFGH");
    assert.deepEqual(app.failures.filter((error) => !error.includes("Not implemented: navigation")), []);
  } finally { restore(); }
});

test("existing unconfirmed accounts can resend confirmation and respect the rate limit", async () => {
  const { w, requests, restore } = await page("/terminus/auth", (request) => new URL(request.url).pathname.endsWith("/token")
    ? { status: 400, body: { code: "email_not_confirmed", msg: "Email not confirmed" } }
    : { status: 429, body: { code: "over_email_send_rate_limit", msg: "Rate limit" } });
  try {
    fill(w, "email", "persona@example.com");
    fill(w, "password", "long-test-password");
    submit(w);
    await sleep(200);
    assert.equal(w.document.querySelector('[data-web-auth]').dataset.webAuth, "confirmation");
    click(w, "Reenviar correo");
    await sleep(200);
    assert.match(w.document.querySelector('[role="alert"]')?.textContent, /demasiados intentos/);
    assert.equal(requests.length, 2);
    assert.equal(new URL(requests[1].url).pathname, "/auth/v1/resend");
    assert.equal([...w.document.querySelectorAll("button")].find((button) => button.textContent.trim() === "Reenviar correo").disabled, false);
  } finally { restore(); }
});
