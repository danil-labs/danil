import assert from "node:assert/strict";
import test from "node:test";
import { platformSession, PlatformSessionError } from "../../src/web/platform-session.ts";
import { webSessionDeployment } from "../../src/web/session-config.ts";

test("deployment selects complete session paths and rejects invalid configuration", () => {
  assert.equal(webSessionDeployment({}).kind, "legacy");
  const deployment = webSessionDeployment({ DANIL_WEB_SESSION: "platform" });
  assert.deepEqual(deployment, { kind: "platform", origin: "https://api.danil.ai", timeoutMs: 15000 });
  assert.equal(webSessionDeployment({ DANIL_WEB_SESSION: "platform", DANIL_WEB_API_ORIGIN: "http://localhost:8787" }).kind, "platform");
  for (const env of [
    { DANIL_WEB_SESSION: "typo" },
    { DANIL_WEB_SESSION: "platform", DANIL_WEB_API_ORIGIN: "https://evil.test/path" },
    { DANIL_WEB_SESSION: "platform", DANIL_WEB_API_ORIGIN: "http://api.danil.ai" },
    { DANIL_WEB_SESSION: "platform", DANIL_WEB_API_TIMEOUT_MS: "0" },
  ]) assert.throws(() => webSessionDeployment(env));
});

test("cookie session reads profile and all workspace pages, selects with CSRF and logs out", async () => {
  const calls: Request[] = [];
  const request: typeof fetch = async (input, init) => {
    const r = new Request(input, init);
    calls.push(r);
    assert.equal(r.credentials, "include");
    assert.equal(r.cache, "no-store");
    assert.equal(r.redirect, "error");
    assert.equal(r.headers.has("authorization"), false);
    assert.equal(r.headers.has("x-danil-workspace"), false);
    const url = new URL(r.url);
    assert.equal(url.origin, "https://api.danil.ai");
    if (url.pathname.endsWith("/me")) return Response.json({ id: "user_A", name: "A", workspace: "11", organizations: [] });
    if (url.pathname.endsWith("/csrf")) return Response.json({ csrf_token: "bound-to-session" });
    if (url.pathname.endsWith("/select")) {
      assert.equal(r.headers.get("x-csrf-token"), "bound-to-session");
      assert.equal(r.headers.get("idempotency-key"), "selection-1");
      assert.deepEqual(await r.json(), { workspace: "9007199254740993" });
      return Response.json({ workspace: "9007199254740993", ctx: "ctx2", authz_ver: 2 });
    }
    if (url.pathname.endsWith("/logout")) {
      assert.equal(r.headers.get("x-csrf-token"), "bound-to-session");
      return new Response(null, { status: 204 });
    }
    assert.equal(url.pathname, "/v1/workspaces");
    return Response.json({ items: [{ id: url.search ? "9007199254740993" : "11", org: "org_A", name: "Workspace", role: "owner" }], next_cursor: url.search ? null : "opaque+/=" });
  };
  const api = platformSession({ origin: "https://api.danil.ai", timeoutMs: 1000 }, request);
  assert.equal(new URL(api.loginUrl("https://app.danil.ai/")).searchParams.get("return_to"), "https://app.danil.ai/");
  assert.equal((await api.me()).id, "user_A");
  assert.deepEqual((await api.workspaces()).map(w => w.id), ["11", "9007199254740993"]);
  assert.equal((await api.select("9007199254740993", "selection-1")).workspace, "9007199254740993");
  await api.logout();
  assert.equal(calls.filter(r => r.method === "POST").length, 2);
});

for (const status of [401, 403, 429, 503]) test(`HTTP ${status} stays distinct, without login or legacy fallback`, async () => {
  let calls = 0;
  const api = platformSession({ origin: "https://api.danil.ai", timeoutMs: 1000 }, async () => {
    calls++;
    return Response.json({ code: "dependency_failure" }, { status, headers: { "retry-after": "10", "content-type": "application/problem+json" } });
  });
  await assert.rejects(api.me(), (e: unknown) => e instanceof PlatformSessionError && e.status === status && e.retryAfter === "10");
  assert.equal(calls, 1);
});

test("invalid bodies, repeated cursors and expired requests fail without partial success", async () => {
  const options = { origin: "https://api.danil.ai", timeoutMs: 10 };
  await assert.rejects(platformSession(options, async () => Response.json({ access_token: "must-not-be-a-profile" })).me());
  await assert.rejects(platformSession(options, async () => Response.json({ items: [], next_cursor: "loop" })).workspaces());
  const api = platformSession(options, async (_input, init) => new Promise((_resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error("request did not abort")), 1000);
    init?.signal?.addEventListener("abort", () => { clearTimeout(deadline); reject(init.signal?.reason); }, { once: true });
  }));
  await assert.rejects(api.me(), { name: "TimeoutError" });
});
