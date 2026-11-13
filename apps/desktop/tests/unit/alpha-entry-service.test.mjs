import assert from "node:assert/strict";
import test from "node:test";
import worker from "../../alpha-entry/worker.mjs";

test("platform-owned routes cannot be revived by a Bearer, method or BFF binding", async () => {
  let calls = 0;
  const env = { APPV2_BFF: { fetch: async () => { calls++; return Response.json({}); } } };
  for (const path of ["/auth/organization/workspaces", "/auth/account/business/summary", "/auth/account/business/seats", "/auth/account/business/fiscal", "/auth/profile", "/api/agents", "/api/agents/7/connections", "/api/http_tools", "/api/account_variables", "/api/credits/balance", "/api/workspace/enter", "/api/messaging/reply", "/api/inbox/conversations/12/messages"]) {
    for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
      const response = await worker.fetch(new Request(`https://alfa-app.danil.ai/alpha-api${path}`, { method, headers: { Authorization: "Bearer old-token" } }), env);
      assert.equal(response.status, 404, `${method} ${path}`);
    }
  }
  assert.equal(calls, 0);
});

test('every retired proxy and legacy login path is closed without contacting a backend', async () => {
  let calls = 0;
  const backend = { fetch: async () => { calls++; return Response.json({}); } };
  const env = { APPV2_BFF: backend, DESKTOP_AUTH: backend, TERMINUS_WEB: backend };
  for (const path of ['/alpha-api/auth/emails', '/alpha-api/api/channels', '/alpha-api/api/marketing/campaigns', '/alpha-api/api/contacts', '/auth/desktop', '/auth/workos/start']) {
    const result = await worker.fetch(new Request(`https://alfa-app.danil.ai${path}`, { headers: { Authorization: 'Bearer old' } }), env);
    assert.equal(result.status, 404, path);
  }
  assert.equal(calls, 0);
});
