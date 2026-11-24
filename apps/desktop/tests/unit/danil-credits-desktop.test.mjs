import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopCredits } from "../../../../packages/features/chat/src/queries/danil-credits-desktop.ts";

test("multi-org desktop workspace scopes /v1/workspaces and /v1/credits/balance to the workspace organization context", async () => {
  const calls = [];
  const source = createDesktopCredits({
    listWorkspaces: async () => ({
      active: "fqgx1w8m",
      workspaces: [
        { id: "ws_other", account: { org: "org_A" } },
        { id: "fqgx1w8m", account: { org: "org_B" } },
      ],
    }),
    readSessionStatus: async () => ({
      state: "connected",
      sessions: [
        {
          contexts: [
            { context_id: "ctx_A", org: "org_A" },
            { context_id: "ctx_B", org: "org_B" },
          ],
        },
      ],
    }),
    sendEdge: async (method, path, _body, _key, context) => {
      calls.push({ method, path, context });
      if (path === "/v1/workspaces") {
        assert.equal(context, "ctx_B");
        return {
          status: 200,
          body: { items: [{ id: "1000000000130", engine_workspace_id: "fqgx1w8m", org: "org_B" }] },
        };
      }
      if (path === "/v1/credits/balance") {
        assert.equal(context, "ctx_B");
        return {
          status: 200,
          body: {
            organization_id: "org_B",
            available: { currency: "MXN", amount_micro: "974880000" },
          },
        };
      }
      throw new Error(`unexpected path: ${path}`);
    },
  });

  const amount = await source.readBalance(new AbortController().signal);
  assert.equal(amount, 974.88);
  assert.deepEqual(calls, [
    { method: "GET", path: "/v1/workspaces", context: "ctx_B" },
    { method: "GET", path: "/v1/credits/balance", context: "ctx_B" },
  ]);
});

test("unsealed workspace scans session contexts when default context rejects with 403", async () => {
  const seenContexts = [];
  const source = createDesktopCredits({
    listWorkspaces: async () => ({ active: "fqgx1w8m", workspaces: [{ id: "fqgx1w8m" }] }),
    readSessionStatus: async () => ({
      state: "connected",
      sessions: [{ contexts: [{ context_id: "ctx_B", org: "org_B" }] }],
    }),
    sendEdge: async (_method, path, _body, _key, context) => {
      seenContexts.push(`${path}@${context ?? "default"}`);
      if (path === "/v1/workspaces" && !context) {
        return { status: 403, body: { code: "workspace_forbidden" } };
      }
      if (path === "/v1/workspaces" && context === "ctx_B") {
        return {
          status: 200,
          body: { items: [{ id: "1000000000130", engine_workspace_id: "fqgx1w8m", org: "org_B" }] },
        };
      }
      if (path === "/v1/credits/balance" && context === "ctx_B") {
        return {
          status: 200,
          body: {
            organization_id: "org_B",
            available: { currency: "MXN", amount_micro: "12500000" },
          },
        };
      }
      return { status: 403, body: { code: "workspace_forbidden" } };
    },
  });

  const amount = await source.readBalance(new AbortController().signal);
  assert.equal(amount, 12.5);
  assert.deepEqual(seenContexts, [
    "/v1/workspaces@default",
    "/v1/workspaces@ctx_B",
    "/v1/credits/balance@ctx_B",
  ]);
});

test("legacy single-org session omits context and returns balance cleanly", async () => {
  const calls = [];
  const source = createDesktopCredits({
    listWorkspaces: async () => ({ active: "fqgx1w8m" }),
    readSessionStatus: async () => ({ state: "connected" }),
    sendEdge: async (_method, path, _body, _key, context) => {
      calls.push({ path, context });
      if (path === "/v1/workspaces") {
        return {
          status: 200,
          body: { items: [{ id: "1", engine_workspace_id: "fqgx1w8m", org: "org_solo" }] },
        };
      }
      return {
        status: 200,
        body: {
          organization_id: "org_solo",
          available: { currency: "MXN", amount_micro: "50000000" },
        },
      };
    },
  });

  const amount = await source.readBalance(new AbortController().signal);
  assert.equal(amount, 50);
  assert.deepEqual(calls, [
    { path: "/v1/workspaces", context: undefined },
    { path: "/v1/credits/balance", context: undefined },
  ]);
});
