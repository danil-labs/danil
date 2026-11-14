/**
 * Las llamadas de Desk al borde (`danil_edge_fetch` en Rust, con el Bearer):
 * Rust contesta el status tal cual; un 404 o un 501 se reintentan aquí solos,
 * con backoff y la misma `Idempotency-Key`, hasta que la ruta aparece.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

type Call = { command: string; args: Record<string, unknown> | undefined };

function window(reply: (args: Record<string, unknown> | undefined, n: number) => unknown) {
  const calls: Call[] = [];
  (globalThis as { window?: unknown }).window = {
    __TAURI_INTERNALS__: {
      invoke: async (command: string, args?: Record<string, unknown>) => {
        calls.push({ command, args });
        if (command !== "danil_edge_fetch") throw { detail: "command" };
        return reply(args, calls.length - 1);
      },
    },
  };
  return calls;
}

const edge = () => import("../../src/lib/edge.ts");
const ok = (body: unknown, extra: Record<string, unknown> = {}) => ({ status: 200, body, ...extra });
const missing = { status: 501, body: null, retry_after_ms: 5 };

test("me, organizations and workspaces go through Rust with the contract paths", async () => {
  const calls = window((args) => ok({ path: args?.path }, args?.method === "POST" ? { idempotency_key: "k" } : {}));
  const { me, organizations, workspaces, selectOrganization, selectWorkspace } = await edge();
  await me();
  await organizations();
  await workspaces();
  await selectOrganization("org_1");
  await selectWorkspace("ws_1");
  assert.deepEqual(
    calls.map((c) => [c.args?.method, c.args?.path, c.args?.body ?? null]),
    [
      ["GET", "/v1/identity/me", null],
      ["GET", "/v1/identity/organizations", null],
      ["GET", "/v1/workspaces", null],
      ["POST", "/v1/identity/organizations/select", { organization_id: "org_1" }],
      ["POST", "/v1/workspaces/select", { workspace: "ws_1" }],
    ],
  );
});

test("a route that does not exist yet is retried until it appears", async () => {
  const calls = window((_args, n) => (n < 3 ? missing : ok({ items: [{ id: "org_1", name: "Danil", plan: "enterprise", role: "owner" }] })));
  const { organizations } = await edge();
  const got = await organizations({ minDelayMs: 1 });
  assert.equal(got.items[0].id, "org_1");
  assert.equal(calls.length, 4);
});

test("a retried write keeps its Idempotency-Key and the Location reaches the caller", async () => {
  const calls = window((_args, n) =>
    n === 0 ? { status: 503, body: { code: "service_unavailable" }, idempotency_key: "key-1", retry_after_ms: 1 } : { status: 202, body: { operation: { operation_id: "op_1" } }, location: "/v1/operations/op_1", idempotency_key: "key-1" },
  );
  const { edgeUntil } = await edge();
  const got = await edgeUntil("POST", "/v1/machines/cmp_1/start", {}, { minDelayMs: 1 });
  assert.equal(got.status, 202);
  assert.equal(got.location, "/v1/operations/op_1");
  assert.equal(typeof calls[0].args?.idempotencyKey, "string");
  assert.equal(calls[1].args?.idempotencyKey, calls[0].args?.idempotencyKey);
});

test("edgeFetch gives the status as it came", async () => {
  window(() => ({ status: 404, body: { code: "not_found" } }));
  const { edgeFetch } = await edge();
  assert.deepEqual(await edgeFetch("GET", "/v1/machines"), { status: 404, body: { code: "not_found" } });
});

test("a contract refusal is not retried and keeps its code and status", async () => {
  const calls = window(() => ({ status: 403, body: { code: "organization_selection_required" } }));
  const { workspaces } = await edge();
  const refused = (await workspaces({ minDelayMs: 1 }).catch((e: unknown) => e)) as { detail: string; status: number };
  assert.equal(refused.detail, "organization_selection_required");
  assert.equal(refused.status, 403);
  assert.equal(calls.length, 1);
});

test("without a session nothing is retried", async () => {
  const calls = window(() => {
    throw { detail: "no_session" };
  });
  const { me } = await edge();
  const refused = await me({ minDelayMs: 1 }).catch((e: unknown) => e);
  assert.equal((refused as { detail: string }).detail, "no_session");
  assert.equal(calls.length, 1);
});

test("an aborted wait stops retrying", async () => {
  const calls = window(() => missing);
  const { me } = await edge();
  const stop = new AbortController();
  const pending = me({ signal: stop.signal, minDelayMs: 1 });
  setTimeout(() => stop.abort(), 30);
  const refused = await pending.catch((e: unknown) => e);
  assert.equal((refused as { status: number }).status, 501);
  const seen = calls.length;
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(calls.length, seen, "no more calls after abort");
});

test("the backoff grows, honours the server hint and has a ceiling", async () => {
  const { nextDelay } = await edge();
  assert.equal(nextDelay(0, undefined, 1000), 1000);
  assert.equal(nextDelay(1, undefined, 1000), 2000);
  assert.equal(nextDelay(0, 30_000, 1000), 30_000);
  assert.equal(nextDelay(20, undefined, 1000), 60_000);
});


test("a lost write response repeats the original key, including the first attempt", async () => {
  const calls = window((_args, n) => {
    if (n === 0) throw { detail: "unavailable" };
    return ok({ workspace: { id: "ws_1" } });
  });
  const { selectWorkspace } = await edge();
  await selectWorkspace("ws_1", { minDelayMs: 1 });
  const key = calls[0].args?.idempotencyKey;
  assert.equal(typeof key, "string");
  assert.ok(String(key).length > 0);
  assert.equal(calls[1].args?.idempotencyKey, key);
});

test("Retry-After is a minimum even when it exceeds the local ceiling", async () => {
  const { nextDelay } = await edge();
  assert.equal(nextDelay(20, 120_000), 120_000);
});

test("an already cancelled write never reaches the edge", async () => {
  const calls = window(() => ok({}));
  const { selectWorkspace } = await edge();
  const stop = new AbortController();
  stop.abort();
  await assert.rejects(selectWorkspace("ws_1", { signal: stop.signal }));
  assert.equal(calls.length, 0);
});

test("a missing resource is a refusal, distinct from a route not deployed yet", async () => {
  const calls = window(() => ({ status: 404, body: { code: "workspace_not_found" } }));
  const { selectWorkspace } = await edge();
  await assert.rejects(selectWorkspace("gone"), (e: unknown) => (e as { detail: string }).detail === "workspace_not_found");
  assert.equal(calls.length, 1);
});

test("a huge Retry-After never overflows the timer", async (t) => {
  const stop = new AbortController();
  const delays: number[] = [];
  const original = globalThis.setTimeout;
  t.mock.method(globalThis, "setTimeout", (_fn: () => void, ms: number) => {
    delays.push(ms);
    return original(() => stop.abort(), 0);
  });
  window(() => ({ status: 503, body: {}, retry_after_ms: 3_000_000_000 }));
  const { me } = await edge();
  await assert.rejects(me({ signal: stop.signal }));
  assert.ok(delays.length > 0);
  assert.ok(delays.every(ms => ms <= 2 ** 31 - 1));
});

test("an expired intent is not sent when the app resumes after its retry budget", async (t) => {
  let now = 0;
  t.mock.method(Date, "now", () => now);
  const original = globalThis.setTimeout;
  t.mock.method(globalThis, "setTimeout", (fn: () => void, ms: number) => original(() => { now = 1000; fn(); }, ms));
  const calls = window((_args, n) => n === 0 ? { status: 503, body: {} } : ok({}));
  const { edgeUntil } = await edge();
  await assert.rejects(edgeUntil("POST", "/v1/machines/cmp_1/start", {}, { minDelayMs: 1, retryBudgetMs: 20 }));
  assert.equal(calls.length, 1);
});

test("PUT and DELETE are writes: they keep one Idempotency-Key across retries and a session change cancels them", async () => {
  const calls = window((args, n) => (n === 0 || args?.idempotencyKey === "pending" ? missing : ok({ method: args?.method }, { idempotency_key: args?.idempotencyKey })));
  const { edgeUntil, cancelEdgeWrites } = await edge();
  const put = await edgeUntil("PUT", "/v1/workspaces/42/free-router/consent", { revision: 1 }, { minDelayMs: 1 });
  assert.equal(put.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].args?.method, "PUT");
  assert.deepEqual(calls[0].args?.body, { revision: 1 });
  assert.ok(typeof calls[0].args?.idempotencyKey === "string" && calls[0].args?.idempotencyKey === calls[1].args?.idempotencyKey);
  const deleted = await edgeUntil("DELETE", "/v1/workspaces/42/free-router/consent", undefined, { idempotencyKey: "fixed" });
  assert.equal(deleted.status, 200);
  assert.equal(calls[2].args?.method, "DELETE");
  assert.equal(calls[2].args?.idempotencyKey, "fixed");
  assert.equal("body" in (calls[2].args ?? {}), false, "a DELETE carries no body");
  const before = calls.length;
  const pending = edgeUntil("DELETE", "/v1/workspaces/42/free-router/consent", undefined, { minDelayMs: 50, idempotencyKey: "pending" });
  await new Promise((resolve) => setTimeout(resolve, 10));
  cancelEdgeWrites();
  await assert.rejects(pending);
  assert.ok(calls.length - before <= 1, "a cancelled DELETE is not retried after the session changes");
});
