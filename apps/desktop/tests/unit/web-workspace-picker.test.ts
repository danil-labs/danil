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
  await f.picker.add(rows[3]);
  assert.deepEqual(f.writes, [{ path: "workspaces/preferences/added/engine4", context: "C" }]);
  assert.deepEqual(await f.picker.pinned(), [rows[3]]);
});

test("revocation after display, missing echo and refusal never confirm a pin", async () => {
  const f = fixture(), row = (await f.picker.catalog()).rows[3];
  f.families.pop();
  await assert.rejects(f.picker.add(row), /not_available/);
  assert.deepEqual(f.writes, []);
  const other = (await f.picker.catalog()).rows[0];
  let confirmed = 0; f.picker.subscribe(() => { confirmed++; });
  f.mismatch(); await assert.rejects(f.picker.add(other), /echo/);
  f.deny(); await assert.rejects(f.picker.add(other), /revoked/);
  assert.equal(confirmed, 0);
});

test("a partial directory preserves verified rows and an additive return reopens once", async () => {
  const f = fixture();
  f.families[0].contexts[0].workspaces = null;
  const got = await f.picker.catalog();
  assert.equal(got.partial, true); assert.equal(got.rows.length, 2);
  assert.equal(f.picker.resume(), false); await f.picker.connect();
  assert.equal(f.connections(), 1); assert.equal(f.picker.resume(), true); assert.equal(f.picker.resume(), false);
});
