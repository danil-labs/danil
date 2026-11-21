import assert from "node:assert/strict";
import test from "node:test";
import { distinguish, webWorkspacePicker } from "../../src/web/workspace-picker.ts";

const workspace = (account_id: string, name: string) => ({ account_id, name, engine_workspace_id: "engine" + account_id });
const ctx = (context_id: string, org_name: string, workspaces: ReturnType<typeof workspace>[] | null) => ({ context_id, org: "org_" + context_id, org_name, workspaces });
function fixture() {
  const families = [
    { session_id: "first", sub: "user_A", email: "a@example.test", contexts: [ctx("A", "Norte", [workspace("1", "Proyecto"), workspace("2", "Diseño")]), ctx("B", "Sur", [workspace("3", "Proyecto")])] },
    { session_id: "second", sub: "user_B", email: "b@example.test", contexts: [ctx("C", "Sur", [workspace("4", "Proyecto")])] },
  ];
  const writes: { path: string; context: string | null }[] = [];
  const prefs = new Map<string, Set<string>>();
  const store = new Map<string, string>();
  let mismatch = false, deny = false, connections = 0;
  const headers = (context: string) => ({ "X-Danil-Session-Applied": mismatch ? "other" : context, "X-Danil-Session-Applied-Org": "org_" + context });
  const picker = webWorkspacePicker({
    async call(path, init) {
      if (path === "identity/sessions/catalog") {
        assert.equal(init, undefined);
        return Response.json({ version: 1, items: families });
      }
      assert.equal(path, "workspaces/preferences");
      const c = new Headers(init?.headers).get("X-Danil-Session")!;
      return Response.json({ added: [...(prefs.get(c) ?? [])], version: 1 }, { headers: headers(c) });
    },
    async mutation(path, init) {
      const c = new Headers(init?.headers).get("X-Danil-Session")!;
      if (path === "workspaces/select") {
        assert.equal(init?.method, "POST");
        const id = JSON.parse(String(init.body)).workspace;
        writes.push({ path, context: c });
        return Response.json({ workspace: {id, org: "org_" + c, name: "Proyecto", role: "owner"} }, {headers: headers(c)});
      }
      assert.equal(init?.method, "PUT");
      writes.push({ path, context: c });
      if (deny) throw new Error("revoked");
      prefs.set(c, new Set([path.split("/").at(-1)!]));
      return new Response(null, { status: 204, headers: headers(c) });
    },
  }, { store: { getItem: (k: string) => store.get(k), setItem: (k: string, v: string) => store.set(k,v), removeItem: (k: string) => store.delete(k) } as Storage,
    connect: async () => { connections++; } });
  return { picker, writes, families, mismatch: () => { mismatch = true; }, deny: () => { deny = true; }, connections: () => connections };
}

test("two signed-in identities and three organizations share a read-only picker", async () => {
  const f = fixture();
  const { rows, partial } = await f.picker.catalog();
  assert.equal(partial, false);
  assert.deepEqual(rows.map(w => [w.name, distinguish(rows, w)]), [
    ["Proyecto", "Norte"], ["Diseño", ""], ["Proyecto", "Sur · a@example.test"], ["Proyecto", "Sur · b@example.test"],
  ]);
  assert.deepEqual(f.writes, []);
  const applied: string[] = [];
  await f.picker.add(rows[3], async row => { applied.push(`${row.context}:${row.engine_workspace_id}`); });
  assert.deepEqual(applied, ["C:engine4"], "the rail adds it to its own context");
  assert.deepEqual(f.writes, [], "the picker writes nothing global: no workspaces/select");
});

test("revocation after display and a refused add never confirm a pin", async () => {
  const f = fixture(), row = (await f.picker.catalog()).rows[3];
  f.families.pop();
  let applied = 0;
  await assert.rejects(f.picker.add(row, async () => { applied++; }), /not_available/);
  assert.equal(applied, 0);
  const other = (await f.picker.catalog()).rows[0];
  let confirmed = 0; f.picker.subscribe(() => { confirmed++; });
  await assert.rejects(f.picker.add(other, async () => { throw new Error("revoked"); }), /revoked/);
  assert.equal(confirmed, 0);
  assert.deepEqual(f.writes, []);
});

test("a partial directory preserves verified rows and an additive return reopens once", async () => {
  const f = fixture();
  f.families[0].contexts[0].workspaces = null;
  const got = await f.picker.catalog();
  assert.equal(got.partial, true); assert.equal(got.rows.length, 2);
  assert.equal(f.picker.resume(), false); await f.picker.connect();
  assert.equal(f.connections(), 1); assert.equal(f.picker.resume(), true); assert.equal(f.picker.resume(), false);
});

test("an organization without a context is listed once and admitted on its own", async () => {
  const account = { account_id: "41", engine_workspace_id: "engine41", name: "Catálogo" };
  const events: string[] = [];
  const store = new Map<string, string>();
  let admitted: { organization: string; session_id: string } | null = null;
  const body = { version: 1, items: [{ session_id: "s1", sub: "user_A", email: "a@example.test", contexts: [
    { context_id: "c1", org: "org_A", org_name: "Danil", workspaces: [account], catalog_state: "listed" },
    { context_id: null, org: "org_B", org_name: "Azul", workspaces: null, admission_required: true, catalog_state: "listed" },
    { context_id: null, org: "org_C", org_name: "Cero", workspaces: null, admission_required: true, catalog_state: "empty" },
    { context_id: "c2", org: "org_D", org_name: "Opaca", workspaces: null, catalog_state: "unavailable" },
  ] }] };
  const picker = webWorkspacePicker({
    async call(path) { assert.equal(path, "identity/sessions/catalog"); return Response.json(body); },
    async mutation(path, init) {
      assert.equal(path, "identity/contexts");
      admitted = JSON.parse(String(init.body));
      assert.match(new Headers(init.headers).get("Idempotency-Key") ?? "", /./);
      events.push("admitted");
      return Response.json({ context_id: "c9", org: "org_B" });
    },
  }, { store: { getItem: k => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: k => void store.delete(k) } as Storage });

  const { rows, organizations, partial } = await picker.catalog();
  assert.equal(partial, true, "una organización admitida sin lista no es una lista vacía");
  assert.deepEqual(rows.map(row => [row.name, row.organization]), [["Catálogo", "Danil"]]);
  assert.deepEqual(organizations.map(org => [org.org, org.admission_required, org.catalog_state]), [
    ["org_A", false, "listed"], ["org_B", true, "listed"], ["org_C", true, "empty"], ["org_D", false, "unavailable"],
  ]);
  // Solo esa organización, con la sesión que la enumeró.
  await picker.admit(organizations[1]!);
  assert.deepEqual(admitted, { organization: "org_B", session_id: "s1" });
  assert.deepEqual(events, ["admitted"]);
  assert.equal(
    store.get("danil.web.resume-add-workspace"),
    undefined,
    "una admisión sin salir de la página no reabre el selector al recargar",
  );
  assert.equal(picker.resume(), false);
});

test("an organization that needs SSO or MFA sends the login with that organization", async () => {
  const store = new Map<string, string>();
  let signedIn = "";
  const org = { session: "s1", sub: "user_A", email: "", org: "org_B", organization: "Azul", context: null, admission_required: true, catalog_state: "listed" as const };
  const picker = webWorkspacePicker({
    async call() { throw new Error("no reads"); },
    async mutation() { const error = Object.assign(new Error("denied"), { code: "organization_auth_required" }); throw error; },
  }, { store: { getItem: k => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: k => void store.delete(k) } as Storage,
    signIn: organization => { signedIn = organization; } });
  await picker.admit(org);
  assert.equal(signedIn, "org_B");
  assert.equal(picker.resume(), true, "la marca sobrevive para reabrir el selector al volver");
});
