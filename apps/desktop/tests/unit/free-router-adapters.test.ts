/** Los adaptadores del Free router: las órdenes del motor por su nombre y el borde de Desk y de la web. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { EdgeError, type EdgeTransport } from "@terminus/computers";

type Call = { command: string; args: unknown; options: unknown };
function tauri(reply: (c: Call) => unknown) {
  const calls: Call[] = [];
  (globalThis as { window?: unknown }).window = {
    __TAURI_INTERNALS__: {
      invoke: async (command: string, args?: unknown, options?: unknown) => {
        const c = { command, args, options };
        calls.push(c);
        return reply(c);
      },
    },
  };
  return calls;
}
const adapters = () => import("../../src/features/settings/free-router-adapters.ts");

test("each engine order reaches the workspace's engine by its own name and scope", async () => {
  const calls = tauri(() => ({ ok: true }));
  const { freeRouterEngine } = await adapters();
  const scope = { headers: { "x-terminus-workspace": "ws_1" } };
  const engine = freeRouterEngine(scope);
  for (const command of ["set_free_router_union", "free_router_binding", "prove_free_router_binding", "set_free_router_grant", "clear_free_router_grant"]) {
    await engine(command, { workspace: "q3ce37ff" });
  }
  assert.deepEqual(calls.map((c) => c.command), ["set_free_router_union", "free_router_binding", "prove_free_router_binding", "set_free_router_grant", "clear_free_router_grant"]);
  for (const c of calls) assert.deepEqual(c.options, scope);
  await assert.rejects(engine("danil_disconnect", {}), (e) => e === "free_router.invalid_request");
  assert.equal(calls.length, 5, "an order outside the five never leaves the window");
});

test("Desk's edge keeps the method, key and Retry-After of danil_edge_fetch", async () => {
  const calls = tauri(() => ({ status: 503, body: null, retry_after_ms: 2000 }));
  const { freeRouterDeskEdge } = await adapters();
  const answer = await freeRouterDeskEdge("DELETE", "/v1/workspaces/42/free-router/consent", undefined, "k1");
  assert.deepEqual(answer, { status: 503, body: null, retryAfterMs: 2000 });
  assert.equal(calls[0].command, "danil_edge_fetch");
  assert.deepEqual(calls[0].args, { method: "DELETE", path: "/v1/workspaces/42/free-router/consent", idempotencyKey: "k1" });
});

test("the web edge sends writes with their method, key and CSRF transport, and turns refusals into statuses", async () => {
  const seen: { kind: string; path: string; init?: RequestInit }[] = [];
  const transport: EdgeTransport = {
    call: async (path, init) => { seen.push({ kind: "call", path, init }); return Response.json({ offered: true }); },
    mutation: async (path, init) => {
      seen.push({ kind: "mutation", path, init });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (path.endsWith("/grant")) throw new EdgeError(429, "3", "rate_limited");
      throw new EdgeError(409, null, "revision_conflict");
    },
  };
  const { freeRouterWebEdge } = await adapters();
  const edge = freeRouterWebEdge(transport);
  assert.deepEqual(await edge("GET", "/v1/workspaces/42/free-router"), { status: 200, body: { offered: true } });
  assert.deepEqual(await edge("DELETE", "/v1/workspaces/42/free-router/engine-workspaces/w/bindings/b", undefined, "k2"), { status: 204, body: null });
  assert.deepEqual(await edge("PUT", "/v1/workspaces/42/free-router/consent", { revision: 1 }, "k3"), { status: 409, body: { code: "revision_conflict" } });
  assert.deepEqual(await edge("POST", "/v1/workspaces/42/free-router/grant", { binding_id: "b", nonce: "n" }, "k4"), { status: 429, body: { code: "rate_limited" }, retryAfterMs: 3000 });
  assert.deepEqual(seen.map((s) => [s.kind, s.path, s.init?.method ?? null]), [
    ["call", "workspaces/42/free-router", null],
    ["mutation", "workspaces/42/free-router/engine-workspaces/w/bindings/b", "DELETE"],
    ["mutation", "workspaces/42/free-router/consent", "PUT"],
    ["mutation", "workspaces/42/free-router/grant", "POST"],
  ]);
  assert.deepEqual(seen[1].init?.headers, { "Idempotency-Key": "k2" });
  assert.equal(seen[1].init?.body, undefined, "a DELETE carries no body");
  assert.equal(seen[2].init?.body, JSON.stringify({ revision: 1 }));
  await assert.rejects(freeRouterWebEdge({ call: async () => { throw new TypeError("offline"); }, mutation: async () => new Response() })("GET", "/v1/workspaces/42/free-router"), TypeError);
});
