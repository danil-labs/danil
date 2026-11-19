import assert from "node:assert/strict";
import { test } from "node:test";
import { Fleet, type Link } from "@terminus/fleet";
import "../helpers/catalog.ts";
import { createRouter } from "../../src/features/machines/router.ts";
import { activeWorkspaceContext, captureWorkspaceContext, displayWorkspaceContext, displayWorkspaceSnapshot, rememberWorkspaceSnapshot, requestedWorkspaceSnapshot, setActiveWorkspaceContext, setDisplayWorkspaceContext } from "../../src/lib/workspace-context.ts";

function setup() {
  const calls: { context: string; command: string; args: unknown; workspace: string | null }[] = [];
  const delivered: { name:string; payload:unknown }[] = [];
  const native: { command: string; args: unknown; options: unknown }[] = [];
  const fleet = new Fleet({ self: "local", connect(info) {
    return { state: () => "online", start() {}, close() {}, subscribe() {}, onState: () => () => {}, onEvents: () => () => {},
      async call(_id, command, workspace, _folder, args) {
        calls.push({ context: info.context ?? "", command, workspace, args });
        return { value: command === "list_workspaces" ? { workspaces: [{ id: "same", name: "Shared" }], active: "same" } : command === "send_message" ? `task-${info.context}` : [], cached: null };
      },
    } satisfies Link;
  } });
  fleet.setMachines(["a", "b"].map(context => ({ id: "vm", name: "Org", wakes: true, kind: "organization", organizationId: "org", context, linked: new Set(["same"]) })));
  for (const context of ["a", "b"]) fleet.setListing("vm", [{ id: "same", name: "Shared" }], context);
  const router = createRouter({ self: "local", fleet, contextInfo: context => context === "free" ? { org: "free-org", plan: "free" } : ["a", "b"].includes(context) ? { org: "org", plan: "teams" } : null,
    deliver: events => delivered.push(...events),
    native: async (command, args, options) => { native.push({ command, args, options }); return command === "list_workspaces" ? { workspaces: [{ id: "local", name: "Local" }], active: "local" } : null; },
  });
  return { router, fleet, calls, native, delivered };
}
const contextOptions = (context: string, machine?: string) => ({ headers: { "x-danil-context": context, ...(machine ? { "x-terminus-machine": machine } : {}) } });

test("same physical machine and workspace route reads and actions through the selected context", async () => {
  const { router, calls, native } = setup();
  await router.handle("set_active_workspace", { id: "same" }, contextOptions("a"));
  assert.equal(await router.handle("send_message", { text: "A" }), "vm~task-a");
  await router.handle("list_workspaces", {}, contextOptions("b", "vm"));
  await router.handle("set_active_workspace", { id: "same" }, contextOptions("b"));
  assert.equal(await router.handle("send_message", { text: "B" }), "vm~task-b");
  assert.deepEqual(calls.filter(call => call.command === "send_message").map(call => [call.context, call.workspace]), [["a", "same"], ["b", "same"]]);
  assert.equal(router.activeContext(), "b");
  assert.equal(native.length, 0);
  await router.handle("set_active_workspace", { id: "local" }, contextOptions(""));
  assert.deepEqual(native[0], { command: "set_active_workspace", args: { id: "local" }, options: { headers: {} } });
  router.close();
});

test("legacy list stays native and never reads another context's machines", async () => {
  const { router, calls } = setup();
  const value = await router.handle("list_workspaces") as { workspaces: { id: string }[] };
  assert.deepEqual(value.workspaces.map(row => row.id), ["local"]);
  assert.equal(calls.length, 0);
  await assert.rejects(router.handle("send_message", {}, contextOptions("missing")));
  router.close();
});

test("attention events preserve context and an empty snapshot clears only its own prior rows", () => {
  const {router,delivered}=setup();
  router.events("vm", [{name:"attention",payload:[{workspace:"same",tasks:[{session:"a",state:"asked"}]}]}], undefined, "a");
  router.events("vm", [{name:"attention",payload:[{workspace:"same",tasks:[{session:"b",state:"failed"}]}]}], undefined, "b");
  router.events("vm", [{name:"attention",payload:[]}], undefined, "a");
  assert.deepEqual(delivered.map(event => event.payload), [
    [{workspace:"same",tasks:[{session:"a",state:"asked"}],context:"a"}],
    [{workspace:"same",tasks:[{session:"b",state:"failed"}],context:"b"}],
    [{workspace:"same",tasks:[],context:"a"}],
  ]);
  router.close();
});

test("captured task options retain their context after the active organization changes", () => {
  setActiveWorkspaceContext("a"); setDisplayWorkspaceContext("a");
  const captured = captureWorkspaceContext({headers:{"x-terminus-workspace":"same"}});
  setActiveWorkspaceContext("b");
  assert.equal(captured.headers["x-danil-context"], "a");
  assert.equal(activeWorkspaceContext(), "b");
  assert.equal(captureWorkspaceContext({headers:{"x-danil-context":"a"}}).headers["x-danil-context"], "a");
  setActiveWorkspaceContext(null);
});

test("a Free context executes only on this computer", async () => {
  const {router,calls,native}=setup();
  await router.handle("set_active_workspace",{id:"same"},contextOptions("free"));
  await router.handle("send_message",{text:"local"});
  assert.deepEqual(native.map(call=>call.command),["set_active_workspace","send_message"]);
  assert.equal(calls.length,0);
  router.close();
});

test("pending Startup keeps displayed task context until its exact snapshot is applied", () => {
  setActiveWorkspaceContext("a"); setDisplayWorkspaceContext("a");
  const old = rememberWorkspaceSnapshot({active:"same"},"a");
  setActiveWorkspaceContext("b");
  assert.equal(captureWorkspaceContext().headers["x-danil-context"],"a");
  assert.equal(requestedWorkspaceSnapshot(old),false);
  const next = rememberWorkspaceSnapshot({active:"same"},"b");
  assert.equal(requestedWorkspaceSnapshot(next),true);
  assert.equal(displayWorkspaceContext(),"a");
  displayWorkspaceSnapshot(next);
  assert.equal(captureWorkspaceContext().headers["x-danil-context"],"b");
  setActiveWorkspaceContext(null);setDisplayWorkspaceContext(null);
});

test("clearing the last active context changes only the window and suppresses implicit reopening", async () => {
  const {router,native,calls}=setup();
  await router.handle("set_active_workspace",{id:"same"},contextOptions("a"));
  await router.handle("set_active_workspace",{id:null},contextOptions(""));
  assert.equal(router.activeWorkspace(),null);
  assert.equal(router.activeContext(),null);
  assert.equal(native.length,0);
  assert.equal(calls.length,0);
  const list = await router.handle("list_workspaces") as {active:string|null;workspaces:{id:string}[]};
  assert.equal(list.active,null);
  assert.deepEqual(list.workspaces.map(row=>row.id),["local"]);
  await assert.rejects(router.handle("send_message",{text:"stale"}));
  assert.deepEqual(native.map(call=>call.command),["list_workspaces"]);
  await router.handle("set_active_workspace",{id:"local"},contextOptions(""));
  assert.equal(router.activeWorkspace(),"local");
  const restored = await router.handle("list_workspaces") as {active:string|null};
  assert.equal(restored.active,"local");
  router.close();
});
