import assert from "node:assert/strict";
import test from "node:test";
import { barWorkspaceIds, type DirectoryEntry, groupDirectory, linkDanilWorkspace, listDirectory, setDirectoryPins } from "../../../../packages/computers/src/directory.ts";
import { canCreateWorkspace, isTakenByAnother, linkCandidates, linkProblem } from "../../src/features/settings/workspace-link.ts";

const entry = (key: string, patch: Partial<DirectoryEntry> = {}): DirectoryEntry => ({
  key, workspace_id: null, danil_workspace_id: null, name: key, kind: "personal", organization: null, role: "owner", owner: false,
  support: null, capabilities: { agents: true, terminus: false }, pin: null, ...patch,
});

test("groups keep the order and leave nothing empty", () => {
  const acme = { id: 1, name: "Acme" };
  const groups = groupDirectory([
    entry("a:1", { kind: "organization", organization: acme }), entry("w:t", { kind: "terminus_only" }), entry("a:2"),
    entry("a:3", { kind: "organization", organization: acme, support: { level: "read", expires_at: "x" } }),
  ]);
  assert.deepEqual(groups.map((g) => [g.kind, g.entries.length]), [["personal", 1], ["organization", 1], ["terminus_only", 1], ["support", 1]]);
  assert.deepEqual(groupDirectory([]), []);
});

test("the bar stays as it was without pins; with pins, those and the open one", () => {
  assert.equal(barWorkspaceIds([entry("a:1", { workspace_id: "x" })], "x"), null);
  const ids = barWorkspaceIds([entry("a:1", { workspace_id: "x", pin: 0 }), entry("a:2", { workspace_id: "y" })], "z");
  assert.deepEqual([...(ids ?? [])], ["x", "z"]);
});

test("listing and pinning talk to the control plane", async () => {
  const calls: { url: string; init?: { method?: string; body?: string } }[] = [];
  const f = (async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, init });
    return Response.json(url.endsWith("/pins") ? { keys: ["a:1"] } : { workspaces: [entry("a:1")], truncated: true });
  }) as never;
  const listed = await listDirectory("https://c.test", "t", f);
  assert.equal(listed.kind === "ok" && listed.value.truncated, true);
  const pinned = await setDirectoryPins("https://c.test", "t", ["a:1"], f);
  assert.deepEqual(pinned.kind === "ok" ? pinned.value : null, ["a:1"]);
  assert.equal(calls[1].init?.method, "PUT");
  assert.equal(calls[1].init?.body, JSON.stringify({ keys: ["a:1"] }));
});

test("a control plane without the route says so", async () => {
  const f = (async () => new Response("", { status: 404 })) as never;
  assert.equal((await listDirectory("https://c.test", "t", f)).kind, "missing");
});

test("linking posts the account to the workspace and passes the refusal code through", async () => {
  const calls: { url: string; init?: { method?: string; body?: string } }[] = [];
  const ok = (async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, init });
    return Response.json({ workspace: {}, danil_workspace_id: 476 });
  }) as never;
  const linked = await linkDanilWorkspace("https://c.test", "t", "fq gx", 476, ok);
  assert.equal(linked.kind === "ok" && linked.value, 476);
  assert.equal(calls[0].url, "https://c.test/v1/workspaces/fq%20gx/danil-workspace");
  assert.equal(calls[0].init?.method, "POST");
  assert.equal(calls[0].init?.body, JSON.stringify({ danil_workspace_id: 476 }));
  const taken = (async () => Response.json({ error: { code: "danil_workspace_taken" } }, { status: 409 })) as never;
  const refused = await linkDanilWorkspace("https://c.test", "t", "w", 476, taken);
  assert.deepEqual(refused, { kind: "error", status: 409, code: "danil_workspace_taken" });
});

test("a Danil workspace already on another machine is not offered; the current one is not a candidate", () => {
  const current = entry("a:1", { workspace_id: "w", danil_workspace_id: 1 });
  const free = entry("a:2", { danil_workspace_id: 2 });
  const taken = entry("a:3", { workspace_id: "other", danil_workspace_id: 3 });
  assert.equal(isTakenByAnother(taken, "w"), true);
  assert.equal(isTakenByAnother(current, "w"), false);
  assert.deepEqual(linkCandidates([current, free, taken, entry("w:local")], "w").map((e) => e.key), ["a:2", "a:3"]);
});

test("only an owner or admin of an organization can create; a personal account cannot", () => {
  const org = { id: 1, name: "Acme" };
  assert.equal(canCreateWorkspace([entry("a:1", { kind: "organization", organization: org, role: "member" })]), false);
  assert.equal(canCreateWorkspace([entry("a:1", { kind: "organization", organization: org, role: "owner" })]), true);
  assert.equal(canCreateWorkspace([entry("a:1", { kind: "organization", organization: org, role: "admin" })]), true);
  assert.equal(canCreateWorkspace([entry("a:1", { kind: "personal", role: "owner" })]), false);
  assert.equal(canCreateWorkspace([entry("a:1", { kind: "organization", organization: org, role: "owner", support: { level: "read", expires_at: "x" } })]), false);
});

test("link refusals are grouped for the text the person reads", () => {
  assert.equal(linkProblem("danil_workspace_taken"), "taken");
  assert.equal(linkProblem("workspace_id_taken"), "workspace_id_taken");
  assert.equal(linkProblem("not_account_admin"), "not_admin");
  assert.equal(linkProblem("account_not_found"), "account_not_found");
  assert.equal(linkProblem(null), "failed");
});
