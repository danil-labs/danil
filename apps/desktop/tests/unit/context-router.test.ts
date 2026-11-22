import assert from "node:assert/strict";
import { test } from "node:test";
import { Fleet, type Link } from "@terminus/fleet";
import "../helpers/catalog.ts";
import { contextAttentionStale, createContextAttention } from "../../../../packages/features/machines/src/queries/context-attention.ts";
import { createContextRouter } from "../../../../packages/features/machines/src/queries/context-router.ts";
import { createRouter } from "../../../../packages/features/machines/src/queries/router.ts";
import { scopedFleet } from "../../../../packages/features/machines/src/queries/scoped-fleet.ts";
import { activeWorkspaceContext, captureWorkspaceContext, displayWorkspaceContext, displayWorkspaceSnapshot, rememberWorkspaceSnapshot, requestedWorkspaceSnapshot, setActiveWorkspaceContext, setDisplayWorkspaceContext } from "../../src/lib/workspace-context.ts";

function setup(plans: Record<string, string> = {}) {
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
  const router = createRouter({ self: "local", fleet, contextInfo: context => context === "free" ? { org: "free-org", plan: "free" } : context === "pro-personal" ? { org: "mine-org", plan: "pro", personal: true } : ["a", "b"].includes(context) ? { org: "org", plan: plans[context] ?? "teams" } : null,
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
    [{workspace:"same",tasks:[{session:"a",state:"asked"}],context:"a",stale:false}],
    [{workspace:"same",tasks:[{session:"b",state:"failed"}],context:"b",stale:false}],
    [{workspace:"same",tasks:[],context:"a",stale:false}],
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

test("a personal context upgraded to Pro still executes only on this computer", async () => {
  const {router,calls,native}=setup();
  await router.handle("set_active_workspace",{id:"same"},contextOptions("pro-personal"));
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

test("evicted relay retains stale attention and refreshing its snapshot preserves the other context", () => {
  const {router,delivered}=setup();
  router.events("vm",[{name:"attention",payload:[{workspace:"same",tasks:[{session:"a",state:"asked"}]}]}],undefined,"a");
  router.events("vm",[{name:"attention",payload:[{workspace:"same",tasks:[{session:"b",state:"failed"}]}]}],undefined,"b");
  router.attentionSuspended("vm","a");
  assert.deepEqual(delivered.at(-1)?.payload,[{workspace:"same",tasks:[{session:"a",state:"asked"}],context:"a",stale:true}]);
  router.attentionResumed("vm","a",[]);
  assert.deepEqual(delivered.at(-1)?.payload,[{workspace:"same",tasks:[],context:"a",stale:false}]);
  assert.equal(delivered.filter(event=>(event.payload as {context:string}[])[0]?.context==="b").length,1);
  router.close();
});

test("closing attention ownership clears a suspended context that never had rows", () => {
  const attention = createContextAttention();
  attention.suspend("no-rows");
  assert.equal(contextAttentionStale("no-rows"),true);
  attention.close();
  assert.equal(contextAttentionStale("no-rows"),false);
});

test("a new attention reader starts fresh while its own suspension remains stale", () => {
  const old = createContextAttention();
  old.suspend("reused");
  const next = createContextAttention();
  assert.deepEqual(next.project([{workspace:"w",tasks:[]}],"reused"),[{workspace:"w",tasks:[],context:"reused",stale:false}]);
  next.suspend("reused");
  assert.deepEqual(next.project([{workspace:"w",tasks:[]}],"reused"),[{workspace:"w",tasks:[],context:"reused",stale:true}]);
  next.resume("reused");
  assert.equal(contextAttentionStale("reused"),false);
  next.close();old.close();
});

test("pruning a retired context discards its router cache and preserves the other router", async () => {
  const valid = new Set(["a","b"]);
  const instances: {active:string|null;closed:boolean}[]=[];
  const fleet = new Fleet({connect:()=>({}) as never});
  const router = createContextRouter({self:null,native:null,fleet,contextInfo:context=>valid.has(context)?{org:"org",plan:"teams"}:null},()=>{
    const state={active:null as string|null,closed:false};instances.push(state);
    return { async handle(command,args){if(command==="set_active_workspace") state.active=args?.id as string;return null;},
      activeWorkspace:()=>state.active,createsOn:()=>({machine:"vm",lead:true}),events(){},deferredChanged(){},forget(){},close(){state.closed=true;},unlisted:()=>false,registryChanged(){},stateChanged(){},copyChanged(){},
    };
  });
  await router.handle("set_active_workspace",{id:"same"},contextOptions("a"));
  await router.handle("set_active_workspace",{id:"other"},contextOptions("b"));
  await router.handle("set_active_workspace",{id:"same"},contextOptions("a"));
  assert.equal(instances.length,3);
  router.attentionSuspended("vm","a");router.attentionSuspended("vm","never-read");
  valid.delete("a");router.pruneContexts(valid);
  assert.equal(contextAttentionStale("a"),false);assert.equal(contextAttentionStale("never-read"),false);
  assert.equal(instances[1].closed,true);assert.equal(instances[2].closed,false);
  assert.equal(router.activeWorkspace(),null);assert.equal(router.createsOn("same"),null);
  await assert.rejects(router.handle("send_message",{},contextOptions("a")));
  valid.add("a");
  assert.equal(router.activeWorkspace(),null);assert.equal(instances.length,4);
  assert.equal(instances[2].active,"other");
  router.close();
});

test("a paid scoped fleet excludes personal copies from membership, metadata, events and resync", () => {
  const {router,fleet,delivered}=setup();
  fleet.setMachines([...fleet.machines(),{id:"personal",name:"Copy",wakes:false,context:"a",kind:"personal",organizationId:"org",organization:{id:"org",workspaces:[{id:"same",name:"Shared"}]}},
    {id:"alien",name:"Other org",wakes:true,context:"a",kind:"organization",organizationId:"other",organization:{id:"other",workspaces:[{id:"same",name:"Shared"}]}}]);
  fleet.setListing("personal",[{id:"same",name:"Shared"}],"a");
  const source=scopedFleet(fleet,{context:"a",org:"org"});
  assert.equal(source.has("personal"),false);assert.equal(source.info("personal"),undefined);
  assert.equal(source.has("alien"),false);assert.equal(source.info("alien"),undefined);
  assert.deepEqual(source.membersOf("same"),["vm"]);assert.equal(source.leadOf("same"),"vm");
  assert.deepEqual([...source.remotes()],["vm"]);
  assert.deepEqual(scopedFleet(fleet,{context:"a",org:"org",localOnly:true}).membersOf("same"),[]);
  router.events("vm",[{name:"attention",payload:[{workspace:"same",tasks:[{session:"org-task",state:"asked"}]}]}],undefined,"a");
  router.attentionSuspended("vm","a");
  const count=delivered.length;
  router.events("personal",[{name:"attention",payload:[{workspace:"same",tasks:[{session:"private-task",state:"failed"}]}]}],undefined,"a");
  router.attentionSuspended("personal","a");router.attentionResumed("personal","a",[]);
  router.attentionResumed("alien","a",[]);
  assert.equal(delivered.length,count);assert.equal(contextAttentionStale("a"),true);
  assert.deepEqual(delivered.at(-1)?.payload,[{workspace:"same",tasks:[{session:"org-task",state:"asked"}],context:"a",stale:true}]);
  router.attentionResumed("vm","a",[]);
  assert.equal(contextAttentionStale("a"),false);
  router.close();
});

test("changing placement for the same context rebuilds its route without migrating data", async () => {
  const plans={a:"free"};
  const {router,calls,native}=setup(plans);
  await router.handle("set_active_workspace",{id:"same"},contextOptions("a"));
  assert.equal(native.length,1);
  plans.a="teams";
  assert.equal(await router.handle("send_message",{text:"paid"}),"vm~task-a");
  assert.equal(native.length,1);
  assert.deepEqual(calls.filter(call=>call.command==="send_message").map(call=>[call.context,call.workspace]),[["a","same"]]);
  assert.equal(router.activeWorkspace(),"same");
  plans.a="free";
  await router.handle("send_message",{text:"local"});
  assert.deepEqual(native.map(call=>call.command),["set_active_workspace","send_message"]);
  assert.equal(calls.filter(call=>call.command==="send_message").length,1);
  assert.equal(router.activeWorkspace(),"same");
  router.close();
});

test("closing the router forgets the window's active context so a reinstalled fleet starts without it", async () => {
  const { router } = setup();
  await router.handle("set_active_workspace", { id: "same" }, contextOptions("a"));
  assert.equal(activeWorkspaceContext(), "a");
  router.close();
  assert.equal(activeWorkspaceContext(), null);
  const next = setup().router;
  assert.equal(next.activeContext(), null);
  assert.equal(activeWorkspaceContext(), null);
  next.close();
});
