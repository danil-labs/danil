import assert from "node:assert/strict";
import test from "node:test";
import { barWorkspaceIds, createDanilWorkspace, type DirectoryEntry, groupDirectory, linkDanilWorkspace, listDirectory, setDirectoryPins } from "../../../../packages/computers/src/directory.ts";

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

test("creating posts `create` alone and passes the existing personal workspace through", async () => {
  const calls: { url: string; init?: { method?: string; body?: string } }[] = [];
  const ok = (async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, init });
    return Response.json({ workspace: {}, danil_workspace_id: 812, created: true }, { status: 201 });
  }) as never;
  const created = await createDanilWorkspace("https://c.test", "t", "ab12", ok);
  assert.equal(created.kind === "ok" && created.value, 812);
  assert.equal(calls[0].url, "https://c.test/v1/workspaces/ab12/danil-workspace");
  assert.equal(calls[0].init?.method, "POST");
  assert.equal(calls[0].init?.body, JSON.stringify({ create: true }));
  const exists = (async () => Response.json({ error: { code: "personal_workspace_exists", danil_workspace_id: 476 } }, { status: 409 })) as never;
  assert.deepEqual(await createDanilWorkspace("https://c.test", "t", "ab12", exists), { kind: "error", status: 409, code: "personal_workspace_exists" });
});
