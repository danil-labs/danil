import assert from "node:assert/strict";
import test from "node:test";
import worker from "../../alpha-entry/worker.mjs";

const origin = "https://alfa-app.danil.ai";
const bff = (seen) => ({ fetch: async (request) => { seen.push(request); return Response.json({ ok: true }); } });
const read = (path, env, init = {}) =>
  worker.fetch(new Request(`${origin}/alpha-api${path}`, { headers: { Authorization: "Bearer token" }, ...init }), env);

test("customer service reads reach the BFF without a query", async () => {
  for (const path of ["/api/agents", "/api/agents/7", "/api/agents/7/connections", "/api/calendar/connections", "/api/http_tools", "/api/account_variables"]) {
    const seen = [];
    const response = await read(path, { APPV2_BFF: bff(seen) });
    assert.equal(response.status, 200, path);
    assert.equal(new URL(seen[0].url).pathname, path);
    assert.equal(new URL(seen[0].url).search, "");
  }
});

test("the list stays closed around those reads", async () => {
  const seen = [];
  const env = { APPV2_BFF: bff(seen) };
  for (const path of ["/api/agents/7/test-chat", "/api/agents/0", "/api/agents/abc", "/api/agents/configurations", "/api/calendar/1/agents", "/api/account_variables/KEY", "/api/http_tools/agent-tools"]) {
    assert.equal((await read(path, env)).status, 404, path);
  }
  assert.equal((await read("/api/agents?include=available", env)).status, 400);
  assert.equal((await read("/api/agents/99999999999999999999", env)).status, 400);
  assert.equal((await read("/api/agents/7", env, { method: "PATCH", body: "{}" })).status, 405);
  assert.equal(seen.length, 0);
});

test("without a session nothing is forwarded", async () => {
  const seen = [];
  const response = await worker.fetch(new Request(`${origin}/alpha-api/api/agents`), { APPV2_BFF: bff(seen) });
  assert.equal(response.status, 401);
  assert.equal(seen.length, 0);
});

test("the workspace key reaches the BFF only with its shape", async () => {
  const seen = [];
  const env = { APPV2_BFF: bff(seen) };
  assert.equal((await read("/api/agents", env, { headers: { Authorization: "Bearer token", "X-Danil-Workspace": "a:476" } })).status, 200);
  assert.equal(seen[0].headers.get("X-Danil-Workspace"), "a:476");
  assert.equal((await read("/api/agents", env, { headers: { Authorization: "Bearer token", "X-Danil-Workspace": "476" } })).status, 400);
  assert.equal(seen.length, 1);
  assert.equal((await read("/api/agents", env)).status, 200);
  assert.equal(seen[1].headers.get("X-Danil-Workspace"), null);
});

test("entering a workspace is a closed write", async () => {
  const seen = [];
  const env = { APPV2_BFF: bff(seen) };
  const post = (body, headers = {}) => worker.fetch(new Request(`${origin}/alpha-api/api/workspace/enter`, {
    method: "POST", body: JSON.stringify(body),
    headers: { Authorization: "Bearer token", Origin: origin, "Content-Type": "application/json", ...headers },
  }), env);
  assert.equal((await post({ key: "a:476" })).status, 200);
  assert.equal(await seen[0].text(), JSON.stringify({ key: "a:476" }));
  assert.equal((await post({ key: "a:476", account: 1 })).status, 400);
  assert.equal((await post({ key: "476" })).status, 400);
  assert.equal((await post({ key: "a:476" }, { Origin: "https://evil.test" })).status, 403);
  assert.equal((await post({ key: "a:476" }, { "X-Danil-Actor": "ai" })).status, 403);
  assert.equal(seen.length, 1);
  const staging = await worker.fetch(new Request("https://staging-app.danil.ai/alpha-api/api/workspace/enter", {
    method: "POST", body: JSON.stringify({ key: "a:476" }),
    headers: { Authorization: "Bearer token", Origin: "https://staging-app.danil.ai", "Content-Type": "application/json" },
  }), { ...env, ENTRY_HOST: "staging-app.danil.ai" });
  assert.equal(staging.status, 200, "the staging host enters with its own origin");
  assert.equal(seen[1].headers.get("Origin"), "https://staging-app.danil.ai");
});
