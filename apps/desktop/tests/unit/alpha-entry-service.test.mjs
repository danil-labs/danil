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
