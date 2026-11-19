import { FleetError } from "@terminus/fleet";
import { rememberWorkspaceSnapshot, setActiveWorkspaceContext } from "../../lib/workspace-context.ts";
import type { Invoke, RouterConfig } from "./router-config.ts";
import { scopedFleet } from "./scoped-fleet.ts";

type ContextInfo = { org: string; plan?: string | null };
export type ContextRouterConfig = RouterConfig & { contextInfo?: (context: string) => ContextInfo | null };
type Core = {
  handle: Invoke; events(machine: string, events: {name:string; payload:unknown}[], metadata?: EventMetadata): void;
  deferredChanged(machine:string):void; forget(machine:string):void; createsOn(workspace:string|null):{machine:string;lead:boolean}|null;
  activeWorkspace():string|null; close():void; unlisted():boolean; registryChanged():void; stateChanged(payload:unknown):void; copyChanged(payload:unknown):void;
};
type EventMetadata = { cursor?: number | null; runtime?: string; replay?: boolean; replayId?: string; gap?: boolean; resync?: boolean };
const HEADER = "x-danil-context";
function scopedAttention(value: unknown, context: string): unknown[] {
  return Array.isArray(value) ? value.map(row => row && typeof row === "object" ? { ...row, context } : row) : [];
}

/** La selección y todas las cachés viven en la ventana, separadas por identidad. */
export function createContextRouter(config: ContextRouterConfig, createRouterCore: (config: RouterConfig) => Core) {
  const legacy = createRouterCore({ ...config, fleet: scopedFleet(config.fleet, {}) });
  const contexts = new Map<string, Core>();
  let activeContext: string | undefined;
  let cleared = false;
  function core(context?: string): Core {
    if (!context) return legacy;
    const info = config.contextInfo?.(context);
    if (!info) throw new FleetError("unknown_machine", null);
    let router = contexts.get(context);
    if (!router) {
      const free = info.plan === "free";
      router = createRouterCore({ ...config,
        fleet: scopedFleet(config.fleet, { context, org: info.org, localOnly: free }),
        self: free ? config.self : null, native: free ? config.native : null,
        deliverRemote: config.native !== null,
        deliver: events => config.deliver?.(events.filter(event => event.name === "attention" || activeContext === context).map(event => event.name === "attention" ? { ...event, payload: scopedAttention(event.payload, context) } : event)),
        registry: undefined, engineWorkspaces: undefined,
      });
      contexts.set(context, router);
    }
    return router;
  }
  const handle: Invoke = async (command, args = {}, options) => {
    const headers = new Headers(options?.headers);
    const explicit = headers.has(HEADER);
    const selected = explicit ? headers.get(HEADER) || undefined : activeContext;
    const selectionCleared = cleared;
    headers.delete(HEADER);
    const clean = options?.headers ? { ...options, headers: Object.fromEntries(headers) } : options;
    if (/^danil_|^radiant_|^agents_session_/.test(command)) return legacy.handle(command, args, clean);
    if (command === "set_active_workspace" && args.id === null) {
      cleared = true; activeContext = undefined; setActiveWorkspaceContext(null); return null;
    }
    if (cleared && !["set_active_workspace", "list_workspaces", "workspaces_startup", "list_workspace_attention", "service_poll", "machine_list"].includes(command))
      throw new FleetError("unknown_machine", null);
    if (!explicit && command === "list_workspace_attention") {
      const ids = [...new Set(config.fleet.machines().map(machine => machine.context).filter((id): id is string => !!id))];
      const rows = await Promise.all([legacy.handle(command, args, clean).catch(() => []), ...ids.map(async context => scopedAttention(await core(context).handle(command, args, clean).catch(() => []), context))]);
      return rows.flat();
    }
    const router = !explicit && (command === "list_workspaces" || command === "workspaces_startup" || command === "service_poll" && config.native !== null) ? legacy : core(selected);
    const value = await router.handle(command, args, clean);
    if (command === "set_active_workspace") { cleared = false; activeContext = selected; setActiveWorkspaceContext(selected ?? null); }
    if ((command === "list_workspaces" || command === "workspaces_startup") && value && typeof value === "object") {
      const snapshot = selectionCleared ? { ...value, active: null } : router === legacy && selected ? { ...value, active: core(selected).activeWorkspace() } : value;
      return rememberWorkspaceSnapshot(snapshot, selectionCleared ? null : selected ?? null);
    }
    return value;
  };
  return { ...legacy, handle,
    events(machine: string, list: Parameters<Core["events"]>[1], metadata?: EventMetadata, context?: string) {
      if (!context || config.contextInfo?.(context)) core(context).events(machine, list, metadata);
    },
    deferredChanged(machine: string, context?: string) { if (!context || config.contextInfo?.(context)) core(context).deferredChanged(machine); },
    forget(machine: string, context?: string) { (context ? contexts.get(context) : legacy)?.forget(machine); },
    createsOn(workspace: string | null) { return core(activeContext).createsOn(workspace); },
    activeWorkspace: () => cleared ? null : core(activeContext).activeWorkspace(),
    activeContext: () => activeContext ?? null,
    close() { legacy.close(); for (const router of contexts.values()) router.close(); contexts.clear(); config.fleet.close(); },
  };
}

