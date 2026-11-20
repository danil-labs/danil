import { z } from "zod";
import type { EdgeTransport } from "@terminus/computers";
import { parsePreferences } from "../features/shell/workspace-added-sync.ts";
import { webAddedTransport } from "../features/shell/workspace-added-transport.ts";
import { workspaceId } from "./platform-workspaces.ts";

const id = z.string().min(1);
const workspace = z.object({ account_id: workspaceId, engine_workspace_id: id.nullish(), name: id });
const context = z.object({ context_id: id, org: id, org_name: z.string().nullish(), workspaces: workspace.array().nullable() });
const family = z.object({ session_id: id, sub: id, email: z.string().nullish(), contexts: context.array() });
const directory = z.object({ version: z.literal(1), items: family.array() });
const resumeKey = "danil.web.resume-add-workspace";
export type PickerRow = z.infer<typeof workspace> & { context: string; session: string; sub: string; org: string; organization: string; email: string };
export type WorkspacePicker = ReturnType<typeof webWorkspacePicker>;

function scoped(transport: EdgeTransport, row: PickerRow): EdgeTransport {
  const send = async (method: keyof EdgeTransport, path: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("X-Danil-Session", row.context);
    const response = await transport[method](path, { ...init, headers });
    if (response.headers.get("X-Danil-Session-Applied") !== row.context || response.headers.get("X-Danil-Session-Applied-Org") !== row.org)
      throw new Error("session_echo_mismatch");
    return response;
  };
  return { call: (path, init) => send("call", path, init), mutation: (path, init) => send("mutation", path, init) };
}

export function webWorkspacePicker(transport: EdgeTransport, options: { store: Storage; connect: () => Promise<void> }) {
  const subscribers = new Set<() => void>();
  async function catalog() {
    const body = directory.parse(await (await transport.call("identity/sessions/catalog")).json());
    const rows: PickerRow[] = [];
    const seen = new Set<string>();
    let partial = false;
    for (const f of body.items) for (const c of f.contexts) {
      if (seen.has(c.context_id)) throw new Error("ambiguous_catalog_context");
      seen.add(c.context_id);
      if (!c.workspaces) { partial = true; continue; }
      for (const w of c.workspaces) rows.push({ ...w, context: c.context_id, session: f.session_id, sub: f.sub, org: c.org, organization: c.org_name && c.org_name !== c.org ? c.org_name : "", email: f.email ?? "" });
    }
    return { rows, partial };
  }
  async function admitted(chosen: PickerRow) {
    const { rows } = await catalog();
    const row = rows.find(w => w.session === chosen.session && w.context === chosen.context && w.sub === chosen.sub && w.org === chosen.org && w.account_id === chosen.account_id && w.engine_workspace_id === chosen.engine_workspace_id);
    if (!row?.engine_workspace_id) throw new Error("workspace_not_available");
    return row;
  }
  return {
    catalog,
    async connect() {
      options.store.setItem(resumeKey, "1");
      try { await options.connect(); } catch (error) { options.store.removeItem(resumeKey); throw error; }
    },
    resume() {
      const resume = options.store.getItem(resumeKey) === "1";
      if (resume) options.store.removeItem(resumeKey);
      return resume;
    },
    subscribe(fn: () => void) { subscribers.add(fn); return () => { subscribers.delete(fn); }; },
    async pinned() {
      const { rows } = await catalog();
      const groups = new Map<string, PickerRow[]>();
      for (const row of rows) {
        const group = groups.get(row.context);
        if (group) group.push(row); else groups.set(row.context, [row]);
      }
      return (await Promise.all([...groups.values()].map(async group => {
        const prefs = await webAddedTransport(scoped(transport, group[0])).get().catch(() => null);
        if (!prefs) return [];
        const added = new Set(prefs.status === 200 ? parsePreferences(prefs.body)?.added : []);
        return group.filter(row => row.engine_workspace_id && added.has(row.engine_workspace_id));
      }))).flat();
    },
    async add(chosen: PickerRow) {
      const row = await admitted(chosen);
      const result = await webAddedTransport(scoped(transport, row)).put(row.engine_workspace_id!);
      if (result.status !== 204) throw new Error("workspace_preference_not_saved");
      for (const fn of subscribers) fn();
    },
  };
}

export function distinguish(rows: readonly PickerRow[], row: PickerRow) {
  const same = rows.filter(w => w.name === row.name);
  if (same.length < 2) return "";
  const labels = new Set(same.map(w => w.organization));
  if (row.organization && same.filter(w => w.organization === row.organization).length === 1) return row.organization;
  return [labels.size > 1 ? row.organization : "", row.email].filter(Boolean).join(" · ");
}
