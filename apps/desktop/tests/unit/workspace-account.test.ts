import assert from "node:assert/strict";
import test from "node:test";
import { enterWorkspace, resolveWorkspaceAccount, type WorkspaceEntry } from "../../../../packages/attention/src/workspace-account.ts";
import { sessionFetch } from "../../../../packages/attention/src/request.ts";

const row = (key: string, workspace_id: string | null, danil_workspace_id: number | null, agents = true): WorkspaceEntry => ({ key, workspace_id, danil_workspace_id, name: key, capabilities: { agents } });
const entries = [row("a:476", "fqgx1w8m", 476), row("w:solo", "solo", null, false), row("a:9", null, 9), row("a:5", "expulsada", 5, false)];

function sources(active: number | null, enters = true) {
  const entered: string[] = [];
  const remembered: (string | null)[] = [];
  let current = active;
  return {
    entered, remembered,
    directory: async () => entries,
    active: async () => current,
    enter: async (key: string) => { entered.push(key); if (enters) current = Number(key.slice(2)); },
    remember: (key: string | null) => { remembered.push(key); },
  };
}

test("the link decides the account, by engine id or by key", async () => {
  assert.deepEqual(await resolveWorkspaceAccount("fqgx1w8m", sources(476)), { id: 476, name: "a:476" });
  assert.deepEqual(await resolveWorkspaceAccount("a:9", sources(9)), { id: 9, name: "a:9" });
});

test("a session in another account enters; it never shows the other one", async () => {
  const s = sources(9);
  assert.equal((await resolveWorkspaceAccount("fqgx1w8m", s))?.id, 476);
  assert.deepEqual(s.entered, ["a:476"]);
  assert.equal(s.remembered.at(-1), "a:476");
  const stuck = sources(9, false);
  await assert.rejects(resolveWorkspaceAccount("fqgx1w8m", stuck), /workspace_not_entered/);
  assert.deepEqual(stuck.remembered, []);
});

test("anything else resolves to nothing, never to another account", async () => {
  for (const workspace of [null, "", "  ", "solo", "desconocido", "expulsada", "Danil"]) {
    const s = sources(476);
    assert.equal(await resolveWorkspaceAccount(workspace, s), null, String(workspace));
    assert.deepEqual(s.entered, []);
  }
});

test("a directory that fails does not fall back to anything", async () => {
  await assert.rejects(resolveWorkspaceAccount("fqgx1w8m", { ...sources(476), directory: async () => { throw new Error("down"); } }));
});

test("entering asks the BFF and refreshes the token", async () => {
  const calls: [string, RequestInit][] = [];
  let refreshed = 0;
  const session = { getToken: async () => "jwt", unauthorized: async () => { refreshed += 1; return true; } };
  await enterWorkspace(session, (async (url: string, init: RequestInit) => { calls.push([url, init]); return Response.json({ account_id: 9 }); }) as typeof fetch, "/alpha-api", "a:9");
  assert.equal(calls[0][0], "/alpha-api/api/workspace/enter");
  assert.equal(calls[0][1].body, JSON.stringify({ key: "a:9" }));
  assert.equal(refreshed, 1);
  await assert.rejects(enterWorkspace(session, (async () => new Response(null, { status: 403 })) as unknown as typeof fetch, "/alpha-api", "a:9"));
});

test("the session sends its key; a mismatch enters again and retries once", async () => {
  const seen: (string | undefined)[] = [];
  let reentered = 0;
  const answers = [Response.json({ error: "workspace_context_mismatch" }, { status: 409 }), Response.json({ ok: true })];
  const send = sessionFetch(
    { getToken: async () => "jwt", unauthorized: async () => false, workspaceKey: () => "a:476", reenter: async () => { reentered += 1; return true; } },
    (async (_: string, init: RequestInit) => { seen.push((init.headers as Record<string, string>)["X-Danil-Workspace"]); return answers.shift(); }) as unknown as typeof fetch,
  );
  assert.equal((await send("/x")).status, 200);
  assert.deepEqual(seen, ["a:476", "a:476"]);
  assert.equal(reentered, 1);
});

test("without a key the request has no header, and another 409 is not retried", async () => {
  const seen: Record<string, string>[] = [];
  const send = sessionFetch(
    { getToken: async () => "jwt", unauthorized: async () => false, reenter: async () => { throw new Error("no"); } },
    (async (_: string, init: RequestInit) => { seen.push(init.headers as Record<string, string>); return Response.json({ error: "workspace_has_no_agents" }, { status: 409 }); }) as unknown as typeof fetch,
  );
  assert.equal((await send("/x")).status, 409);
  assert.equal(seen.length, 1);
  assert.equal("X-Danil-Workspace" in seen[0], false);
});
