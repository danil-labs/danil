import assert from "node:assert/strict";
import { test } from "node:test";
import { Fleet, type Link } from "@terminus/fleet";
import "../helpers/catalog.ts";
import { contextAttentionStale, createContextAttention } from "../../../../packages/features/machines/src/queries/context-attention.ts";
import { createContextRouter } from "../../../../packages/features/machines/src/queries/context-router.ts";
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
