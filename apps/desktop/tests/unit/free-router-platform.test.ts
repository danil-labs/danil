/**
 * Free router v8, cliente de interfaz (1d): el recorrido de 8 pasos del contrato
 * RPC1 `free_router_platform_v1` contra un borde y un motor simulados.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createFreeRouterPlatform,
  supportsPlatformFreeRouter,
  type EdgeSend,
  type EngineCall,
  type FreeRouterScope,
} from "../../src/features/settings/free-router-platform.ts";

const SCOPE: FreeRouterScope = { account: "42", org: "org_A", sub: "user_A", workspace: "q3ce37ff" };
const BASE = "/v1/workspaces/42/free-router";
const POLICY = { version: 3, policy_id: "d9386cbf", providers: ["kilo", "vercel", "reflection"] };

type Sent = { method: string; path: string; body?: unknown; key?: string };
type Called = { command: string; args: Record<string, unknown> };

type Answer = { status: number; body?: unknown; retryAfterMs?: number };

function lab(overrides: { edge?: (r: Sent, n: number) => Answer | Promise<Answer> | undefined; engine?: (c: Called) => unknown } = {}) {
  const sent: Sent[] = [];
  const called: Called[] = [];
  let now = 1_000_000;
  const timers: { at: number; run: () => void }[] = [];
  const edge: EdgeSend = async (method, path, body, key) => {
    const r = { method, path, ...(body === undefined ? {} : { body }), ...(key ? { key } : {}) };
    const n = sent.filter((s) => s.method === method && s.path === path).length;
    sent.push(r);
    const custom = overrides.edge?.(r, n);
    if (custom) return custom;
    if (method === "GET" && path === BASE) return { status: 200, body: { offered: true, policy: POLICY, consent: { accepted: true, revision: 2 } } };
    if (method === "PUT" && path === `${BASE}/consent`) return { status: 200, body: { accepted: true, revision: 2 } };
    if (method === "DELETE" && path === `${BASE}/consent`) return { status: 200, body: { accepted: false, revision: 3 } };
    if (method === "POST" && path === `${BASE}/engine-workspaces/q3ce37ff/challenge`) return { status: 200, body: { nonce: "central-nonce-AAAA", expires_at: "x" } };
    if (method === "PUT" && path === `${BASE}/engine-workspaces/q3ce37ff`) return { status: 200, body: { assignment_id: "fra_1", binding_id: "frb_1" } };
    if (method === "POST" && path === `${BASE}/grant`) return { status: 200, body: { grant: `jws.${n}`, expires_at: new Date(now + 120_000).toISOString() } };
    if (method === "DELETE" && path.startsWith(`${BASE}/engine-workspaces/q3ce37ff/bindings/`)) return { status: 204 };
    return { status: 404, body: { code: "route_not_found" } };
  };
  const engine: EngineCall = async (command, args) => {
    called.push({ command, args });
    const custom = overrides.engine?.({ command, args });
    if (custom !== undefined) return custom;
    if (command === "set_free_router_union") return { owner: args.sub ?? null, platform: !!args.platformAccount };
    if (command === "prove_free_router_binding") return { jwk: { kty: "EC", crv: "P-256", x: "x", y: "y" }, sig: "sig" };
    if (command === "free_router_binding") return { jkt: "jkt", nonce: `local-nonce-${called.length}` };
    if (command === "set_free_router_grant") return { sealed: true };
    if (command === "clear_free_router_grant") return null;
    throw { code: "free_router.invalid_request" };
  };
  const clock = {
    now: () => now,
    schedule: (run: () => void, ms: number) => {
      const t = { at: now + ms, run };
      timers.push(t);
      return () => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); };
    },
    async advance(ms: number) {
      const until = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers[0];
        if (!next || next.at > until) break;
        timers.shift();
        now = next.at;
        next.run();
        for (let i = 0; i < 200; i++) await Promise.resolve();
      }
      now = until;
      for (let i = 0; i < 200; i++) await Promise.resolve();
    },
  };
  let keys = 0;
  // Las esperas entre reintentos avanzan el reloj sin dormir; las renovaciones van por `schedule`.
  const sleep = async (ms: number) => { now += ms; };
  const router = createFreeRouterPlatform({ edge, engine, now: clock.now, schedule: clock.schedule, sleep, key: () => `key-${++keys}`, budgetMs: 20_000 });
  return { router, sent, called, clock };
}

const route = (s: Sent) => `${s.method} ${s.path.replace(BASE, "…")}`;

test("the engine announces the platform Free router only with free_router_platform_v1", () => {
  assert.equal(supportsPlatformFreeRouter({ service_features: ["free_router_platform_v1"] }), true);
  assert.equal(supportsPlatformFreeRouter({ service_features: ["something_else"] }), false);
  assert.equal(supportsPlatformFreeRouter({}), false);
  assert.equal(supportsPlatformFreeRouter(null), false);
});

test("link and first grant follow the contract walk: union, challenge, proof, PUT, binding, grant, install", async () => {
  const { router, sent, called } = lab();
  const linked = await router.link(SCOPE);
  assert.deepEqual(linked, { assignmentId: "fra_1", bindingId: "frb_1" });
  await router.grant(SCOPE);
  assert.deepEqual(called.map((c) => c.command), [
    "set_free_router_union", "prove_free_router_binding", "free_router_binding", "set_free_router_grant",
  ]);
  assert.deepEqual(called[0].args, { workspace: "q3ce37ff", platformAccount: "42", org: "org_A", sub: "user_A" });
  assert.deepEqual(called[1].args, { workspace: "q3ce37ff", nonce: "central-nonce-AAAA" }, "the proof signs the central challenge nonce");
  assert.deepEqual(sent.map(route), ["POST …/engine-workspaces/q3ce37ff/challenge", "PUT …/engine-workspaces/q3ce37ff", "POST …/grant"]);
  assert.deepEqual(sent[1].body, { nonce: "central-nonce-AAAA", jwk: { kty: "EC", crv: "P-256", x: "x", y: "y" }, sig: "sig" });
  const grant = sent[2].body as { binding_id: string; nonce: string };
  assert.equal(grant.binding_id, "frb_1", "the binding comes from the server, never from the client");
  assert.equal(grant.nonce, "local-nonce-3", "the grant uses the engine's generation nonce, not the central one");
  assert.deepEqual(called[3].args, { workspace: "q3ce37ff", token: "jws.0" });
  for (const s of sent.filter((s) => s.method !== "GET")) assert.ok(s.key, `${route(s)} carries an Idempotency-Key`);
});

test("a lost PUT response is retried with the same key and does not prove twice", async () => {
  const { router, sent, called } = lab({
    edge: (r, n) => (r.method === "PUT" && r.path.endsWith("/engine-workspaces/q3ce37ff") && n === 0 ? { status: 503, retryAfterMs: 1 } : undefined),
  });
  await router.link(SCOPE);
  const puts = sent.filter((s) => s.method === "PUT");
  assert.equal(puts.length, 2);
  assert.equal(puts[0].key, puts[1].key);
  assert.equal(called.filter((c) => c.command === "prove_free_router_binding").length, 1);
});

test("an expired or reused challenge asks for a new one once, never resending the old proof", async () => {
  const { router, sent, called } = lab({
    edge: (r, n) => (r.method === "PUT" && r.path.endsWith("/engine-workspaces/q3ce37ff") && n === 0 ? { status: 409, body: { code: "binding_proof_invalid" } } : undefined),
  });
  await router.link(SCOPE);
  assert.equal(sent.filter((s) => s.path.endsWith("/challenge")).length, 2);
  assert.equal(called.filter((c) => c.command === "prove_free_router_binding").length, 2);
  const puts = sent.filter((s) => s.method === "PUT");
  assert.notEqual(puts[0].key, puts[1].key, "a new proof is a new intention");
});

test("assignment_conflict and other definitive refusals are not repeated", async () => {
  const { router, sent } = lab({
    edge: (r) => (r.method === "PUT" && r.path.endsWith("/engine-workspaces/q3ce37ff") ? { status: 409, body: { code: "assignment_conflict" } } : undefined),
  });
  await assert.rejects(router.link(SCOPE), (e: { code?: string }) => e.code === "assignment_conflict");
  assert.equal(sent.filter((s) => s.method === "PUT").length, 1);
});

test("the grant is renewed when less than half its life remains, with a fresh local nonce", async () => {
  const { router, sent, called, clock } = lab();
  await router.link(SCOPE);
  await router.grant(SCOPE);
  await clock.advance(59_000);
  assert.equal(sent.filter((s) => s.path === `${BASE}/grant`).length, 1);
  await clock.advance(2_000);
  const grants = sent.filter((s) => s.path === `${BASE}/grant`);
  assert.equal(grants.length, 2);
  assert.notEqual((grants[0].body as { nonce: string }).nonce, (grants[1].body as { nonce: string }).nonce);
  assert.equal(called.filter((c) => c.command === "set_free_router_grant").length, 2);
});

test("a renewal rejected for a stale generation stops: a revoked generation is never restored", async () => {
  let refuse = false;
  const { router, sent, clock } = lab({
    engine: (c) => {
      if (c.command === "set_free_router_grant" && refuse) throw { code: "free_router.grant.stale_nonce" };
      return undefined;
    },
  });
  await router.link(SCOPE);
  await router.grant(SCOPE);
  refuse = true;
  await clock.advance(61_000);
  await clock.advance(600_000);
  assert.equal(sent.filter((s) => s.path === `${BASE}/grant`).length, 3, "one retry with a fresh nonce, then it stops");
});

test("withdrawing is DELETE consent and then clear, and stops renewals", async () => {
  const { router, sent, called, clock } = lab();
  await router.link(SCOPE);
  await router.grant(SCOPE);
  await router.withdraw(SCOPE);
  const del = sent.findIndex((s) => s.method === "DELETE" && s.path === `${BASE}/consent`);
  const clear = called.findIndex((c) => c.command === "clear_free_router_grant");
  assert.ok(del >= 0 && clear >= 0);
  assert.deepEqual(called[clear].args, { workspace: "q3ce37ff" });
  await clock.advance(600_000);
  assert.equal(sent.filter((s) => s.path === `${BASE}/grant`).length, 1);
});

test("a withdrawal whose DELETE fails does not clear the grant as if it were revoked", async () => {
  const { router, called } = lab({ edge: (r) => (r.method === "DELETE" && r.path === `${BASE}/consent` ? { status: 403, body: { code: "no_access" } } : undefined) });
  await assert.rejects(router.withdraw(SCOPE), (e: { code?: string }) => e.code === "no_access");
  assert.equal(called.some((c) => c.command === "clear_free_router_grant"), false);
});

test("signing out drops local authority at once, then deletes this session's bindings", async () => {
  const { router, sent, called, clock } = lab({
    edge: (r) => (r.method === "DELETE" && r.path.includes("/bindings/") ? { status: 503, retryAfterMs: 1_000 } : undefined),
  });
  await router.link(SCOPE);
  await router.grant(SCOPE);
  await router.signOut("user_A");
  const union = called.filter((c) => c.command === "set_free_router_union").at(-1)!;
  assert.deepEqual(union.args, { workspace: "q3ce37ff" }, "the union is closed without the platform values, while the cloud is still failing");
  assert.ok(sent.some((s) => s.method === "DELETE" && s.path === `${BASE}/engine-workspaces/q3ce37ff/bindings/frb_1`));
  assert.equal(sent.some((s) => s.method === "DELETE" && s.path === `${BASE}/consent`), false, "logout is not a consent revocation");
  await clock.advance(600_000);
  assert.equal(sent.filter((s) => s.path === `${BASE}/grant`).length, 1, "no renewal after logout");
  const deletes = sent.filter((s) => s.method === "DELETE" && s.path.includes("/bindings/"));
  assert.ok(deletes.length >= 2, "the binding DELETE is retried in the background");
  assert.ok(deletes.every((d) => d.key === deletes[0].key), "with one key");
  const bound = deletes.length;
  await clock.advance(24 * 3_600_000);
  assert.ok(sent.filter((s) => s.method === "DELETE" && s.path.includes("/bindings/")).length - bound <= 1, "the retries have a budget");
});

test("a grant answer that arrives after logout is never installed", async () => {
  let answer!: (v: Answer) => void;
  const { router, called } = lab({
    edge: (r) => (r.path === `${BASE}/grant` ? new Promise<Answer>((resolve) => { answer = resolve; }) : undefined),
  });
  await router.link(SCOPE);
  const pending = router.grant(SCOPE);
  for (let i = 0; i < 200; i++) await Promise.resolve();
  await router.signOut("user_A");
  answer({ status: 200, body: { grant: "jws.late", expires_at: new Date(Date.now() + 120_000).toISOString() } });
  await assert.rejects(pending, (e: { code?: string }) => e.code === "stale");
  assert.equal(called.some((c) => c.command === "set_free_router_grant"), false);
});

test("reading the state tolerates a route that is not deployed yet and fails closed on unknown deciding values", async () => {
  const { router, sent } = lab({
    edge: (r, n) => {
      if (r.method !== "GET") return undefined;
      if (n < 2) return n === 0 ? { status: 404, body: null } : { status: 501, body: null };
      return { status: 200, body: { offered: "maybe", policy: POLICY, consent: { accepted: true, revision: 1 } } };
    },
  });
  assert.deepEqual(await router.read("42"), { kind: "unavailable", code: "free_router_unavailable" });
  assert.equal(sent.filter((s) => s.method === "GET").length, 3, "404 and 501 are retried until the route appears");
});

test("a route that never appears within the budget is reported as not yet, without inventing a refusal", async () => {
  const { router } = lab({ edge: (r) => (r.method === "GET" ? { status: 404, body: null } : undefined) });
  assert.deepEqual(await router.read("42"), { kind: "not_yet" });
});

test("reading the state ignores new compatible fields and keeps the policy", async () => {
  const { router } = lab({
    edge: (r) => (r.method === "GET" ? { status: 200, body: { offered: true, policy: { ...POLICY, extra: 1 }, consent: { accepted: false, revision: 4 }, legacy_hint: true, future: {} } } : undefined),
  });
  assert.deepEqual(await router.read("42"), { kind: "ready", offered: true, policy: POLICY, consent: { accepted: false, revision: 4 }, legacyHint: true });
});

test("an unknown problem code fails closed as unavailable", async () => {
  const { router } = lab({ edge: (r) => (r.method === "GET" ? { status: 403, body: { code: "brand_new_code" } } : undefined) });
  assert.deepEqual(await router.read("42"), { kind: "unavailable", code: "free_router_unavailable" });
});

test("accepting sends one CAS intention and a revision conflict is not retried", async () => {
  const { router, sent } = lab({ edge: (r) => (r.method === "PUT" && r.path === `${BASE}/consent` ? { status: 409, body: { code: "revision_conflict" } } : undefined) });
  await assert.rejects(router.accept("42", { revision: 1, ...POLICY }), (e: { code?: string }) => e.code === "revision_conflict");
  const puts = sent.filter((s) => s.method === "PUT");
  assert.equal(puts.length, 1);
  assert.deepEqual(puts[0].body, { revision: 1, ...POLICY });
});

test("an engine refusal that arrives as a bare string keeps its closed code", async () => {
  const { router } = lab({ engine: (c) => { if (c.command === "set_free_router_union") throw "free_router.interface_only"; return undefined; } });
  await assert.rejects(router.link(SCOPE), (e: { code?: string }) => e.code === "free_router.interface_only");
});

const failOnce = (code: string, command = "set_free_router_grant") => {
  let failed = false;
  return (c: Called) => {
    if (c.command === command && !failed) { failed = true; throw code; }
    return undefined;
  };
};

test("stale_nonce or not_fresh on install retries once with a fresh local nonce and grant", async () => {
  for (const code of ["free_router.grant.stale_nonce", "free_router.grant.not_fresh"]) {
    const { router, sent, called } = lab({ engine: failOnce(code) });
    await router.link(SCOPE);
    await router.grant(SCOPE);
    assert.equal(sent.filter((s) => s.path === `${BASE}/grant`).length, 2, code);
    assert.equal(called.filter((c) => c.command === "free_router_binding").length, 2, code);
  }
});

test("no_pending (engine restarted) relinks with a new challenge, proof and PUT before the grant", async () => {
  const { router, sent, called } = lab({ engine: failOnce("free_router.grant.no_pending") });
  await router.link(SCOPE);
  await router.grant(SCOPE);
  assert.equal(sent.filter((s) => s.path.endsWith("/challenge")).length, 2);
  assert.equal(called.filter((c) => c.command === "prove_free_router_binding").length, 2);
  assert.equal(called.filter((c) => c.command === "set_free_router_grant").length, 2);
});

test("a different jkt from the engine means a restarted engine: relink before asking for a grant", async () => {
  let restarted = false;
  const { router, sent, clock } = lab({
    engine: (c) => (c.command === "free_router_binding" ? { jkt: restarted ? "jkt-2" : "jkt-1", nonce: `n-${Math.random()}` } : undefined),
  });
  await router.link(SCOPE);
  await router.grant(SCOPE);
  restarted = true;
  await clock.advance(61_000);
  assert.equal(sent.filter((s) => s.path.endsWith("/challenge")).length, 2, "the renewal relinked");
  assert.equal(sent.filter((s) => s.path === `${BASE}/grant`).length, 2);
});

test("wrong_owner or owner_required restores this session's union once and retries", async () => {
  for (const [code, command] of [["free_router.grant.wrong_owner", "set_free_router_grant"], ["free_router.owner_required", "free_router_binding"]]) {
    const { router, called } = lab({ engine: failOnce(code, command) });
    await router.link(SCOPE);
    await router.grant(SCOPE);
    const unions = called.filter((c) => c.command === "set_free_router_union");
    assert.equal(unions.length, 2, code);
    assert.deepEqual(unions[1].args, { workspace: "q3ce37ff", platformAccount: "42", org: "org_A", sub: "user_A" });
    assert.equal(called.filter((c) => c.command === "set_free_router_grant").at(-1) !== undefined, true);
  }
});

test("mismatch and the other grant codes are not retried blindly", async () => {
  for (const code of ["free_router.grant.mismatch", "free_router.grant.signature", "settings.accounts.free.unavailable"]) {
    const { router, sent } = lab({ engine: failOnce(code) });
    await router.link(SCOPE);
    await assert.rejects(router.grant(SCOPE), (e: { code?: string }) => e.code === code);
    assert.equal(sent.filter((s) => s.path === `${BASE}/grant`).length, 1, code);
  }
});

test("sealed:false is a renewal of an installed grant, not a failure", async () => {
  const { router, clock, sent } = lab({ engine: (c) => (c.command === "set_free_router_grant" ? { sealed: false } : undefined) });
  await router.link(SCOPE);
  await router.grant(SCOPE);
  await clock.advance(61_000);
  assert.equal(sent.filter((s) => s.path === `${BASE}/grant`).length, 2);
});

test("the scope comes only from a row of the active organization of the same /v1/workspaces answer", async () => {
  const { platformScope } = await import("../../src/features/settings/free-router-platform.ts");
  const list = {
    active_workspace_id: "42",
    items: [
      { id: "42", org: "org_A1", name: "Activa", role: "owner" },
      { id: "43", org: "org_A1", name: "Misma org", role: "member" },
      { id: "77", org: "org_B2", name: "Otra org", role: "owner" },
    ],
  };
  assert.deepEqual(platformScope(list, "43", "user_A", "q3ce37ff"), { account: "43", org: "org_A1", sub: "user_A", workspace: "q3ce37ff" });
  assert.equal(platformScope(list, "77", "user_A", "q3ce37ff"), null, "another organization needs an organization switch first");
  assert.equal(platformScope({ ...list, active_workspace_id: null }, "42", "user_A", "q3ce37ff"), null, "without an active row there is no org to trust");
  assert.equal(platformScope({ ...list, active_workspace_id: "999" }, "42", "user_A", "q3ce37ff"), null);
  assert.equal(platformScope({ active_workspace_id: "42", items: [{ id: "42", org: "Danil", name: "x" }] }, "42", "user_A", "q3ce37ff"), null, "an org that is not a WorkOS id fails closed");
  assert.equal(platformScope(list, "042", "user_A", "q3ce37ff"), null);
  assert.equal(platformScope(list, "42", "persona", "q3ce37ff"), null);
  assert.equal(platformScope(list, "42", "user_A", "a.b"), null, "an engine workspace outside the contract pattern cannot be assigned");
});

test("no_access is definitive: the challenge is not retried and does not burn more quota", async () => {
  const { router, sent } = lab({ edge: (r) => (r.path.endsWith("/challenge") ? { status: 403, body: { code: "no_access" } } : undefined) });
  await assert.rejects(router.link(SCOPE), (e: { code?: string }) => e.code === "no_access");
  assert.equal(sent.filter((s) => s.path.endsWith("/challenge")).length, 1);
});
