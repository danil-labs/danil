import assert from "node:assert/strict";
import { test } from "node:test";
import { previewClient, previewUrl, localPreviewTarget } from "../src/previews.ts";

const token = "a".repeat(52);
const domain = { prefix: "prv-", suffix: "daizero.com" };
const scope = { machine: "mch_1", workspace: "v5463347", session: "task_1" };

test("a remote preview uses the edge transport and keeps the engine workspace distinct", async () => {
  const calls: { path: string; init: RequestInit }[] = [];
  const client = previewClient({
    call: async () => Response.json({ preview: { available: true } }),
    mutation: async (path, init = {}) => {
      calls.push({ path, init });
      return Response.json({ preview_id: "pvw_1", host_token: token, port: 5173, lease_expires_at: "2026-11-18T10:00:00Z", renew_after_s: 30, lease_ttl_ms: 60_000, future: true });
    },
  }, domain);
  const lease = await client.open(scope, 5173, new AbortController().signal);
  assert.equal(lease.url, `https://prv-${token}.daizero.com/`);
  assert.equal(calls[0]?.path, "machines/mch_1/previews");
  assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), { engine_workspace_id: scope.workspace, session_id: scope.session, port: 5173 });
  assert.ok(new Headers(calls[0]?.init.headers).get("Idempotency-Key"));
  assert.equal(new Headers(calls[0]?.init.headers).has("Authorization"), false);
});

test("renew and close use the public preview id without the host capability", async () => {
  const calls: string[] = [];
  const client = previewClient({ call: async () => Response.json({}), mutation: async (path, init = {}) => {
    calls.push(`${init.method ?? "POST"} ${path}`);
    return init.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json({ lease_expires_at: "2026-11-18T10:00:30Z", lease_ttl_ms: 30_000 });
  } }, domain, { now: () => 1000, workspace: "1001" });
  const until = await client.renew(scope, "pvw_1", new AbortController().signal);
  assert.equal(until, 31_000);
  await client.close(scope, "pvw_1");
  assert.deepEqual(calls, ["POST machines/mch_1/previews/pvw_1/renew", "DELETE machines/mch_1/previews/pvw_1"]);
});

test("the embed origin cannot be chosen by a server response or user info", () => {
  assert.equal(previewUrl(token, domain), `https://prv-${token}.daizero.com/`);
  for (const bad of ["https://evil.test", "a".repeat(51), "A".repeat(52), token + ".evil.test", "_"]) {
    assert.throws(() => previewUrl(bad, domain));
  }
});

test("local links preserve path, query and fragment and never target the browser loopback", () => {
  assert.deepEqual(localPreviewTarget("http://LOCALHOST:5173/a?x=1#ok"), { port: 5173, path: "/a?x=1#ok" });
  assert.equal(localPreviewTarget("http://[::1]:3000/")?.port, 3000);
  for (const bad of ["https://localhost.evil.test:5173/", "http://127.0.0.2:5173/", "http://0.0.0.0:5173/", "http://user@localhost:5173/", "javascript:alert(1)"]) {
    assert.equal(localPreviewTarget(bad), null);
  }
});

test("an older connector is unavailable without issuing a create request", async () => {
  let created = false;
  const client = previewClient({ call: async () => Response.json({ state: "running" }), mutation: async () => { created = true; return Response.json({}); } }, domain);
  await assert.rejects(client.open(scope, 5173, new AbortController().signal), { message: "capability_missing" });
  assert.equal(created, false);
});


test("lease deadlines use local elapsed time despite a badly skewed wall clock", async () => {
  const client = previewClient({ call: async () => Response.json({ preview: { available: true } }), mutation: async () => Response.json({
    preview_id: "pvw_1", host_token: token, port: 5173, lease_expires_at: "2001-01-01T00:00:00Z", lease_ttl_ms: 51_000, renew_after_s: 30,
  }) }, domain, { now: () => 1234 });
  assert.equal((await client.open(scope, 5173, new AbortController().signal)).deadline, 52_234);
});

test("create, renew and close pin the platform workspace separately from the engine slug", async () => {
  const contexts: (string | null)[] = [];
  const client = previewClient({ call: async (_, init) => {
    contexts.push(new Headers(init?.headers).get("X-Danil-Workspace")); return Response.json({ preview: { available: true } });
  }, mutation: async (_, init) => {
    contexts.push(new Headers(init?.headers).get("X-Danil-Workspace"));
    return init?.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json({ preview_id: "pvw_1", host_token: token, port: 5173, lease_ttl_ms: 60_000, renew_after_s: 30 });
  } }, domain, { workspace: "1001" });
  const view = await client.open(scope, 5173, new AbortController().signal);
  await client.renew(scope, view.id, new AbortController().signal);
  await client.close(scope, view.id);
  assert.deepEqual(contexts, ["1001", "1001", "1001", "1001"]);
});
