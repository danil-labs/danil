/**
 * Las peticiones de la CLI (`account_requests_v1`) que la ventana ejecuta con la
 * sesión del contexto que toca: elegir la organización, mandar la llave de la
 * CLI como `Idempotency-Key`, sellar aquí lo creado y liquidar la petición.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { type AccountRequest, createAccountRequests, listOrgs, pickGroup, runAccountRequest } from "../../src/features/shell/account-requests.ts";
import type { ContextGroup, ContextReply } from "../../src/features/shell/session-context-types.ts";

const group = (context_id: string, org: string, org_name: string, plan: string | null, role: string | null, email = "a@example.com"): ContextGroup =>
  ({ context_id, org, org_name, plan, role, family: "f", email });
const free = group("c-free", "org_free", "Personal", "free", "owner");
const acme = group("c-acme", "org_acme", "Acme", "paid", "admin");
const beta = group("c-beta", "org_beta", "Beta", "paid", "member");

/** Un `workspaces` que crea una sola vez por `Idempotency-Key`. */
function server(status = 201) {
  const created = new Map<string, unknown>();
  const posts: { context: string; key?: string; body: unknown }[] = [];
  const send = async (context: string, method: string, path: string, body?: unknown, key?: string): Promise<ContextReply> => {
    assert.equal(method, "POST");
    assert.equal(path, "/v1/workspaces");
    posts.push({ context, key, body });
    if (status !== 201) return { status, body: status === 409 ? { code: "workspace_limit" } : {} };
    if (!key) throw new Error("sin llave");
    const placement = (body as { placement?: unknown }).placement ?? { kind: "organization_machine" };
    if (!created.has(key)) created.set(key, { id: 1000 + created.size, name: (body as { name: string }).name, engine_workspace_id: `qw${created.size}xyz0`, placement });
    return { status: 201, body: created.get(key) };
  };
  return { send, posts, created };
}

const request = (args: AccountRequest["args"], op = "workspace.create", key = "key-1"): AccountRequest =>
  ({ request_id: `r-${key}`, op, args, key, caller_task: "task-9" });

test("orgs.list lists contexts with the role and the email only when two names match", () => {
  const twin = group("c-acme2", "org_acme2", "Acme", "paid", "member", "b@example.com");
  assert.deepEqual(listOrgs([free, acme, twin]), [
    { org: "org_free", name: "Personal", role: "owner" },
    { org: "org_acme", name: "Acme", role: "admin", email: "a@example.com" },
    { org: "org_acme2", name: "Acme", role: "member", email: "b@example.com" },
  ]);
});

test("the org comes from --org by id or name, the personal Free without it, and ambiguity lists options", () => {
  assert.deepEqual(pickGroup([free, acme], undefined), { group: free });
  assert.deepEqual(pickGroup([free, acme], "org_acme"), { group: acme });
  assert.deepEqual(pickGroup([free, acme], "acme"), { group: acme });
  assert.deepEqual(pickGroup([], undefined), { error: { code: "no_session" } });
  assert.deepEqual(pickGroup([acme], undefined), { error: { code: "ambiguous", options: [{ org: "org_acme", name: "Acme", email: "a@example.com" }] } });
  const twin = group("c-acme2", "org_acme2", "Acme", "paid", "admin", "b@example.com");
  const picked = pickGroup([acme, twin], "Acme");
  assert.ok("error" in picked && picked.error.code === "ambiguous" && picked.error.options?.length === 2);
});

test("creating sends the CLI key as Idempotency-Key, seals here and two dispatches create one workspace", async () => {
  const api = server();
  const sealed: unknown[] = [];
  const deps = { groups: () => [free, acme], send: api.send, createHere: async (...args: unknown[]) => { sealed.push(args); } };
  const first = await runAccountRequest(request({ name: "Docs" }), deps);
  const second = await runAccountRequest(request({ name: "Docs" }), deps);
  assert.equal(api.created.size, 1, "una sola creación con la misma llave");
  assert.deepEqual(api.posts.map((p) => [p.context, p.key]), [["c-free", "key-1"], ["c-free", "key-1"]]);
  assert.deepEqual(api.posts[0].body, { name: "Docs", placement: { kind: "member_computer" } });
  assert.deepEqual(first.outcome, { result: { workspace: { id: "qw0xyz0", name: "Docs", org: "org_free", account_id: "1000" }, materialized: true } });
  assert.deepEqual(second.outcome, first.outcome);
  assert.deepEqual(sealed[0], ["org_free", "1000", "qw0xyz0", "Docs"]);
  assert.deepEqual(first.created, { name: "Docs", org: "Personal", task: "task-9", materialized: true });
});

test("a paid org leaves the placement to its admin and only a member computer workspace is sealed here", async () => {
  const api = server();
  const sealed: unknown[] = [];
  const got = await runAccountRequest(request({ name: "Docs", org: "Acme" }, "workspace.create", "key-paid"), { groups: () => [free, acme], send: api.send, createHere: async (...a: unknown[]) => { sealed.push(a); } });
  assert.deepEqual(api.posts[0].body, { name: "Docs" });
  assert.equal(sealed.length, 0, "corre en la máquina de la organización");
  assert.ok("result" in got.outcome);
});

test("two emails in the same org pick the admin context, and a failed local seal reports materialized: false", async () => {
  const member = group("c-x1", "org_x", "X", "paid", "member");
  const admin = group("c-x2", "org_x", "X", "paid", "admin", "b@example.com");
  assert.deepEqual(pickGroup([member, admin], "org_x"), { group: admin });
  assert.deepEqual(pickGroup([member, admin], "X"), { group: admin });
  const failing = await runAccountRequest(request({ name: "Docs" }, "workspace.create", "key-fail"), { groups: () => [free], send: server().send, createHere: async () => { throw new Error("motor"); } });
  assert.ok("result" in failing.outcome && (failing.outcome.result as { materialized: boolean }).materialized === false);
  assert.equal(failing.created?.materialized, false);
});

test("without a Free and without --org, the orgs where the person is admin are the options", () => {
  const picked = pickGroup([acme, beta], undefined);
  assert.ok("error" in picked && picked.error.code === "ambiguous");
  assert.deepEqual("error" in picked && picked.error.options, [{ org: "org_acme", name: "Acme", email: "a@example.com" }]);
  assert.deepEqual(pickGroup([beta], undefined), { error: { code: "admin_required", options: undefined } });
});

test("a member is told admin_required, and server refusals, missing routes and unknown ops settle with their code", async () => {
  const deps = (status = 201) => ({ groups: () => [free, acme, beta], send: server(status).send, createHere: async () => {} });
  assert.deepEqual((await runAccountRequest(request({ name: "X", org: "Beta" }), deps())).outcome, { error: { code: "admin_required" } });
  assert.deepEqual((await runAccountRequest(request({ name: "X", org: "Acme" }), deps(403))).outcome, { error: { code: "admin_required" } });
  assert.deepEqual((await runAccountRequest(request({ name: "X" }), deps(409))).outcome, { error: { code: "workspace_limit" } });
  // Mientras `workspaces` no tenga la ruta: 404 y 501 no rompen nada.
  for (const status of [404, 501]) assert.deepEqual((await runAccountRequest(request({ name: "X" }), deps(status))).outcome, { error: { code: "unavailable" } });
  assert.deepEqual((await runAccountRequest(request({}, "task.delete"), deps())).outcome, { error: { code: "unsupported_op" } });
  assert.deepEqual((await runAccountRequest(request({}, "orgs.list"), { ...deps(), groups: () => [] })).outcome, { error: { code: "no_session" } });
});

test("pump takes and settles each request once and notifies what an agent created", async () => {
  const api = server();
  const settled: Record<string, unknown>[] = [];
  let queue: AccountRequest[] = [request({ name: "Docs" }, "workspace.create", "key-pump"), request({}, "orgs.list", "key-orgs")];
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    if (command === "account_request_take") { const rows = queue; queue = []; return rows as T; }
    if (command === "account_request_settle") { settled.push(args ?? {}); return undefined as T; }
    throw new Error(command);
  };
  const notices: unknown[] = [];
  const requests = createAccountRequests(invoke, { groups: () => [free], send: api.send, createHere: async () => {} }, (n) => notices.push(n));
  await Promise.all([requests.pump(), requests.pump()]);
  assert.deepEqual(settled.map((s) => s.requestId), ["r-key-pump", "r-key-orgs"]);
  assert.ok("result" in settled[0] && "result" in settled[1]);
  assert.deepEqual(notices, [{ name: "Docs", org: "Personal", task: "task-9", materialized: true }]);
});
