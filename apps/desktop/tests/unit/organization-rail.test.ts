import assert from "node:assert/strict";
import test from "node:test";
import { emptySessionEmails } from "../../src/features/shell/empty-session-emails.ts";
import { changeOrgPreference, orderedOrganizations, parseOrgPreference, stackedOrganizations } from "../../src/features/shell/organization-rail-model.ts";
import type { SessionRailGroup } from "../../src/features/shell/session-groups.ts";

const group = (org: string, context: string, ids: string[]): SessionRailGroup => ({ org, context_id: context, family: context, email: `${context}@example.test`, org_name: org, plan: "paid", available: ids.map((id) => ({ id, name: id })), added: new Set(ids), person: context });
const rows = (ids: string[]) => ids.map((id) => ({ id, name: id, logo: null }));
test("versioned organization preference accepts only unique, valid rows and never includes session identity", () => {
  assert.deepEqual(parseOrgPreference({ version: 2, orgs: [] }), { version: 1, orgs: [] });
  assert.deepEqual(parseOrgPreference({ version: 1, orgs: [{ org_id: "a", pinned: true, sub: "ignored" }, { org_id: "a", pinned: false }, { org_id: "b", pinned: "false" }, null] }), { version: 1, orgs: [{ org_id: "a", pinned: true }] });
});
test("two emails share an organization while each tile retains its own context, even for a shared engine id", () => {
  const result = orderedOrganizations([group("a", "one", ["shared"]), group("a", "two", ["shared", "other"])], rows(["shared", "other"]), { version: 1, orgs: [] });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].contexts.map((g) => g.email), ["one@example.test", "two@example.test"]);
  assert.deepEqual(result[0].tiles.map((w) => [w.id, w.context.context_id]), [["shared", "one"], ["shared", "two"], ["other", "two"]]);
  assert.equal(new Set(result[0].tiles.map((w) => w.key)).size, 3);
});
test("saved organization order wins; new organizations append in today's order", () => {
  const result = orderedOrganizations([group("a", "one", ["1"]), group("b", "two", ["2"]), group("c", "three", ["3"])], rows(["1", "2", "3"]), { version: 1, orgs: [{ org_id: "b", pinned: true }] });
  assert.deepEqual(result.map((g) => g.id), ["b", "a", "c"]);
  assert.equal(result[0].pinned, true);
});
test("pin and move preserve the exact schema and hidden organization slots", () => {
  let pref = parseOrgPreference({ version: 1, orgs: [{ org_id: "a", pinned: false }, { org_id: "closed", pinned: true }, { org_id: "b", pinned: false }] });
  pref = changeOrgPreference(pref, ["a", "b", "new"], "b", "up");
  assert.deepEqual(pref.orgs.map((g) => g.org_id), ["b", "closed", "a", "new"]);
  pref = changeOrgPreference(pref, ["b", "a", "new"], "b", "pin");
  assert.equal(pref.orgs[0].pinned, true);
  pref = changeOrgPreference(pref, ["b", "a", "new"], "b", "down");
  assert.deepEqual(pref.orgs.map((g) => g.org_id), ["a", "closed", "b", "new"]);
  assert.equal(pref.orgs[2].pinned, true);
});
test("stack only if needed, oldest first, never pinned, opened or a single workspace", () => {
  const groups = orderedOrganizations([group("a", "one", ["1", "2"]), group("b", "two", ["3", "4"]), group("c", "three", ["5", "6"]), group("d", "four", ["7"])], rows(["1", "2", "3", "4", "5", "6", "7"]), { version: 1, orgs: [{ org_id: "a", pinned: true }] });
  assert.deepEqual([...stackedOrganizations(groups, 500, "b", {})], []);
  assert.deepEqual([...stackedOrganizations(groups, 100, "b", {})], ["c"]);
  assert.deepEqual([...stackedOrganizations(groups, 230, null, { b: 10, c: 20 })], ["b", "c"]);
  assert.deepEqual([...stackedOrganizations(groups, 300, null, {})], ["c"]);
  assert.deepEqual([...stackedOrganizations(groups, 0, null, {})], []);
});

test("tooltip balance shares a context read, rejects the wrong organization and refetches after invalidation", async () => {
  const { organizationCredits } = await import("../../src/features/shell/organization-credits.ts");
  const cache = organizationCredits();
  const calls: string[] = [];
  let responseOrg = "a";
  const send = async (context: string) => { calls.push(context); return { status: 200, body: { organization_id: responseOrg, available: { currency: "MXN", amount_micro: "1000000" } } }; };
  const group = { context: "one", org: "a", name: "A", plan: "paid" };
  assert.deepEqual(await Promise.all([cache.read(group, send), cache.read(group, send)]), [1, 1]);
  assert.deepEqual(calls, ["one"]);
  assert.equal(await cache.read({ ...group, context: "two" }, send), 1);
  assert.equal(await cache.read({ ...group, org: "b" }, send), null);
  responseOrg = "b"; cache.clear();
  assert.equal(await cache.read({ ...group, org: "b" }, send), 1);
  assert.deepEqual(calls, ["one", "two", "one", "one"]);
  cache.clear();
  assert.equal(await cache.read(group, async () => { throw { detail: "session_echo_mismatch" }; }), null);
});

test("attention for the same workspace stays personal and organization priority combines both contexts", async () => {
  const { mergeContextAttention } = await import("../../src/features/shell/context-attention.ts");
  const rows = mergeContextAttention([{ workspace: "shared", context: "one", tasks: [{ session: "a", project: "p", state: "asked" }] }], [{ workspace: "shared", context: "two", tasks: [{ session: "b", project: "p", state: "failed" }] }]);
  assert.deepEqual(rows.map((row) => [row.context, row.tasks[0].session]), [["one", "a"], ["two", "b"]]);
  const changed = mergeContextAttention(rows, [{ workspace: "shared", context: "two", tasks: [] }]);
  assert.equal(changed.find((row) => row.context === "one")?.tasks.length, 1);
  assert.equal(changed.find((row) => row.context === "two")?.tasks.length, 0);
});

test("startup and login return select an explicit context even when two contexts share an id", async () => {
  const { organizationStartTarget } = await import("../../src/features/shell/organization-start-target.ts");
  const { accountReturnTarget } = await import("../../src/features/shell/account-return-target.ts");
  const groups = [group("org", "one", ["shared"]), group("org", "two", ["shared"])];
  assert.deepEqual(organizationStartTarget(groups, "shared", null, "two"), { id: "shared", context: "two" });
  assert.deepEqual(organizationStartTarget(groups, "shared", "one", "two"), { id: "shared", context: "one" });
  assert.deepEqual(accountReturnTarget(groups, ["one"]), { id: "shared", context: "two" });
});

test("tile metadata comes only from its contextual listing, never from the global engine index", () => {
  const scoped = group("org", "two", ["shared"]);
  scoped.available = [{ id: "shared", name: "B's workspace" }];
  const [org] = orderedOrganizations([scoped], [{ id: "shared", name: "A's workspace", logo: "private/path.png" }], { version: 1, orgs: [] });
  assert.equal(org.tiles[0].name, "B's workspace");
  assert.equal(org.tiles[0].logo, null);
});

test("an email with no tile in the rail keeps a footer sign-out, by the same rule as the rail, once per email", () => {
  const group = (family: string, email: string | null, available: readonly { id: string }[] | null, added: string[] | null) => ({ family, email, available, added: added ? new Set(added) : null });
  const groups = [
    group("f1", "Empty@example.com", [], []), group("f1b", "empty@example.com", [], []),
    group("f2", "busy@example.com", [], []), group("f2", "busy@example.com", [{ id: "w" }], ["w"]),
    group("f3", "loading@example.com", null, null),
    group("f4", null, [], []),
    group("f5", "later@example.com", [{ id: "l1" }, { id: "l2" }], []),
    group("f6", "hidden@example.com", [{ id: "h" }], null),
    group("f7", "open@example.com", [{ id: "opened" }], []),
  ];
  assert.deepEqual(emptySessionEmails(groups, "opened").map((row) => row.family), ["f1", "f3", "f4", "f5", "f6"]);
  assert.deepEqual(emptySessionEmails(groups, null).map((row) => row.family), ["f1", "f3", "f4", "f5", "f6", "f7"]);
  assert.deepEqual(emptySessionEmails(null, null), []);
});
