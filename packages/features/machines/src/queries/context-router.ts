import { FleetError } from "@terminus/fleet";
import { rememberWorkspaceSnapshot, setActiveWorkspaceContext } from "../../../../../apps/desktop/src/lib/workspace-context.ts";
import { createContextAttention } from "./context-attention.ts";
import type { Invoke, RouterConfig } from "../model/router-config.ts";
import { scopedFleet } from "./scoped-fleet.ts";

type LocalListing = { workspaces?: { id?: unknown; account?: { org?: unknown } }[] };
type ContextInfo = { org: string; plan?: string | null };
export type ContextRouterConfig = RouterConfig & {
  contextInfo?: (context: string) => ContextInfo | null;
  readContextSpaces?: (context: string, organization: string, workspace: string) => ReturnType<NonNullable<RouterConfig["readWorkspaceSpaces"]>>;
};
type Core = {
  handle: Invoke; events(machine: string, events: {name:string; payload:unknown}[], metadata?: EventMetadata): void;
  deferredChanged(machine:string):void; forget(machine:string):void; createsOn(workspace:string|null):{machine:string;lead:boolean}|null;
  activeWorkspace():string|null; close():void; unlisted():boolean; registryChanged():void; stateChanged(payload:unknown):void; copyChanged(payload:unknown):void;
};
type EventMetadata = { cursor?: number | null; runtime?: string; replay?: boolean; replayId?: string; gap?: boolean; resync?: boolean };
const HEADER = "x-danil-context";

/** La selección y todas las cachés viven en la ventana, separadas por identidad. */
export function createContextRouter(config: ContextRouterConfig, createRouterCore: (config: RouterConfig) => Core) {
  const legacy = createRouterCore({ ...config, fleet: scopedFleet(config.fleet, {}) });
  const contexts = new Map<string, Core>();
  const placement = new Map<string, string>();
  let localWorkspaces = new Map<string, unknown>();
  const rememberLocal = (value: unknown) => {
    const { workspaces } = (value ?? {}) as LocalListing;
    if (Array.isArray(workspaces)) {
      localWorkspaces = new Map(workspaces.flatMap(row => typeof row?.id === "string" ? [[row.id, row.account?.org]] : []));
    }
  };
  const selectedWorkspaces = new Map<string, string>();
  const attention = createContextAttention(config.deliver);
  const isLocalChild = (machine: string, context?: string) => {
    if (context || config.native === null) return false;
    const row = config.fleet.info(machine);
    return row?.child === true && !row.host && !row.context;
  };
  const sourceMachine = (machine: string, context?: string) => {
    if (!context) return true;
    const info = config.contextInfo?.(context), row = config.fleet.info(machine, context);
    return !!info && info.plan !== "free" && row?.kind === "organization" && row.organizationId === info.org;
  };
  let activeContext: string | undefined;
  let cleared = false;
  function core(context?: string): Core {
    if (!context) return legacy;
    const info = config.contextInfo?.(context);
    if (!info) throw new FleetError("unknown_machine", null);
    let router = contexts.get(context);
    const fingerprint = JSON.stringify([info.org, info.plan === "free"]);
    if (router && placement.get(context) !== fingerprint) {
      const workspace = router.activeWorkspace();
      if (workspace) selectedWorkspaces.set(context, workspace);
      router.close(); contexts.delete(context); attention.forget(context); router = undefined;
    }
    if (!router) {
      const free = info.plan === "free";
      router = createRouterCore({ ...config,
        fleet: scopedFleet(config.fleet, { context, org: info.org, localOnly: free, includeLocalChildren: config.native !== null }),
        localWorkspace: !free && config.native ? workspace => localWorkspaces.get(workspace) === info.org : undefined,
        readWorkspaceSpaces: config.readContextSpaces && (workspace => config.readContextSpaces!(context, info.org, workspace)),
        deliverRemote: config.native !== null,
        deliver: events => config.deliver?.(events.filter(event => event.name === "attention" || activeContext === context).map(event => event.name === "attention" ? { ...event, payload: attention.project(event.payload, context) } : event)),
        registry: undefined, engineWorkspaces: undefined,
      });
      contexts.set(context, router); placement.set(context, fingerprint);
    }
    return router;
  }
  const currentWorkspace = () => {
    if (cleared || activeContext && !config.contextInfo?.(activeContext)) return null;
    const router = core(activeContext);
    return activeContext ? selectedWorkspaces.get(activeContext) ?? router.activeWorkspace() : router.activeWorkspace();
  };
  const handle: Invoke = async (command, args = {}, options) => {
    const headers = new Headers(options?.headers);
    const explicit = headers.has(HEADER);
    const selected = explicit ? headers.get(HEADER) || undefined : activeContext;
    const selectionCleared = cleared;
    headers.delete(HEADER);
    let clean = options?.headers ? { ...options, headers: Object.fromEntries(headers) } : options;
    if (/^danil_|^radiant_|^agents_session_/.test(command)) return legacy.handle(command, args, clean);
    if (command === "set_active_workspace" && args.id === null) {
      cleared = true; activeContext = undefined; setActiveWorkspaceContext(null); return null;
    }
    if (cleared && !["set_active_workspace", "list_workspaces", "workspaces_startup", "list_workspace_attention", "service_poll", "machine_list", "list_surfaces", "list_providers", "list_accounts", "list_git_hosts", "check_environment", "install_provider"].includes(command) && !headers.has("x-terminus-machine"))
      throw new FleetError("unknown_machine", null);
    if (!explicit && command === "list_workspace_attention") {
      const ids = [...new Set(config.fleet.machines().map(machine => machine.context).filter((id): id is string => !!id))];
      const rows = await Promise.all([legacy.handle(command, args, clean).catch(() => []), ...ids.map(async context => attention.project(await core(context).handle(command, args, clean).catch(() => attention.cached(context)), context))]);
      return rows.flat();
    }
    const router = !explicit && (command === "list_workspaces" || command === "workspaces_startup" || command === "service_poll" && config.native !== null) ? legacy : core(selected);
    const selectedWorkspace = selected && selectedWorkspaces.get(selected);
    if (selectedWorkspace && !headers.has("x-terminus-workspace") && !["set_active_workspace", "list_workspaces", "workspaces_startup"].includes(command)) {
      headers.set("x-terminus-workspace", selectedWorkspace); clean = { ...clean, headers: Object.fromEntries(headers) };
    }
    if (selected && typeof args.id === "string" && command === "set_active_workspace" && config.native && config.contextInfo?.(selected)?.plan !== "free") {
      await config.native("list_workspaces", {}).then(rememberLocal).catch(() => {});
    }
    const value = await router.handle(command, args, clean);
    if (command === "list_workspace_attention") return attention.project(value, selected);
    if (command === "set_active_workspace") { if (selected && typeof args.id === "string") selectedWorkspaces.set(selected, args.id); cleared = false; activeContext = selected; setActiveWorkspaceContext(selected ?? null); }
    if ((command === "list_workspaces" || command === "workspaces_startup") && value && typeof value === "object") {
      const snapshot = selectionCleared ? { ...value, active: null } : router === legacy && selected ? { ...value, active: selectedWorkspaces.get(selected) ?? core(selected).activeWorkspace() } : value;
      return rememberWorkspaceSnapshot(snapshot, selectionCleared ? null : selected ?? null);
    }
    return value;
  };
  return { ...legacy, handle,
    events(machine: string, list: Parameters<Core["events"]>[1], metadata?: EventMetadata, context?: string) {
      if (isLocalChild(machine, context) && activeContext && config.contextInfo?.(activeContext)) {
        core(activeContext).events(machine, list, metadata);
        return;
      }
      if (sourceMachine(machine, context)) core(context).events(machine, list, metadata);
    },
    attentionSuspended(machine: string, context?: string) { if (sourceMachine(machine, context)) attention.suspend(context); },
    attentionResumed(machine: string, context: string | undefined, value: unknown) {
      if (!sourceMachine(machine, context)) return;
      attention.resume(context);
      core(context).events(machine, [{ name: "attention", payload: config.fleet.encode(machine, value, "list_workspace_attention", context) }]);
    },
    deferredChanged(machine: string, context?: string) {
      if (isLocalChild(machine, context)) {
        legacy.deferredChanged(machine);
        for (const router of contexts.values()) router.deferredChanged(machine);
        return;
      }
      if (!context || config.contextInfo?.(context)) core(context).deferredChanged(machine);
    },
    forget(machine: string, context?: string) {
      if (isLocalChild(machine, context)) {
        legacy.forget(machine);
        for (const router of contexts.values()) router.forget(machine);
        return;
      }
      (context ? contexts.get(context) : legacy)?.forget(machine);
    },
    pruneContexts(valid: Iterable<string>) {
      const keep = new Set(valid);
      attention.prune(keep);
      for (const [context, router] of contexts) if (!keep.has(context)) { router.close(); contexts.delete(context); placement.delete(context); selectedWorkspaces.delete(context); attention.forget(context); }
    },
    createsOn(workspace: string | null) { return cleared || activeContext && !config.contextInfo?.(activeContext) ? null : core(activeContext).createsOn(workspace ?? (activeContext ? selectedWorkspaces.get(activeContext) ?? null : null)); },
    activeWorkspace: currentWorkspace,
    activeContext: () => activeContext ?? null,
    close() { activeContext = undefined; setActiveWorkspaceContext(null); attention.close(); legacy.close(); for (const router of contexts.values()) router.close(); contexts.clear(); placement.clear(); selectedWorkspaces.clear(); config.fleet.close(); },
  };
}

