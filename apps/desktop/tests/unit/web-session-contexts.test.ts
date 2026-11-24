import assert from "node:assert/strict";
import test from "node:test";
import { EdgeError, type EdgeTransport } from "@terminus/computers";
import { createSessionContexts } from "../../../../packages/shell/src/shell/session-contexts.ts";
import { webSessionCommands } from "../../src/web/web-session-contexts.ts";

type Sent = { method: "call" | "mutation"; path: string; headers: Headers; init?: RequestInit };
const sessions = {
  version: 1,
  items: [
    { session_id: "ses_a", sub: "user_a", email: "a@example.com", contexts: [{ context_id: "ctx_personal", org: "org_personal", org_name: "Personal", plan: "free", personal: true }, { context_id: "ctx_x", org: "org_x", org_name: "X", plan: "pro", role: "member" }] },
  ],
  primary: "ses_a",
  default_context: "ctx_personal",
};

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status: 200, ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
}

function fakeEdge(answer: (sent: Sent) => Response | Promise<Response>) {
  const sent: Sent[] = [];
  const send = (method: Sent["method"]) => async (path: string, init?: RequestInit) => {
    const entry = { method, path, headers: new Headers(init?.headers), init };
    sent.push(entry);
    const response = await answer(entry);
    if (!response.ok) throw new EdgeError(response.status, null, ((await response.json().catch(() => null)) as { code?: string } | null)?.code ?? null);
    return response;
  };
  const transport: EdgeTransport = { call: send("call"), mutation: send("mutation") };
  return { transport, sent };
}

const echo = (sent: Sent, org: string) => ({ "X-Danil-Session-Applied": sent.headers.get("X-Danil-Session") ?? "", "X-Danil-Session-Applied-Org": org });
const orgOf: Record<string, string> = { ctx_personal: "org_personal", ctx_x: "org_x" };

test("the status lists every email and organization of the cookie set, like Desk's families", async () => {
  const { transport } = fakeEdge((sent) => (sent.path === "identity/sessions" ? json(sessions) : json({}, { status: 404 })));
  const web = webSessionCommands(transport, { expired: () => assert.fail("not expired") });
  assert.equal(web.answers("danil_session_status"), true);
  assert.equal(web.answers("list_projects"), false);
  const status = (await web.handle("danil_session_status")) as { state: string; sessions: { family: string; sub: string; email: string; contexts: { context_id: string; org: string; plan: string }[] }[]; default_context: string };
  assert.equal(status.state, "connected");
  assert.deepEqual(status.sessions.map((f) => [f.family, f.sub, f.email]), [["ses_a", "user_a", "a@example.com"]]);
  assert.deepEqual(status.sessions[0].contexts.map((c) => [c.context_id, c.org, c.plan]), [["ctx_personal", "org_personal", "free"], ["ctx_x", "org_x", "pro"]]);
  assert.equal(web.contextOf("user_a", "org_x"), "ctx_x");
});

test("each call carries its own X-Danil-Session and is accepted only with the matching echo", async () => {
  const { transport, sent } = fakeEdge((s) => (s.path === "identity/sessions" ? json(sessions) : json({ id: "user_a" }, { headers: echo(s, orgOf[s.headers.get("X-Danil-Session") ?? ""]) })));
  const web = webSessionCommands(transport, { expired: () => {} });
  await web.handle("danil_session_status");
  const personal = await web.handle("danil_edge_fetch", { method: "GET", path: "/v1/identity/me", context: "ctx_personal" });
  const other = await web.handle("danil_edge_fetch", { method: "GET", path: "/v1/workspaces", context: "ctx_x" });
  assert.deepEqual(personal, { status: 200, body: { id: "user_a" } });
  assert.equal((other as { status: number }).status, 200);
  assert.deepEqual(sent.slice(1).map((s) => [s.path, s.headers.get("X-Danil-Session")]), [["identity/me", "ctx_personal"], ["workspaces", "ctx_x"]]);
});

test("a reply with another echo is discarded; a context that left the set never reaches the edge", async () => {
  const { transport, sent } = fakeEdge((s) => (s.path === "identity/sessions" ? json(sessions) : json({ secret: true }, { headers: { "X-Danil-Session-Applied": "ctx_personal", "X-Danil-Session-Applied-Org": "org_personal" } })));
  const web = webSessionCommands(transport, { expired: () => {} });
  await web.handle("danil_session_status");
  await assert.rejects(web.handle("danil_edge_fetch", { method: "GET", path: "/v1/workspaces", context: "ctx_x" }), { detail: "session_echo_mismatch" });
  const before = sent.length;
  await assert.rejects(web.handle("danil_edge_fetch", { method: "GET", path: "/v1/workspaces", context: "ctx_gone" }), { detail: "session_not_in_set" });
  await assert.rejects(web.handle("danil_edge_fetch", { method: "GET", path: "/v1/workspaces" }), { detail: "session_selection_required" });
  await assert.rejects(web.handle("danil_edge_fetch", { method: "GET", path: "https://evil.example/v1/x", context: "ctx_x" }), { detail: "invalid_request" });
  assert.equal(sent.length, before);
});

test("an org echo from another organization is discarded even with the right context id", async () => {
  const { transport } = fakeEdge((s) => (s.path === "identity/sessions" ? json(sessions) : json({}, { headers: { "X-Danil-Session-Applied": "ctx_x", "X-Danil-Session-Applied-Org": "org_personal" } })));
  const web = webSessionCommands(transport, { expired: () => {} });
  await web.handle("danil_session_status");
  await assert.rejects(web.handle("danil_edge_fetch", { method: "GET", path: "/v1/workspaces", context: "ctx_x" }), { detail: "session_echo_mismatch" });
});

test("writes go through the CSRF mutation with the caller's idempotency key and JSON body", async () => {
  const { transport, sent } = fakeEdge((s) => (s.path === "identity/sessions" ? json(sessions) : new Response(null, { status: 204, headers: echo(s, "org_x") })));
  const web = webSessionCommands(transport, { expired: () => {} });
  await web.handle("danil_session_status");
  const reply = await web.handle("danil_edge_fetch", { method: "PUT", path: "/v1/workspaces/preferences/added/ws_1", context: "ctx_x", body: { a: 1 }, idempotencyKey: "key-1" });
  assert.deepEqual(reply, { status: 204, body: undefined });
  const last = sent.at(-1)!;
  assert.equal(last.method, "mutation");
  assert.equal(last.init?.method, "PUT");
  assert.equal(last.headers.get("Idempotency-Key"), "key-1");
  assert.equal(last.init?.body, JSON.stringify({ a: 1 }));
});

test("a refusal comes back as a reply; a 401 of one context throws for that context and never closes the page", async () => {
  let expired = 0;
  const { transport } = fakeEdge((s) => {
    if (s.path === "identity/sessions") return json(sessions);
    if (s.headers.get("X-Danil-Session") === "ctx_x") return json({ code: "session_expired", context_id: "ctx_x" }, { status: 401, headers: { "content-type": "application/problem+json" } });
    return json({ code: "organization_access_denied" }, { status: 403, headers: { "content-type": "application/problem+json" } });
  });
  const web = webSessionCommands(transport, { expired: () => expired++ });
  await web.handle("danil_session_status");
  await assert.rejects(web.handle("danil_edge_fetch", { method: "GET", path: "/v1/workspaces", context: "ctx_x" }), { detail: "session_expired", status: 401, context: "ctx_x" });
  assert.deepEqual(await web.handle("danil_edge_fetch", { method: "GET", path: "/v1/workspaces", context: "ctx_personal" }), { status: 403, body: { code: "organization_access_denied" } });
  assert.equal(expired, 0);
});

test("only a 401 of the cookie itself (the status read) closes the page", async () => {
  let expired = 0;
  const { transport } = fakeEdge(() => json({ code: "invalid_session" }, { status: 401 }));
  const web = webSessionCommands(transport, { expired: () => expired++ });
  assert.deepEqual(await web.handle("danil_session_status"), { state: "disconnected", sessions: [] });
  assert.equal(expired, 1);
});

test("signing out one organization or one email uses the partial logout routes", async () => {
  const { transport, sent } = fakeEdge((s) => (s.path === "identity/sessions" ? json(sessions) : new Response(JSON.stringify({ session: null }), { status: 200 })));
  const web = webSessionCommands(transport, { expired: () => {} });
  await web.handle("danil_session_status");
  await web.handle("danil_sign_out", { context: "ctx_x" });
  await web.handle("danil_sign_out", { family: "ses_a" });
  const writes = sent.filter((s) => s.method === "mutation");
  assert.deepEqual(writes.map((s) => s.path), ["identity/contexts/ctx_x/logout", "identity/sessions/ses_a/logout"]);
  assert.ok(writes.every((s) => s.headers.get("Idempotency-Key")));
  await assert.rejects(web.handle("danil_sign_out", { context: "../x" }), { detail: "invalid_request" });
});

test("Desk's createSessionContexts runs unchanged over the cookie adapter", async () => {
  const { transport } = fakeEdge((s) => (s.path === "identity/sessions" ? json(sessions) : json({ id: "user_a" }, { headers: echo(s, orgOf[s.headers.get("X-Danil-Session") ?? ""]) })));
  const web = webSessionCommands(transport, { expired: () => {} });
  const contexts = createSessionContexts(<T,>(command: string, args?: Record<string, unknown>) => web.handle(command, args) as Promise<T>, () => {});
  await contexts.refresh();
  assert.deepEqual(contexts.groups()?.map((g) => [g.context_id, g.org, g.email]), [["ctx_personal", "org_personal", "a@example.com"], ["ctx_x", "org_x", "a@example.com"]]);
  const reply = await contexts.send("ctx_x", "GET", "/v1/identity/me");
  assert.equal(reply.status, 200);
});

test("an idempotency key with control characters is replaced, never sent raw", async () => {
  const { transport, sent } = fakeEdge((s) => (s.path === "identity/sessions" ? json(sessions) : new Response(null, { status: 204, headers: echo(s, "org_x") })));
  const web = webSessionCommands(transport, { expired: () => {} });
  await web.handle("danil_session_status");
  await web.handle("danil_edge_fetch", { method: "POST", path: "/v1/workspaces/promo/redeem", context: "ctx_x", idempotencyKey: "a\r\nX-Evil: 1" });
  assert.match(sent.at(-1)!.headers.get("Idempotency-Key")!, /^[0-9a-f-]{36}$/);
});

test("the window transport sends the open workspace's context and refuses a reply without its echo", async () => {
  const { windowActiveContext } = await import("../../src/web/window-active-context.ts");
  const { setActiveWorkspaceContext } = await import("../../src/lib/workspace-context.ts");
  let applied: [string, string] | null = null;
  const { transport, sent } = fakeEdge((s) => (s.path === "identity/sessions" ? json(sessions) : json({}, { headers: applied ? { "X-Danil-Session-Applied": applied[0], "X-Danil-Session-Applied-Org": applied[1] } : echo(s, orgOf[s.headers.get("X-Danil-Session") ?? ""]) })));
  const web = webSessionCommands(transport, { expired: () => {} });
  await web.handle("danil_session_status");
  const active = windowActiveContext(web);
  const scoped = active.scoped(transport);
  setActiveWorkspaceContext("ctx_x");
  await scoped.call("workspaces/accounts");
  assert.equal(sent.at(-1)!.headers.get("X-Danil-Session"), "ctx_x");
  applied = ["ctx_personal", "org_personal"];
  await assert.rejects(scoped.call("workspaces/accounts"), { code: "session_echo_mismatch" }, "the default context answering is refused");
  applied = ["ctx_x", "org_personal"];
  await assert.rejects(scoped.mutation("workspaces/accounts"), { code: "session_echo_mismatch" });
  applied = null;
  const billing = active.scoped(transport, active.of("org_personal"));
  await billing.mutation("billing/checkout-sessions");
  assert.equal(sent.at(-1)!.headers.get("X-Danil-Session"), "ctx_personal", "billing keeps its own organization while another workspace is open");
  setActiveWorkspaceContext(null);
});

test("a URL can only reopen a workspace of its context's catalog that the person added", async () => {
  const { requestedStartTarget } = await import("../../../../packages/shell/src/shell/organization-start-target.ts");
  const group = { context_id: "ctx_x", org: "org_x", org_name: "X", plan: "pro", family: "ses_a", email: "a@example.com", available: [{ id: "wx1", name: "X Uno" }, { id: "wx2", name: "X Dos" }], added: new Set(["wx1"]), person: "user_a" };
  const families = [{ family: "ses_a", sub: "user_a" }];
  assert.deepEqual(requestedStartTarget([group], families, "?workspace=wx1&org=org_x&account=user_a"), { id: "wx1", context: "ctx_x" });
  assert.equal(requestedStartTarget([group], families, "?workspace=wx2&org=org_x&account=user_a"), null, "not added");
  assert.equal(requestedStartTarget([group], families, "?workspace=wb&org=org_x&account=user_a"), null, "another organization's workspace");
  assert.equal(requestedStartTarget([group], families, "?workspace=wx1&org=org_x&account=user_b"), null, "another email");
});

test("billing of each organization goes with that organization's context, also on the payment return of another one", async () => {
  const { windowActiveContext } = await import("../../src/web/window-active-context.ts");
  const { setActiveWorkspaceContext } = await import("../../src/lib/workspace-context.ts");
  const { billingV2 } = await import("../../../../packages/platform-client/src/treasury.ts");
  const { transport, sent } = fakeEdge((s) => {
    if (s.path === "identity/sessions") return json(sessions);
    const context = s.headers.get("X-Danil-Session") ?? "";
    return json({ organization_id: orgOf[context], plan_key: "pro", state: "active", payer: { is_you: true } }, { headers: echo(s, orgOf[context]) });
  });
  const web = webSessionCommands(transport, { expired: () => {} });
  await web.handle("danil_session_status");
  const active = windowActiveContext(web);
  setActiveWorkspaceContext("ctx_personal");
  const forOrg = active.billingFor(transport, "user_a");
  const x = await billingV2(forOrg("org_x"), "org_x").organization();
  assert.equal(sent.at(-1)!.headers.get("X-Danil-Session"), "ctx_x", "the return of X's payment reads X with X's context while the personal one is open");
  assert.ok(x, "no billing_organization_mismatch");
  await billingV2(forOrg("org_personal"), "org_personal").organization();
  assert.equal(sent.at(-1)!.headers.get("X-Danil-Session"), "ctx_personal");
  setActiveWorkspaceContext(null);
});

test("the Free router of a workspace open in X gets X's platform account, never another organization's", async () => {
  const { windowActiveContext } = await import("../../src/web/window-active-context.ts");
  const { setActiveWorkspaceContext } = await import("../../src/lib/workspace-context.ts");
  const { transport } = fakeEdge(() => json(sessions));
  const web = webSessionCommands(transport, { expired: () => {} });
  await web.handle("danil_session_status");
  const accounts: Record<string, Record<string, string>> = { ctx_x: { wx1: "acc_x1" }, ctx_personal: { wp: "acc_p" } };
  const identity = windowActiveContext(web).freeRouterIdentity((context, engine) => accounts[context]?.[engine] ?? null);
  setActiveWorkspaceContext("ctx_x");
  assert.deepEqual(await identity("wx1"), { sub: "user_a", list: { active_workspace_id: "acc_x1", items: [{ id: "acc_x1", org: "org_x" }] } });
  assert.equal(await identity("wp"), null, "a workspace of the personal org is not in X's catalog");
  setActiveWorkspaceContext(null);
});
