import assert from "node:assert/strict";
import { test } from "node:test";
import { Fleet, type Link } from "@terminus/fleet";
import "../helpers/catalog.ts";
import { contextAttentionStale, createContextAttention } from "../../../../packages/features/machines/src/queries/context-attention.ts";
import { createContextRouter } from "../../../../packages/features/machines/src/queries/context-router.ts";
import { runsWorkspace } from "../../../../packages/features/machines/src/model/runs-workspace.ts";
import { createRouter } from "../../../../packages/features/machines/src/queries/router.ts";
import { scopedFleet } from "../../../../packages/features/machines/src/queries/scoped-fleet.ts";
import { activeWorkspaceContext, captureWorkspaceContext, displayWorkspaceContext, displayWorkspaceSnapshot, rememberWorkspaceSnapshot, requestedWorkspaceSnapshot, setActiveWorkspaceContext, setDisplayWorkspaceContext } from "../../src/lib/workspace-context.ts";

function setup(plans: Record<string, string> = {}, localOrg?: string, engineFeatures?: () => string[]) {
  const calls: { context: string; command: string; args: unknown; workspace: string | null }[] = [];
  const delivered: { name:string; payload:unknown }[] = [];
  const native: { command: string; args: unknown; options: unknown }[] = [];
  const fleet = new Fleet({ self: "local", connect(info) {
    return { state: () => "online", start() {}, close() {}, subscribe() {}, onState: () => () => {}, onEvents: () => () => {},
      async call(_id, command, workspace, _folder, args) {
        calls.push({ context: info.context ?? "", command, workspace, args });
        return { value: command === "list_workspaces" ? { workspaces: [{ id: "same", name: "Shared" }], active: "same" } : command === "send_message" ? `task-${info.context}` : command === "list_live_sessions" ? [{ id: "cloud-task" }] : [], cached: null };
      },
    } satisfies Link;
  } });
  fleet.setMachines(["a", "b"].map(context => ({ id: "vm", name: "Org", wakes: true, kind: "organization", organizationId: "org", context, linked: new Set(["same"]) })));
  for (const context of ["a", "b"]) fleet.setListing("vm", [{ id: "same", name: "Shared" }], context);
  const router = createRouter({ self: "local", fleet, contextInfo: context => context === "free" ? { org: "free-org", plan: "free" } : ["a", "b"].includes(context) ? { org: "org", plan: plans[context] ?? "teams" } : null,
    deliver: events => delivered.push(...events),
    engineFeatures,
    native: async (command, args, options) => {
      if (command === "list_workspaces") {
        native.push({ command, args, options });
        return { workspaces: [{ id: "local", name: "Local" }, ...(localOrg ? [{ id: "same", name: "Shared", account: { org: localOrg } }] : [])], active: "local" };
      }
      native.push({ command, args, options });
      if (command === "share_space") throw Error("unavailable");
      return command === "list_live_sessions" ? [{ id: "mac-task" }] : null;
    },
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
  native.splice(0, native.length, ...native.filter(call => call.command !== "list_workspaces"));
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
  assert.deepEqual(native.map(call=>call.command),["list_workspaces"]);
  assert.equal(calls.length,0);
  const list = await router.handle("list_workspaces") as {active:string|null;workspaces:{id:string}[]};
  assert.equal(list.active,null);
  assert.deepEqual(list.workspaces.map(row=>row.id),["local"]);
  await assert.rejects(router.handle("send_message",{text:"stale"}));
  assert.deepEqual(native.map(call=>call.command),["list_workspaces","list_workspaces"]);
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

test("Desk keeps local and cloud tasks in the same organization workspace", async () => {
  const { router, native, calls } = setup({}, "org");
  await router.handle("set_active_workspace", { id: "same" }, contextOptions("a"));
  await router.handle("list_live_sessions", { project: "" });
  for (let i = 0; i < 30 && !calls.some(call => call.command === "list_live_sessions"); i++) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  const rows = await router.handle("list_live_sessions", { project: "" }) as { id: string }[];
  assert.deepEqual(rows.map(row => row.id).sort(), ["mac-task", "vm~cloud-task"]);
  assert.equal(native.find(call => call.command === "list_live_sessions")?.command, "list_live_sessions");
  assert.ok(calls.some(call => call.command === "list_live_sessions" && call.workspace === "same"));
  router.close();
});

test("Desk excludes a local workspace with the same id in a different organization", async () => {
  const { router, native } = setup({}, "different-org");
  await router.handle("set_active_workspace", { id: "same" }, contextOptions("a"));
  const rows = await router.handle("list_live_sessions", { project: "" }) as { id: string }[];
  assert.deepEqual(rows.map(row => row.id), ["vm~cloud-task"]);
  await assert.rejects(router.handle("send_message", {}, contextOptions("a", "local")));
  assert.deepEqual(native.map(call => call.command), ["list_workspaces"]);
  router.close();
});

test("a task sent to another machine retains its selected space when legacy sharing fails", async () => {
  const { router, calls } = setup({}, "org");
  await router.handle("set_active_workspace", { id: "same" }, contextOptions("a"));
  assert.equal(await router.handle("send_message", { text: "New", space: "selected" }, contextOptions("a", "vm")), "vm~task-a");
  assert.equal((calls.find(call => call.command === "send_message")?.args as { space: string }).space, "selected");
  router.close();
});

test("Desk advertises its own engine capabilities in a scoped organization fleet", async () => {
  const { router } = setup({}, "org", () => ["task_lifecycle_v1"]);
  await router.handle("set_active_workspace", { id: "same" }, contextOptions("a"));
  const rows = await router.handle("machine_list") as { local: boolean; features?: string[] }[];
  assert.deepEqual(rows.find(row => row.local)?.features, ["task_lifecycle_v1"]);
  router.close();
});

test("shared workspace catalog orders spaces, unwraps remote task spaces, and ensures the target space before task creation", async () => {
  const calls: { command: string; args: unknown; workspace: string | null }[] = [];
  const nativeCalls: { command: string; args: unknown }[] = [];
  const catalog = {
    version: 3,
    spaces: [
      { id: "mac_s1", name: "Producto", folders: ["f1"] },
      { id: "cloud_s1", name: "Nube", folders: [] },
    ],
    order: ["cloud_s1", "mac_s1"],
    task_spaces: {},
  };
  const fleet = new Fleet({
    self: "local",
    connect() {
      return {
        state: () => "online", start() {}, close() {}, subscribe() {}, onState: () => () => {}, onEvents: () => () => {},
        async call(_id, command, workspace, _folder, args) {
          calls.push({ command, workspace, args });
          if (command === "list_spaces") return { value: [{ id: "cloud_s1", name: null, folders: [], created_at: 1, updated_at: 1, account: false }], cached: null };
          if (command === "list_live_sessions") return { value: [{ id: "cloud-task", space: "cloud_s1" }], cached: null };
          if (command === "send_message") return { value: "task-cloud", cached: null };
          return { value: null, cached: null };
        },
      } satisfies Link;
    },
  });
  fleet.setMachines([{
    id: "vm", name: "Cloud", wakes: true, kind: "organization", organizationId: "org", context: "a",
    linked: new Set(["same"]), features: ["workspace_space_catalog_v1"],
  }]);
  fleet.setListing("vm", [{ id: "same", name: "Shared" }], "a");
  const router = createRouter({
    self: "local",
    fleet,
    contextInfo: context => context === "a" ? { org: "org", plan: "teams" } : null,
    readContextSpaces: async (context, organization, workspace) =>
      context === "a" && organization === "org" && workspace === "same" ? catalog : null,
    native: async (command, args) => {
      nativeCalls.push({ command, args });
      if (command === "list_workspaces") return { workspaces: [{ id: "same", name: "Shared", account: { org: "org" } }], active: "same" };
      if (command === "list_spaces") return [{ id: "mac_s1", name: "Diseño", folders: ["f1"], created_at: 10, updated_at: 10, account: true }];
      if (command === "list_live_sessions") return [{ id: "mac-task", space: "mac_s1" }];
      if (command === "send_message") return "task-mac";
      return null;
    },
  });
  await router.handle("set_active_workspace", { id: "same" }, contextOptions("a"));
  const spaces = await router.handle("list_spaces") as { id: string; name: string | null; folders: string[] }[];
  assert.deepEqual(spaces.map(s => [s.id, s.name]), [["cloud_s1", "Nube"], ["mac_s1", "Producto"]]);
  assert.deepEqual(spaces.find(s => s.id === "mac_s1")?.folders, ["f1"]);

  // Remote task in cloud_s1 keeps bare space id (not vm~cloud_s1) because catalog marked cloud_s1 shared.
  await router.handle("list_live_sessions", { project: "" });
  for (let i = 0; i < 30 && !calls.some(call => call.command === "list_live_sessions"); i++) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  const sessions = await router.handle("list_live_sessions", { project: "" }) as { id: string; space?: string }[];
  assert.equal(sessions.find(row => row.id === "vm~cloud-task")?.space, "cloud_s1");

  // Creating on cloud in mac_s1 ensures mac_s1 on cloud first and sends bare space id.
  assert.equal(await router.handle("send_message", { text: "Cloud", space: "mac_s1" }, contextOptions("a", "vm")), "vm~task-cloud");
  const cloudEnsured = calls.find(call => call.command === "ensure_workspace_space");
  assert.deepEqual(cloudEnsured, { command: "ensure_workspace_space", workspace: "same", args: { id: "mac_s1", name: "Producto" } });
  assert.equal((calls.find(call => call.command === "send_message")?.args as { space: string }).space, "mac_s1");

  // Creating on local Mac in cloud_s1 ensures cloud_s1 on Mac first and sends bare space id.
  assert.equal(await router.handle("send_message", { text: "Local", space: "cloud_s1" }, contextOptions("a", "local")), "task-mac");
  const localEnsured = nativeCalls.find(call => call.command === "ensure_workspace_space");
  assert.deepEqual(localEnsured, { command: "ensure_workspace_space", args: { id: "cloud_s1", name: "Nube" } });
  assert.equal((nativeCalls.find(call => call.command === "send_message")?.args as { space: string }).space, "cloud_s1");
  router.close();
});

test("Web ensures a catalog space on a cloud VM even before engine features are reported", async () => {
  const calls: { command: string; args: unknown; workspace: string | null }[] = [];
  const catalog = {
    version: 1,
    spaces: [
      { id: "mac_s1", name: "Producto", folders: [] },
      { id: "cloud_s1", name: "Nube", folders: [] },
    ],
    order: ["mac_s1", "cloud_s1"],
    task_spaces: {},
  };
  const fleet = new Fleet({
    self: null,
    connect() {
      return {
        state: () => "online", start() {}, close() {}, subscribe() {}, onState: () => () => {}, onEvents: () => () => {},
        async call(_id, command, workspace, _folder, args) {
          calls.push({ command, workspace, args });
          if (command === "list_spaces") return { value: [{ id: "cloud_s1", name: null, folders: [], created_at: 1, updated_at: 1, account: false }], cached: null };
          if (command === "ensure_workspace_space") return { value: { id: "mac_s1", name: "Producto" }, cached: null };
          if (command === "send_message") return { value: "task-cloud", cached: null };
          return { value: null, cached: null };
        },
      } satisfies Link;
    },
  });
  fleet.setMachines([{
    id: "vm", name: "Cloud", wakes: true, kind: "organization", organizationId: "org", context: "a",
    linked: new Set(["same"]),
  }]);
  fleet.setListing("vm", [{ id: "same", name: "Shared" }], "a");
  const router = createRouter({
    self: null,
    native: null,
    fleet,
    contextInfo: context => context === "a" ? { org: "org", plan: "teams" } : null,
    readContextSpaces: async (context, organization, workspace) =>
      context === "a" && organization === "org" && workspace === "same" ? catalog : null,
  });
  await router.handle("set_active_workspace", { id: "same" }, contextOptions("a"));
  await router.handle("list_spaces");
  assert.equal(await router.handle("send_message", { text: "Hola", space: "mac_s1" }, contextOptions("a", "vm")), "vm~task-cloud");
  assert.deepEqual(calls.find(call => call.command === "ensure_workspace_space"), {
    command: "ensure_workspace_space",
    workspace: "same",
    args: { id: "mac_s1", name: "Producto" },
  });
  assert.equal((calls.find(call => call.command === "send_message")?.args as { space: unknown }).space, "mac_s1");
  router.close();
});

test("Web falls back to the VM default space when creating a task in a catalog space on an older VM, without rewriting moves", async () => {
  for (const mode of ["no_feature", "unknown_command"] as const) {
    const calls: { command: string; args: unknown; workspace: string | null }[] = [];
    const catalog = {
      version: 1,
      spaces: [
        { id: "mac_s1", name: "Producto", folders: [] },
        { id: "cloud_s1", name: "Nube", folders: [] },
      ],
      order: ["mac_s1", "cloud_s1"],
      task_spaces: {},
    };
    const fleet = new Fleet({
      self: null,
      connect() {
        return {
          state: () => "online", start() {}, close() {}, subscribe() {}, onState: () => () => {}, onEvents: () => () => {},
          async call(_id, command, workspace, _folder, args) {
            calls.push({ command, workspace, args });
            if (command === "list_spaces") return { value: [{ id: "cloud_s1", name: null, folders: [], created_at: 1, updated_at: 1, account: false }], cached: null };
            if (command === "ensure_workspace_space") {
              throw { code: "command_failed", detail: { what: { clave: "shell.service.command" }, detail: "ensure_workspace_space" } };
            }
            if (command === "send_message") {
              if ((args as { space?: unknown }).space === "mac_s1") {
                throw { code: "command_failed", detail: { what: { clave: "spaces.error.missing" }, detail: "mac_s1" } };
              }
              return { value: "task-cloud", cached: null };
            }
            if (command === "move_task_to_space") {
              if ((args as { space?: unknown }).space === "mac_s1") {
                throw { code: "command_failed", detail: { what: { clave: "spaces.error.missing" }, detail: "mac_s1" } };
              }
              return { value: null, cached: null };
            }
            return { value: null, cached: null };
          },
        } satisfies Link;
      },
    });
    fleet.setMachines([{
      id: "vm", name: "Cloud", wakes: true, kind: "organization", organizationId: "org", context: "a",
      linked: new Set(["same"]),
      ...(mode === "no_feature" ? { features: [] } : {}),
    }]);
    fleet.setListing("vm", [{ id: "same", name: "Shared" }], "a");
    const router = createRouter({
      self: null,
      native: null,
      fleet,
      contextInfo: context => context === "a" ? { org: "org", plan: "teams" } : null,
      readContextSpaces: async (context, organization, workspace) =>
        context === "a" && organization === "org" && workspace === "same" ? catalog : null,
    });
    await router.handle("set_active_workspace", { id: "same" }, contextOptions("a"));
    await router.handle("list_spaces");
    assert.equal(await router.handle("send_message", { text: "Hola", space: "mac_s1" }, contextOptions("a", "vm")), "vm~task-cloud");
    assert.equal((calls.find(call => call.command === "send_message")?.args as { space: unknown }).space, null);
    await assert.rejects(router.handle("move_task_to_space", { id: "vm~task-cloud", space: "mac_s1" }, contextOptions("a", "vm")));
    assert.equal((calls.find(call => call.command === "move_task_to_space")?.args as { space: unknown }).space, "mac_s1");
    router.close();
  }
});

test("Web retries task creation once with space null when a cold VM rejects with spaces.error.missing", async () => {
  const sentSpaces: unknown[] = [];
  const fleet = new Fleet({
    self: null,
    connect() {
      return {
        state: () => "online", start() {}, close() {}, subscribe() {}, onState: () => () => {}, onEvents: () => () => {},
        async call(_id, command, _workspace, _folder, args) {
          if (command === "send_message") {
            const space = (args as { space?: unknown }).space;
            sentSpaces.push(space);
            if (space === "mac_s1") {
              throw { code: "command_failed", detail: { what: { clave: "spaces.error.missing" }, detail: "mac_s1" } };
            }
            return { value: "task-cold", cached: null };
          }
          if (command === "move_task_to_space") {
            throw { code: "command_failed", detail: { what: { clave: "spaces.error.missing" }, detail: "mac_s1" } };
          }
          return { value: null, cached: null };
        },
      } satisfies Link;
    },
  });
  fleet.setMachines([{
    id: "vm", name: "Cloud", wakes: true, kind: "organization", organizationId: "org", context: "a",
    linked: new Set(["same"]), features: [],
  }]);
  fleet.setListing("vm", [{ id: "same", name: "Shared" }], "a");
  const router = createRouter({
    self: null,
    native: null,
    fleet,
    contextInfo: context => context === "a" ? { org: "org", plan: "teams" } : null,
  });
  await router.handle("set_active_workspace", { id: "same" }, contextOptions("a"));
  assert.equal(await router.handle("send_message", { text: "Cold", space: "mac_s1" }, contextOptions("a", "vm")), "vm~task-cold");
  assert.deepEqual(sentSpaces, ["mac_s1", null]);
  await assert.rejects(router.handle("move_task_to_space", { id: "vm~task-cold", space: "mac_s1" }, contextOptions("a", "vm")));
  router.close();
});

test("catalog spaces are authoritative without resurrecting deleted engine spaces or requiring online machines", async () => {
  const catalog = {
    version: 2,
    spaces: [
      { id: "sp_user1", name: "Personal", folders: ["p1"] },
    ],
    order: ["sp_user1"],
    task_spaces: {},
  };
  const fleet = new Fleet({
    self: null,
    connect() {
      return {
        state: () => "offline", start() {}, close() {}, subscribe() {}, onState: () => () => {}, onEvents: () => () => {},
        async call() {
          throw new Error("should not query offline machine when catalog has spaces");
        },
      } satisfies Link;
    },
  });
  const router = createRouter({
    self: null,
    native: null,
    fleet,
    contextInfo: context => context === "a" ? { org: "org", plan: "teams" } : null,
    readContextSpaces: async (context, organization, workspace) =>
      context === "a" && organization === "org" && workspace === "same" ? catalog : null,
  });
  await router.handle("set_active_workspace", { id: "same" }, contextOptions("a"));
  const spaces = await router.handle("list_spaces") as { id: string; name: string | null; folders: string[] }[];
  assert.deepEqual(spaces.map(s => ({ id: s.id, name: s.name, folders: s.folders })), [
    { id: "sp_user1", name: "Personal", folders: ["p1"] },
  ]);
  router.close();
});

test("Web ignores volatile machine_resources changes when comparing progressive list_workspaces slices", async () => {
  let measuredAt = 100;
  let workspaceName = "Danil Workspace";
  const changes: string[] = [];
  const fleet = new Fleet({
    self: null,
    connect() {
      return {
        state: () => "online", start() {}, close() {}, subscribe() {}, onState: () => () => {}, onEvents: () => () => {},
        async call(_id, command) {
          await new Promise((resolve) => setTimeout(resolve, 15));
          if (command === "list_workspaces") {
            return {
              value: {
                workspaces: [{ id: "same", name: workspaceName, logo: "/ws/logo.png" }],
                active: "same",
                machine_resources: { measured_at: ++measuredAt, storage: [] },
              },
              cached: null,
            };
          }
          return { value: null, cached: null };
        },
      } satisfies Link;
    },
  });
  fleet.setMachines([{ id: "vm", name: "Cloud", wakes: true, kind: "organization", organizationId: "org", context: "a", linked: new Set(["same"]) }]);
  const router = createRouter({
    self: null,
    native: null,
    fleet,
    contextInfo: (context) => (context === "a" ? { org: "org", plan: "teams" } : null),
    onSlices: (batch) => changes.push(...batch),
  });
  try {
    // Initial read seeds the cached slice.
    await router.handle("list_workspaces", {}, contextOptions("a"));
    await new Promise((resolve) => setTimeout(resolve, 260));
    changes.length = 0;

    // A progressive re-read where only machine_resources changes must not trigger onSlices("workspaces").
    await router.handle("list_workspaces", {}, contextOptions("a"));
    await new Promise((resolve) => setTimeout(resolve, 260));
    assert.deepEqual(changes, [], "volatile machine_resources must not trigger workspaces slice notifications");

    // A genuine workspace metadata change still announces a workspaces slice change.
    workspaceName = "Renamed Workspace";
    await router.handle("list_workspaces", {}, contextOptions("a"));
    await new Promise((resolve) => setTimeout(resolve, 260));
    assert.ok(changes.includes("workspaces"), "real workspace change must still announce workspaces slice");
  } finally {
    router.close();
  }
});


test("stopped wakeable cloud VM with unknown workspace listing stays pickable in machine_list and createsOn (Web and Desktop org)", async () => {
  const offlineLink = (): Link => ({
    state: () => "offline",
    start() {},
    close() {},
    subscribe() {},
    onState: () => () => {},
    onEvents: () => () => {},
    async call() {
      throw { code: "machine_off" };
    },
  });

  // Web mode (!local): Mac is online hosting "same"; Cloud VM is asleep (power=off, no listing yet).
  let picked: string | null = null;
  const webFleet = new Fleet({
    self: null,
    connect: (info) =>
      info.id === "mac"
        ? {
            state: () => "online", start() {}, close() {}, subscribe() {}, onState: () => () => {}, onEvents: () => () => {},
            async call(_id, command) {
              if (command === "list_workspaces") return { value: { workspaces: [{ id: "same", name: "Danil" }], active: "same" }, cached: null };
              return { value: null, cached: null };
            },
          }
        : offlineLink(),
  });
  webFleet.setMachines([
    { id: "mac", name: "Mac", wakes: false, kind: "personal", context: "a" },
    { id: "vm_cloud", name: "Nube Danil", wakes: true, kind: "organization", organizationId: "org", context: "a", linked: new Set(["same"]) },
    { id: "vm_other", name: "Otra Nube", wakes: true, kind: "organization", organizationId: "org", context: "a", linked: new Set(["other_ws"]) },
  ]);
  webFleet.setListing("mac", [{ id: "same", name: "Danil" }], "a");

  const webRouter = createRouter({
    self: null,
    native: null,
    fleet: webFleet,
    pickedFor: () => picked,
    contextInfo: (context) => (context === "a" ? { org: "org", plan: "teams" } : null),
  });
  try {
    await webRouter.handle("set_active_workspace", { id: "same" }, contextOptions("a"));
    const rows = (await webRouter.handle("machine_list", {}, contextOptions("a"))) as Array<{
      id: string; hosts: boolean | null; materializes?: boolean; refuses?: boolean; wakes: boolean; on: boolean;
    }>;
    const cloud = rows.find((r) => r.id === "vm_cloud");
    const other = rows.find((r) => r.id === "vm_other");
    assert.ok(cloud, "stopped wakeable org VM must appear in machine_list");
    assert.equal(cloud.hosts, null, "unknown listing while asleep must report hosts: null");
    assert.equal(cloud.refuses, false, "stopped wakeable VM linked to workspace must not be refused");
    assert.equal(runsWorkspace(cloud), true, "MachinePicker must offer the stopped wakeable VM");
    assert.ok(other && other.hosts === false && other.refuses === true && !runsWorkspace(other), "VM linked only to another workspace stays refused");

    picked = "vm_cloud";
    assert.equal(webRouter.createsOn("same")?.machine, "vm_cloud", "explicit pick of stopped wakeable VM is honored");

    // Even after listing only "other_ws" on disk, an authorized org VM stays eligible to materialize "same" lazily on demand.
    webFleet.setListing("vm_cloud", [{ id: "other_ws", name: "Other" }], "a");
    const afterListing = (await webRouter.handle("machine_list", {}, contextOptions("a"))) as Array<{
      id: string; hosts: boolean | null; materializes?: boolean; refuses?: boolean;
    }>;
    const cloudAfter = afterListing.find((r) => r.id === "vm_cloud");
    assert.ok(
      cloudAfter && cloudAfter.hosts === false && cloudAfter.materializes === true && cloudAfter.refuses === false && runsWorkspace(cloudAfter),
      "authorized org VM without workspace on disk yet stays eligible to materialize on demand",
    );
  } finally {
    webRouter.close();
  }

  // Web mode with NO online machine: stopped wakeable VM becomes default lead for createsOn; org-confined VM for another workspace stays refused.
  const soloFleet = new Fleet({ self: null, connect: () => offlineLink() });
  soloFleet.setMachines([
    { id: "vm_cloud", name: "Nube Danil", wakes: true, kind: "organization", organizationId: "org", context: "a", linked: new Set(["same"]) },
    { id: "vm_confined", name: "Otra Org", wakes: true, kind: "organization", organizationId: "org", context: "a", organization: { id: "org", workspaces: [{ id: "other_ws", name: "Other" }] } },
  ]);
  const soloRouter = createRouter({
    self: null,
    native: null,
    fleet: soloFleet,
    contextInfo: (context) => (context === "a" ? { org: "org", plan: "teams" } : null),
  });
  try {
    await soloRouter.handle("set_active_workspace", { id: "same" }, contextOptions("a"));
    assert.deepEqual(soloRouter.createsOn("same"), { machine: "vm_cloud", lead: true }, "stopped wakeable VM becomes default lead when no online machine lists workspace");
    const rows = (await soloRouter.handle("machine_list", {}, contextOptions("a"))) as Array<{
      id: string; hosts: boolean | null; refuses?: boolean;
    }>;
    const confined = rows.find((r) => r.id === "vm_confined");
    assert.ok(confined && confined.hosts === false && confined.refuses === true && !runsWorkspace(confined), "VM confined to another org workspace stays refused even with null linked");
  } finally {
    soloRouter.close();
  }

    // Desktop org mode (scopedLocal): local Mac hosts "same"; Cloud VM is asleep with unknown listing.
  let deskPicked: string | null = "vm_cloud";
  const deskFleet = new Fleet({ self: "local", connect: () => offlineLink() });
  deskFleet.setMachines([
    { id: "vm_cloud", name: "Nube Danil", wakes: true, kind: "organization", organizationId: "org", context: "a", linked: new Set(["same"]) },
  ]);
  const deskRouter = createRouter({
    self: "local",
    fleet: deskFleet,
    pickedFor: () => deskPicked,
    contextInfo: (context) => (context === "a" ? { org: "org", plan: "teams" } : null),
    native: async (command) => {
      if (command === "list_workspaces") {
        return { workspaces: [{ id: "same", name: "Danil", account: { org: "org" } }], active: "same" };
      }
      return null;
    },
  });
  try {
    await deskRouter.handle("list_workspaces", {});
    await deskRouter.handle("set_active_workspace", { id: "same" }, contextOptions("a"));
    const rows = (await deskRouter.handle("machine_list", {}, contextOptions("a"))) as Array<{
      id: string; hosts: boolean | null; materializes?: boolean; refuses?: boolean;
    }>;
    const cloud = rows.find((r) => r.id === "vm_cloud");
    assert.ok(cloud && cloud.hosts === null && cloud.refuses === false && runsWorkspace(cloud));
    assert.equal(deskRouter.createsOn("same")?.machine, "vm_cloud");
  } finally {
    deskRouter.close();
  }
});

test("online org VM serves catalog workspace not yet on disk and refreshes listing after write", async () => {
  const vmWorkspaces = [{ id: "v5463347", name: "Default" }];
  const calls: Array<{ machine: string; command: string; workspace: string | null }> = [];
  const fleet = new Fleet({
    self: null,
    connect: (machine) => {
      if (machine.id === "vm_cloud") {
        return {
          state: () => "online" as const,
          onState: () => () => {},
          onEvents: () => () => {},
          subscribe: () => {},
          start: () => {},
          close: () => {},
          async call(_id, command, workspace) {
            calls.push({ machine: machine.id, command, workspace });
            if (command === "list_workspaces") {
              return { value: { workspaces: [...vmWorkspaces], active: vmWorkspaces[0].id }, cached: null };
            }
            if (command === "list_live_sessions") {
              return { value: [], cached: null };
            }
            if (command === "send_message") {
              if (workspace && !vmWorkspaces.some((w) => w.id === workspace)) {
                vmWorkspaces.push({ id: workspace, name: workspace });
              }
              return { value: { session: "sess_1" }, cached: null };
            }
            return { value: null, cached: null };
          },
        };
      }
      return {
        state: () => "offline" as const,
        onState: () => () => {},
        onEvents: () => () => {},
        subscribe: () => {},
        start: () => {},
        close: () => {},
        async call() {
          throw new Error("offline");
        },
      };
    },
  });

  fleet.setMachines([
    { id: "vm_cloud", name: "Nube Mauricio", wakes: true, kind: "organization", organizationId: "org_danil", context: "ctx_danil" },
    { id: "vm_confined", name: "VM Confinada", wakes: true, kind: "organization", organizationId: "org_danil", context: "ctx_danil", linked: new Set(["other_only"]) },
    { id: "personal_other", name: "Laptop ajena", wakes: false, kind: "personal", context: "ctx_danil" },
  ]);
  fleet.setListing("vm_cloud", [{ id: "v5463347", name: "Default" }], "ctx_danil");
  fleet.setListing("vm_confined", [{ id: "other_only", name: "Otro" }], "ctx_danil");
  fleet.setListing("personal_other", [{ id: "other_only", name: "Otro" }], "ctx_danil");

  const router = createRouter({
    self: null,
    native: null,
    fleet,
    contextInfo: (context) => (context === "ctx_danil" ? { org: "org_danil", plan: "teams" } : null),
  });
  try {
    await router.handle("set_active_workspace", { id: "ehfp2mcg" }, contextOptions("ctx_danil"));

    // Eligible online org VM without "ehfp2mcg" on disk yet is offered and chosen as default lead;
    // confined org VM stays refused; personal machine is excluded by scopedFleet.
    const rows = (await router.handle("machine_list", {}, contextOptions("ctx_danil"))) as Array<{
      id: string; active: boolean; hosts: boolean | null; materializes?: boolean; refuses?: boolean;
    }>;
    const vm = rows.find((r) => r.id === "vm_cloud");
    const confined = rows.find((r) => r.id === "vm_confined");
    const personal = rows.find((r) => r.id === "personal_other");
    assert.ok(vm && vm.active === true && vm.hosts === false && vm.materializes === true && vm.refuses === false && runsWorkspace(vm));
    assert.ok(confined && confined.hosts === false && confined.materializes === false && confined.refuses === true && !runsWorkspace(confined));
    assert.equal(personal, undefined, "personal machine stays excluded from paid org scopedFleet");
    assert.deepEqual(router.createsOn("ehfp2mcg"), { machine: "vm_cloud", lead: true });

    // Reads fan out cleanly without creating folders on disk.
    const sessions = await router.handle("list_live_sessions", {}, contextOptions("ctx_danil"));
    assert.deepEqual(sessions, []);
    assert.ok(calls.some((c) => c.machine === "vm_cloud" && c.command === "list_live_sessions" && c.workspace === "ehfp2mcg"));

    // A write routes to vm_cloud, materializes lazily on the engine side, and triggers a list_workspaces refresh.
    await router.handle("send_message", { prompt: "hola" }, contextOptions("ctx_danil"));
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(calls.some((c) => c.machine === "vm_cloud" && c.command === "send_message" && c.workspace === "ehfp2mcg"));
    assert.ok(calls.some((c) => c.machine === "vm_cloud" && c.command === "list_workspaces"));

    const afterWrite = (await router.handle("machine_list", {}, contextOptions("ctx_danil"))) as Array<{
      id: string; hosts: boolean | null;
    }>;
    assert.equal(afterWrite.find((r) => r.id === "vm_cloud")?.hosts, true, "hosts flips to true once post-write list_workspaces refreshes");
  } finally {
    router.close();
  }
});

test("leadOf prioritizes online hosting machine over online lazy org VM over offline hosting machine", async () => {
  const connected = new Set(["vm_lazy", "mac_host"]);
  const fleet = new Fleet({
    self: null,
    connect: (machine) => ({
      state: () => (connected.has(machine.id) ? "online" : "offline"),
      onState: () => () => {},
      onEvents: () => () => {},
      subscribe: () => {},
      start: () => {},
      close: () => {},
      async call() {
        return { value: null, cached: null };
      },
    }),
  });
  fleet.setMachines([
    { id: "vm_sleep", name: "VM Dormida", wakes: true, kind: "organization", organizationId: "org_danil", context: "ctx_danil" },
    { id: "vm_lazy", name: "VM Viva", wakes: true, kind: "organization", organizationId: "org_danil", context: "ctx_danil" },
    { id: "mac_host", name: "Mac Con WS", wakes: false, kind: "organization", organizationId: "org_danil", context: "ctx_danil" },
  ]);
  fleet.setListing("vm_lazy", [{ id: "other_ws", name: "Otro" }], "ctx_danil");
  fleet.setListing("mac_host", [{ id: "ehfp2mcg", name: "Danil" }], "ctx_danil");

  const router = createRouter({
    self: null,
    native: null,
    fleet,
    contextInfo: (context) => (context === "ctx_danil" ? { org: "org_danil", plan: "teams" } : null),
  });
  try {
    await router.handle("set_active_workspace", { id: "ehfp2mcg" }, contextOptions("ctx_danil"));
    assert.deepEqual(router.createsOn("ehfp2mcg"), { machine: "mac_host", lead: true }, "online machine already hosting workspace wins over online lazy org VM");

    connected.delete("mac_host");
    assert.deepEqual(router.createsOn("ehfp2mcg"), { machine: "vm_lazy", lead: true }, "online lazy org VM wins over offline hosting machine and sleeping VM");

    connected.delete("vm_lazy");
    assert.deepEqual(router.createsOn("ehfp2mcg"), { machine: "mac_host", lead: true }, "offline hosting machine wins over offline non-hosting VMs");
  } finally {
    router.close();
  }
});

test("Desk paid-org list_workspaces and preview_file preserve local workspace logo before set_active_workspace and across remote context_root", async () => {
  const remoteCalls: { machine: string; command: string; workspace: string | null }[] = [];
  const nativeCalls: { command: string; args: unknown }[] = [];
  const fleet = new Fleet({
    self: "mac_local",
    connect: (machine) => ({
      state: () => "online",
      onState: () => () => {},
      onEvents: () => () => {},
      subscribe: () => {},
      start: () => {},
      close: () => {},
      async call(_id, command, workspace) {
        remoteCalls.push({ machine: machine.id, command, workspace });
        if (command === "list_workspaces") {
          return {
            value: {
              workspaces: [
                { id: "ws_danil", name: "Danil Workspace", logo: null, context_root: "vm_ctx" },
                { id: "ws_remote_logo", name: "Remote Logo WS", logo: "/vm/ws_remote_logo/logo.png", context_root: null },
              ],
              active: null,
            },
            cached: null,
          };
        }
        return { value: { data_url: null }, cached: null };
      },
    }),
  });
  fleet.setMachines([
    { id: "vm_cloud", name: "Cloud VM", wakes: true, kind: "organization", organizationId: "org_danil", context: "ctx_danil" },
  ]);
  fleet.setListing("vm_cloud", [{ id: "ws_danil", name: "Danil Workspace" }, { id: "ws_remote_logo", name: "Remote Logo WS" }], "ctx_danil");

  const router = createRouter({
    self: "mac_local",
    fleet,
    contextInfo: (context) => (context === "ctx_danil" ? { org: "org_danil", plan: "business" } : null),
    native: async (command, args) => {
      nativeCalls.push({ command, args });
      if (command === "list_workspaces") {
        return {
          workspaces: [
            { id: "ws_danil", name: "Danil Workspace", logo: "/Users/me/ws_danil/logo.png", context_root: null, account: { org: "org_danil" } },
            { id: "ws_remote_logo", name: "Remote Logo WS", logo: null, context_root: "local_ctx", account: { org: "org_danil" } },
            { id: "ws_other_org", name: "Other Org WS", logo: "/Users/me/ws_other_org/logo.png", context_root: null, account: { org: "org_other" } },
          ],
          active: "ws_danil",
        };
      }
      if (command === "preview_file") {
        return { data_url: "data:image/png;base64,LOCAL_LOGO" };
      }
      return null;
    },
  });

  try {
    // No set_active_workspace has run yet on ctx_danil (mirrors router install at boot / inactive org tiles).
    const listed = (await router.handle("list_workspaces", {}, contextOptions("ctx_danil"))) as {
      workspaces: Array<{ id: string; logo?: string | null }>;
    };
    const byId = new Map(listed.workspaces.map((w) => [w.id, w]));
    assert.equal(byId.get("ws_danil")?.logo, "/Users/me/ws_danil/logo.png", "local Mac logo must survive remote VM listing and remote context_root before set_active_workspace");
    assert.equal(byId.get("ws_remote_logo")?.logo, "vm_cloud~/vm/ws_remote_logo/logo.png", "remote logo must survive when local machine has no logo");
    assert.equal(byId.has("ws_other_org"), false, "workspaces from another org must remain excluded");

    // preview_file with explicit x-danil-context and x-terminus-workspace must read locally on Mac, not on vm_cloud.
    const preview = (await router.handle(
      "preview_file",
      { workspace: "ws_danil", path: "/Users/me/ws_danil/logo.png", rel: "/Users/me/ws_danil/logo.png" },
      { headers: { "x-danil-context": "ctx_danil", "x-terminus-workspace": "ws_danil" } },
    )) as { data_url: string | null };
    assert.equal(preview.data_url, "data:image/png;base64,LOCAL_LOGO");
    assert.ok(nativeCalls.some((c) => c.command === "preview_file"), "local workspace logo preview_file must hit native engine");
    assert.ok(!remoteCalls.some((c) => c.command === "preview_file"), "local workspace logo preview_file must not be sent to cloud VM");
  } finally {
    router.close();
  }
});

test("connected personal PC (hosted: false) without workspace on disk does not mask a stopped hosted org VM", async () => {
  const calls: Array<{ machine: string; command: string; workspace: string | null }> = [];
  const fleet = new Fleet({
    self: null,
    connect: (machine) => {
      if (machine.id === "mch_laptop") {
        return {
          state: () => "online" as const,
          onState: () => () => {},
          onEvents: () => () => {},
          subscribe: () => {},
          start: () => {},
          close: () => {},
          async call(_id, command, workspace) {
            calls.push({ machine: machine.id, command, workspace });
            if (command === "list_workspaces") return { value: { workspaces: [{ id: "5er4pkz3", name: "Personal" }], active: "5er4pkz3" }, cached: null };
            return { value: [], cached: null };
          },
        };
      }
      return {
        state: () => "stopped" as const,
        blocked: () => "machine_stopped" as const,
        onState: () => () => {},
        onEvents: () => () => {},
        subscribe: () => {},
        start: () => {},
        close: () => {},
        async call() {
          throw { code: "machine_stopped" };
        },
      };
    },
  });
  fleet.setMachines([
    { id: "mch_nube", name: "Nube", wakes: true, kind: "organization", hosted: true, organizationId: "org_danil", context: "ctx_danil" },
    { id: "mch_laptop", name: "LAPTOP_ASUS", wakes: false, kind: "organization", hosted: false, organizationId: "org_danil", context: "ctx_danil" },
  ]);
  fleet.setListing("mch_laptop", [{ id: "5er4pkz3", name: "Personal" }], "ctx_danil");

  const router = createRouter({
    self: null,
    native: null,
    fleet,
    contextInfo: (context) => (context === "ctx_danil" ? { org: "org_danil", plan: "enterprise" } : null),
  });
  try {
    await router.handle("set_active_workspace", { id: "fqgx1w8m" }, contextOptions("ctx_danil"));
    const rows = (await router.handle("machine_list", {}, contextOptions("ctx_danil"))) as Array<{
      id: string; active: boolean; hosts: boolean | null; materializes?: boolean; refuses?: boolean;
    }>;
    const nube = rows.find((r) => r.id === "mch_nube");
    const laptop = rows.find((r) => r.id === "mch_laptop");
    assert.ok(nube && nube.active === true && nube.materializes === true && nube.refuses === false, "stopped hosted org VM remains the active lead for fqgx1w8m");
    assert.ok(laptop && laptop.active === false && laptop.hosts === false && laptop.materializes === false && laptop.refuses === true, "connected personal PC without fqgx1w8m is refused instead of acting as catalog member");
    assert.deepEqual(router.createsOn("fqgx1w8m"), { machine: "mch_nube", lead: true });

    await assert.rejects(
      () => router.handle("list_live_sessions", { project: "", open: [] }, contextOptions("ctx_danil")),
      (err: { detail?: string }) => err.detail === "machine_off",
      "reading fqgx1w8m reports Nube machine_off instead of returning [] from LAPTOP_ASUS",
    );
    assert.equal(calls.some((c) => c.machine === "mch_laptop" && c.workspace === "fqgx1w8m"), false, "LAPTOP_ASUS is never queried for fqgx1w8m");
  } finally {
    router.close();
  }
});
