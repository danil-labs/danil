import assert from "node:assert/strict";
import test from "node:test";
import { webOrganizations } from "../../src/web/organization-context.ts";

const NEW_ORG = { id: "org_N", name: "Personal", plan: "free", role: "owner" };
const CAPS = { contract: "mvp-v1", items: [{ name: "identity.organizations", version: 1, status: "available" }] };
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const authRequired = Object.assign(new Error("Edge HTTP 409"), { status: 409, code: "organization_auth_required" });

function memoryStore() {
  const map = new Map<string, string>();
  return { map, get length() { return map.size; }, key: (i: number) => [...map.keys()][i] ?? null, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
}

function edge(select: () => Promise<Response>) {
  return {
    call: async (path: string) => path === "capabilities" ? ok(CAPS) : ok({ items: [NEW_ORG], next_cursor: null, active_organization_id: null }),
    mutation: async () => select(),
  };
}

test("organization_auth_required signs in once and marks that organization", async () => {
  const store = memoryStore();
  let signIns = 0;
  const orgs = webOrganizations(edge(() => Promise.reject(authRequired)) as never, { signal: new AbortController().signal, store, signIn: () => signIns++, onSelected: () => {}, redeem: async () => ({}), now: () => 1_000_000 });
  orgs.report(authRequired);
  orgs.report(authRequired);
  assert.equal(signIns, 1, "a single redirect from this page");
  assert.equal(store.map.get("danil.web.org-auth.current"), "1000000");
  assert.equal(orgs.reauth.needed(), false);
});

test("the same 409 within two minutes of the mark stays and asks to sign in again; after two minutes it redirects", async () => {
  for (const [elapsed, redirects] of [[60_000, 0], [121_000, 1]] as const) {
    const store = memoryStore();
    store.setItem("danil.web.org-auth.current", String(1_000_000));
    let signIns = 0;
    const orgs = webOrganizations(edge(() => Promise.reject(authRequired)) as never, { signal: new AbortController().signal, store, signIn: () => signIns++, onSelected: () => {}, redeem: async () => ({}), now: () => 1_000_000 + elapsed });
    orgs.report(authRequired);
    assert.equal(signIns, redirects);
    assert.equal(orgs.reauth.needed(), redirects === 0);
  }
});

test("reaching the organization context clears the guard", async () => {
  const store = memoryStore();
  store.setItem("danil.web.org-auth.org_N", "1");
  store.setItem("other", "kept");
  let selected = 0;
  const orgs = webOrganizations(edge(async () => ok({ organization: NEW_ORG, workspace: null })) as never, { signal: new AbortController().signal, store, signIn: () => assert.fail("no sign-in"), onSelected: () => selected++, redeem: async () => ({}) });
  orgs.load();
  for (let i = 0; i < 20 && selected === 0; i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(selected, 1, "one organization and none active is selected by itself");
  assert.equal(store.map.has("danil.web.org-auth.org_N"), false);
  assert.equal(store.map.get("other"), "kept");
  orgs.stop();
});
