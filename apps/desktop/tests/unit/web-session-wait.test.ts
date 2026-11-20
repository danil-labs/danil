import assert from "node:assert/strict";
import test from "node:test";
import { PlatformSessionError } from "../../src/web/platform-session.ts";
import { awaitingWorkspace, readWorkspaces, retryWait, sessionExit, workspaceCache } from "../../src/web/session-wait.ts";

const memory = () => {
  const entries = new Map<string, string>();
  return { entries, get length() { return entries.size; }, key: (i: number) => [...entries.keys()][i] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => { entries.delete(key); } };
};

test("signing out during a retry cancels it and stays leaving until the logout answers", async () => {
  const log: string[] = [];
  let answer!: () => void;
  const exit = sessionExit({ closed: () => false, cancel: () => log.push("cancel"), logout: () => new Promise<void>((resolve) => { answer = resolve; }), signedOut: () => log.push("done"), unavailable: () => log.push("failed") });
  const leaving = exit.leave();
  assert.equal(exit.leaving(), true, "a late reply sees the exit in progress");
  void exit.leave();
  answer();
  await leaving;
  assert.deepEqual(log, ["cancel", "done"], "one cancel, one exit, even with two clicks");
  assert.equal(exit.leaving(), false);
});

test("a failed logout keeps the session and lets the person try again; a 401 counts as signed out", async () => {
  let calls = 0;
  let unavailable = 0;
  const exit = sessionExit({ closed: () => false, cancel: () => {}, logout: async () => { calls++; throw new Error("offline"); }, signedOut: () => assert.fail("not signed out"), unavailable: () => unavailable++ });
  await exit.leave();
  assert.equal(exit.leaving(), false);
  assert.equal(unavailable, 1);
  await exit.leave();
  assert.equal(calls, 2);
  let out = 0;
  const expired = sessionExit({ closed: () => false, cancel: () => {}, logout: async () => { throw new PlatformSessionError(401, null); }, signedOut: () => out++, unavailable: () => assert.fail("a 401 is not a failure") });
  await expired.leave();
  assert.equal(out, 1);
});

test("a closed or expired page does not sign out again", async () => {
  const exit = sessionExit({ closed: () => true, cancel: () => assert.fail("nothing to cancel"), logout: async () => assert.fail("no logout"), signedOut: () => {}, unavailable: () => {} });
  await exit.leave();
  assert.equal(exit.leaving(), false);
});

test("an empty or not-yet-contextual list does not block mounting, and a 401 still exits", async () => {
  const failed: unknown[] = [];
  assert.deepEqual(await readWorkspaces(async () => { throw new PlatformSessionError(503, null); }, ["kept"], (cause) => failed.push(cause)), ["kept"]);
  assert.equal(failed.length, 1);
  await assert.rejects(readWorkspaces(async () => { throw new PlatformSessionError(401, null); }, [], () => assert.fail("a 401 is not swallowed")), /401|Edge/);
});

test("Retry-After only lengthens the wait", () => {
  assert.equal(retryWait(new PlatformSessionError(503, "30"), 1000), 30_000);
  assert.equal(retryWait(new PlatformSessionError(503, "1"), 8000), 8000);
  assert.equal(retryWait(new Error("offline"), 4000), 4000);
});

test("the window waits for a workspace while identity has none or the list is still empty", () => {
  assert.equal(awaitingWorkspace(undefined, true, 0), false, "no profile yet: not mounted");
  assert.equal(awaitingWorkspace({ workspace: null }, false, 0), true);
  assert.equal(awaitingWorkspace({ workspace: null }, true, 1), false, "a listed workspace is ready to select");
  assert.equal(awaitingWorkspace({ workspace: "21" }, true, 0), true);
  assert.equal(awaitingWorkspace({ workspace: "21" }, false, 0), false, "without the workspaces route the list does not count");
  assert.equal(awaitingWorkspace({ workspace: "21" }, true, 1), false);
});

test("a workspace that arrives after mounting moves reads and writes out of «unselected»", () => {
  const store = memory();
  const cache = workspaceCache(store, "user_N", "unselected");
  cache.storage.setItem("tasks", "before");
  cache.rescope("21");
  assert.equal(cache.storage.getItem("tasks"), null, "the unselected entry is not read as the workspace");
  cache.storage.setItem("tasks", "after");
  assert.equal(store.getItem("danil.web.user_N.21.tasks"), "after");
  assert.equal(store.getItem("danil.web.user_N.unselected.tasks"), "before");
  cache.clear();
  cache.storage.setItem("tasks", "late");
  assert.deepEqual([...store.entries.keys()], [], "logout erases every workspace of the person and revokes late writes");
});
