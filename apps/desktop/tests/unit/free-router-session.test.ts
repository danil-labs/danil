/** El Free router de plataforma de la ventana: anfitrión, ámbito de la organización activa, aceptar lo que se vio y logout. */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { FreeModelPolicy } from "../../src/lib/free-model-policy.ts";
import { activatePlatform, isPlatformPolicy, needsPlatform, setFreeRouterHost, signOutPlatform, withdrawPlatform } from "../../src/features/settings/free-router-session.ts";

const POLICY = { workspace_id: "q3ce37ff", version: 3, providers: ["kilo", "vercel", "reflection"], lines: [], acceptance_ref: "", enabled: false, terms: [], accepted: false, authority: "platform" } as FreeModelPolicy;
const LIST = { active_workspace_id: "42", items: [{ id: "42", org: "org_A1", name: "Activa", role: "owner" }] };
const BASE = "/v1/workspaces/42/free-router";

function host(opts: { consent?: boolean; offered?: boolean; version?: number; identity?: boolean } = {}) {
  const sent: string[] = [];
  const engine: string[] = [];
  setFreeRouterHost({
    edge: async (method, path) => {
      sent.push(`${method} ${path.replace(BASE, "…")}`);
      if (method === "GET") return { status: 200, body: { offered: opts.offered ?? true, policy: { version: opts.version ?? 3, policy_id: "p", providers: ["kilo", "vercel", "reflection"] }, consent: { accepted: opts.consent ?? false, revision: 1 } } };
      if (path.endsWith("/consent")) return { status: 200, body: { accepted: method === "PUT", revision: 2 } };
      if (path.endsWith("/challenge")) return { status: 200, body: { nonce: "central-nonce", expires_at: "x" } };
      if (path.endsWith("/grant")) return { status: 200, body: { grant: "jws", expires_at: new Date(Date.now() + 120_000).toISOString() } };
      if (path.includes("/bindings/")) return { status: 204 };
      return { status: 200, body: { assignment_id: "fra_1", binding_id: "frb_1" } };
    },
    identity: async () => (opts.identity === false ? null : { sub: "user_A", list: LIST }),
    engine: () => async (command, args) => {
      engine.push(`${command}${"sub" in args ? "" : ":null"}`);
      if (command === "prove_free_router_binding") return { jwk: {}, sig: "s" };
      if (command === "free_router_binding") return { jkt: "j", nonce: "local-nonce-0001" };
      if (command === "list_workspaces") return { workspaces: [{ id: "q3ce37ff", name: "a" }, { id: "w2", name: "b" }], active: "q3ce37ff" };
      if (command === "release_free_router_owner") return { released: [{ workspace: "q3ce37ff", platformAccount: "42", bindings: ["frb_1"] }] };
      return {};
    },
  });
  return { sent, engine };
}

test("only a policy the engine marks as platform, or its platform_required refusal, takes the platform path", () => {
  assert.equal(isPlatformPolicy(POLICY), true);
  assert.equal(isPlatformPolicy({ ...POLICY, authority: undefined } as FreeModelPolicy), false);
  assert.equal(isPlatformPolicy({ ...POLICY, authority: "local" } as FreeModelPolicy), false);
  assert.equal(needsPlatform("free_router.platform_required"), true);
  assert.equal(needsPlatform({ detail: "free_router.platform_required" }), true);
  assert.equal(needsPlatform({ code: "settings.accounts.free.unavailable" }), false);
});

test("without a host or a platform session the Router stays closed and nothing reaches the engine", async () => {
  setFreeRouterHost(null);
  await assert.rejects(activatePlatform(POLICY));
  const { sent, engine } = host({ identity: false });
  await assert.rejects(activatePlatform(POLICY));
  assert.deepEqual([sent, engine], [[], []]);
});

test("activating accepts in workspaces, links and installs the grant", async () => {
  const { sent, engine } = host();
  await activatePlatform(POLICY);
  assert.deepEqual(sent, ["GET …", "PUT …/consent", "POST …/engine-workspaces/q3ce37ff/challenge", "PUT …/engine-workspaces/q3ce37ff", "POST …/grant"]);
  assert.deepEqual(engine, ["set_free_router_union", "prove_free_router_binding:null", "free_router_binding:null", "set_free_router_grant:null"]);
});

test("an already accepted consent is not sent again, and another policy version is not accepted", async () => {
  const { sent } = host({ consent: true });
  await activatePlatform(POLICY);
  assert.equal(sent.includes("PUT …/consent"), false);
  const other = host({ version: 4 });
  await assert.rejects(activatePlatform(POLICY), (e: { code?: string }) => e.code === "policy_changed");
  assert.deepEqual(other.sent, ["GET …"]);
  const unoffered = host({ offered: false });
  await assert.rejects(activatePlatform(POLICY), (e: { code?: string }) => e.code === "not_offered");
  assert.deepEqual(unoffered.sent, ["GET …"]);
});

test("withdrawing deletes the consent, then clears; signing out closes the union and deletes the binding", async () => {
  const { sent, engine } = host();
  await activatePlatform(POLICY);
  await withdrawPlatform(POLICY);
  assert.ok(sent.indexOf("DELETE …/consent") > 0);
  assert.equal(engine.at(-1), "clear_free_router_grant:null");
  const again = host();
  await activatePlatform(POLICY);
  await signOutPlatform();
  assert.ok(again.engine.includes("release_free_router_owner"));
  assert.ok(again.sent.includes("DELETE …/engine-workspaces/q3ce37ff/bindings/frb_1"));
  assert.equal(again.sent.includes("DELETE …/consent"), false);
});

test("signing out after a window restart still releases the person on the engine and deletes what it returns", async () => {
  const { sent, engine } = host();
  await signOutPlatform();
  assert.deepEqual(engine, ["list_workspaces:null", "release_free_router_owner"]);
  assert.deepEqual(sent, ["DELETE …/engine-workspaces/q3ce37ff/bindings/frb_1"]);
});

test("against an engine without free_router_platform_v1 (9663913a) the window stays on the local consent and sign-out stays silent", async () => {
  // La política de ese motor no trae `authority`: el consentimiento sigue el camino local de #434.
  const legacy = { ...POLICY, authority: undefined, acceptance_ref: "danil-free-consent:x", enabled: true } as FreeModelPolicy;
  assert.equal(isPlatformPolicy(legacy), false);
  const sent: string[] = [];
  const engine: string[] = [];
  setFreeRouterHost({
    edge: async (method, path) => { sent.push(`${method} ${path}`); return { status: 200, body: {} }; },
    identity: async () => ({ sub: "user_A", list: LIST }),
    engine: () => async (command) => {
      engine.push(command);
      if (command === "list_workspaces") return { workspaces: [{ id: "q3ce37ff", name: "a" }], active: "q3ce37ff" };
      throw "unknown_command";
    },
  });
  await signOutPlatform();
  assert.deepEqual(sent, [], "nothing reaches the edge");
  assert.ok(engine.every((c) => ["list_workspaces", "release_free_router_owner", "set_free_router_union"].includes(c)));
});
