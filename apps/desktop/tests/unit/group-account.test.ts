import assert from "node:assert/strict";
import test from "node:test";
import { createSessionContexts } from "../../src/features/shell/session-contexts.ts";
import { createWorkspaceSourceWait } from "../../src/features/shell/workspace-source-wait.ts";
import { createAccountAddAction } from "../../src/lib/account-add.ts";
import { type GroupSend, readGroupBalance, redeemGroupCode } from "../../src/lib/group-account.ts";
import { normalizePromoCode, promoRejection } from "../../src/lib/promo-rejections.ts";
import { webGroupAccount } from "../../src/web/group-account.ts";

const group = { context: "ctx-a", org: "org-a", name: "A", plan: "paid" };
const balance = (org: string) => ({ organization_id: org, available: { currency: "MXN", amount_micro: "12340000" } });
test("balance is requested with the group context; another organization, missing support and malformed amounts stay unavailable", async () => {
  const calls: unknown[][] = [];
  const send: GroupSend = async (...args) => { calls.push(args); return { status: 200, body: balance("org-a") }; };
  assert.equal(await readGroupBalance(send, group), 12.34);
  assert.deepEqual(calls, [["ctx-a", "GET", "/v1/credits/balance"]]);
  for (const reply of [{ status: 200, body: balance("org-b") }, { status: 501 }, { status: 200, body: { organization_id: "org-a", available: { currency: "MXN", amount_micro: "-1" } } }]) assert.equal(await readGroupBalance(async () => reply, group), null);
  assert.equal(await readGroupBalance(async () => { throw { detail: "session_echo_mismatch" }; }, group), null);
});
test("redeem keeps the context and intention key; a route not yet allowed by Rust is an unavailable state", async () => {
  const calls: unknown[][] = [];
  const send: GroupSend = async (...args) => { calls.push(args); throw { detail: "invalid_request" }; };
  assert.deepEqual(await redeemGroupCode(send, group, "CODE", "same-key"), { unavailable: true });
  assert.deepEqual(calls, [["ctx-a", "POST", "/v1/workspaces/promo/redeem", { code: "CODE" }, "same-key"]]);
  assert.deepEqual(await redeemGroupCode(async () => ({ status: 404 }), group, "CODE", "key"), { unavailable: true });
  await assert.rejects(redeemGroupCode(async () => ({ status: 422, body: { code: "invalid_code" } }), group, "CODE", "key"), { status: 422, code: "invalid_code" });
});
test("web session discovery has no echo requirement; group balance and redemption require their own echo", async () => {
  const calls: { path: string; init?: RequestInit }[] = [];
  let echo: string | null = "ctx-a";
  let legacy = false;
  const call = async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    if (legacy) throw { status: 404 };
    return new Response(JSON.stringify(path === "identity/sessions" ? { default_context: "ctx-a", items: [{ contexts: [{ context_id: "ctx-a", org: "org-a", org_name: "A" }] }] } : balance("org-a")), { headers: echo ? { "X-Danil-Session-Applied": echo } : {} });
  };
  const source = webGroupAccount({ call, mutation: call } as never);
  echo = null;
  assert.equal((await source.current())?.context, "ctx-a");
  assert.equal(await readGroupBalance(source.send, group), null);
  echo = "ctx-a";
  assert.equal(await readGroupBalance(source.send, group), 12.34);
  assert.equal((calls.at(-1)?.init?.headers as Record<string, string>)["X-Danil-Session"], "ctx-a");
  legacy = true;
  assert.equal(await source.current(), null);
  assert.equal(source.legacy(), true);
});


test("an optional credits route without context echo does not tear down the connected groups", async () => {
  const sessions = createSessionContexts(async <T>(command: string) => {
    if (command === "danil_session_status") return { state: "connected", sessions: [{ family: "family", email: "one@example.com", contexts: [{ context_id: "ctx-a", org: "org-a", org_name: "A", plan: "paid" }] }] } as T;
    throw { detail: "session_echo_mismatch" };
  }, () => {});
  await sessions.refresh();
  assert.equal(await readGroupBalance(sessions.sendOptional, group), null);
  assert.equal(sessions.groups()?.length, 1);
});


test("unsettled machine source becomes neutral after ten seconds, retries, and accepts a late listing", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let retries = 0;
  const wait = createWorkspaceSourceWait<{ id: string }>(async () => { retries++; }, () => {});
  wait.update(null);
  t.mock.timers.tick(9999);
  assert.deepEqual(wait.view(), { rows: null, timedOut: false });
  t.mock.timers.tick(1);
  assert.deepEqual(wait.view(), { rows: null, timedOut: true });
  await wait.retry();
  assert.equal(retries, 1);
  assert.equal(wait.view().timedOut, false);
  t.mock.timers.tick(9999);
  assert.equal(wait.view().timedOut, false);
  wait.update([{ id: "late" }]);
  assert.deepEqual(wait.view(), { rows: [{ id: "late" }], timedOut: false });
  wait.dispose();
});


test("the web exposes no add button action without login/add, while Desk dispatches the real add flow", async () => {
  const calls: { command: string; args?: Record<string, unknown> }[] = [];
  const sessions = createSessionContexts(async <T>(command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    return { state: "disconnected", sessions: [] } as T;
  }, () => {});
  assert.equal(createAccountAddAction(false, sessions.addAccount), undefined);
  assert.equal(calls.length, 0);
  await createAccountAddAction(true, sessions.addAccount)!();
  assert.deepEqual(calls[0], { command: "danil_sign_in", args: { mode: "add" } });
  let webAdds = 0;
  await createAccountAddAction(false, sessions.addAccount, () => { webAdds++; })!();
  assert.equal(webAdds, 1);
});


test("promo payload is trimmed, limited to sixty-four characters and rejected locally before IPC", async () => {
  const sent: unknown[][] = [];
  const send: GroupSend = async (...args) => { sent.push(args); return { status: 201, body: { machine: { state: "ready" } } }; };
  await redeemGroupCode(send, group, "  CODE  ", "intent");
  assert.deepEqual(sent[0], ["ctx-a", "POST", "/v1/workspaces/promo/redeem", { code: "CODE" }, "intent"]);
  assert.equal(normalizePromoCode("🙂".repeat(64))?.length, 128, "the window counts Unicode characters, not UTF-16 units");
  for (const code of ["  ", "x".repeat(65), "🙂".repeat(65)]) await assert.rejects(redeemGroupCode(send, group, code, "intent"), { status: 422, code: "invalid_code" });
  assert.equal(sent.length, 1);
});
test("native rejection codes and rate-limit metadata survive the context transport", async () => {
  for (const code of ["invalid_code", "already_redeemed"]) {
    await assert.rejects(redeemGroupCode(async () => ({ status: 409, body: { code } }), group, "CODE", "intent"), { status: 409, code });
  }
  assert.equal(promoRejection({ status: 422, code: "already_redeemed" }).key, "web.promo.already_redeemed");
  await assert.rejects(redeemGroupCode(async () => ({ status: 429, body: { code: "rate_limited" }, retry_after_ms: 1500 }), group, "CODE", "intent"), { status: 429, code: "rate_limited", retry_after_ms: 1500 });
  const rejection = promoRejection({ status: 429, code: "rate_limited", retry_after_ms: 1500 });
  assert.equal(rejection.code, "rate_limited");
  assert.equal(rejection.delay, 1500);
  assert.equal(rejection.data.count, 2);
  assert.equal(promoRejection({ status: 429, retryAfter: "3" }).delay, 3000);
  assert.equal(promoRejection({ status: 409, code: "constructor" }).key, "web.promo.rejected");
});

test("web machine inventory and tickets use cookie context, require echo before reading a body", async () => {
  const { contextMachines } = await import("../../src/web/context-machines.ts");
  const calls: { path: string; headers: Headers }[] = [];
  let echo: string | null = "ctx";
  let reads = 0;
  const request = async (path: string, init?: RequestInit) => {
    calls.push({ path, headers: new Headers(init?.headers) });
    return { ok: true, status: 200, headers: new Headers(echo ? { "X-Danil-Session-Applied": echo } : {}), json: async () => {
      reads++;
      return path === "machines" ? { items: [{ machine_id: "m", state: "online", organization_id: "org" }] } : { url: "wss://relay.example/v1/machines/m/session", ticket: "ticket" };
    } } as Response;
  };
  const client = contextMachines("https://api.example/v1", { call: request, mutation: request }, ["wss://relay.example"], "ctx");
  assert.equal((await client.list()).kind, "ok");
  assert.equal((await client.admission("m")).kind, "ok");
  assert.ok(calls.every(call => call.headers.get("X-Danil-Session") === "ctx"));
  assert.ok(calls[1].headers.has("Idempotency-Key"));
  const before = reads;
  for (echo of [null, "other"]) {
    const result = await client.list();
    assert.equal(result.kind, "error");
    if (result.kind === "error") assert.equal(result.code, "session_echo_mismatch");
  }
  assert.equal(reads, before);
});

test("web grouped source only exposes verified inventory and exact scoped workspace listings; legacy echo fallback stays ungrouped", async () => {
  const { windowContext } = await import("../../src/web/window-context.ts");
  const group = { context: "ctx", org: "org", name: "Org", plan: "teams" };
  const fleet = { available: (org: string, context: string) => { assert.equal(org, "org"); assert.equal(context, "ctx"); return [{ id: "scoped", name: "Scoped" }]; } } as never;
  let legacyReads = 0;
  let answer: unknown = { kind: "ok", value: [{ machine_id: "m", organization_id: "org", state: "online" }, { machine_id: "alien", organization_id: "other", state: "online" }] };
  const source = windowContext({ legacy: { list: async () => { legacyReads++; return { kind: "ok", value: [] }; } } as never, factory: () => ({ list: async () => answer }) as never, account: { current: async () => group, send: async () => ({ status: 404 }) }, fleet: () => fleet, revision: () => {} });
  assert.equal(source.source.group(), null);
  const result = await source.inventory();
  assert.deepEqual(result?.answer.kind === "ok" ? result.answer.value.map(row => row.machine_id) : [], ["m"]);
  assert.deepEqual(source.source.group(), group);
  assert.deepEqual(source.source.workspaces(), [{ id: "scoped", name: "Scoped" }]);
  const calls: Headers[] = [];
  const engine = source.engine({ handle: async (_command, _args, options) => { calls.push(new Headers(options?.headers)); return []; } });
  await engine.handle("list_workspaces");
  await engine.handle("read_task", {}, { headers: { "x-danil-context": "captured" } });
  assert.equal(calls[0].get("x-danil-context"), "ctx");
  assert.equal(calls[1].get("x-danil-context"), "captured");
  answer = { kind: "error", status: null, code: "session_echo_mismatch" };
  await source.inventory();
  assert.equal(source.source.group(), null);
  assert.equal(source.source.workspaces(), null);
  assert.equal(legacyReads, 1);
  await engine.handle("list_workspaces");
  assert.equal(calls[2].get("x-danil-context"), "");
});
