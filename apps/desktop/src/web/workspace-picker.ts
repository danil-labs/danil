import { parsePreferences } from "../features/shell/workspace-added-sync.ts";
import { webAddedTransport } from "../features/shell/workspace-added-transport.ts";
import { z } from "zod";
import type { EdgeTransport } from "@terminus/computers";
import { listWorkspaces, type PlatformWorkspace } from "./platform-workspaces.ts";

const groups = z.object({
  items: z.array(z.object({ id: z.string().min(1), name: z.string() })),
  active_organization_id: z.string().nullable(),
});
const selected = z.object({ organization: z.object({ id: z.string() }) });
const resumeKey = "danil.web.add-workspace";
export type WorkspacePicker = ReturnType<typeof webWorkspacePicker>;

export function webWorkspacePicker(transport: EdgeTransport, options: {
  sub: string; store: Storage; reload: () => void; accountLoginUrl: string;
  select: (id: string) => Promise<void>; active: () => string | null;
}) {
  const preferences = webAddedTransport(transport);
  const organizations = async () => groups.parse(await (await transport.call("identity/organizations")).json());
  let intent: { org: string; key: string } | undefined;
  const catalog = async (org: string): Promise<PlatformWorkspace[]> => {
    const { items, active_organization_id: active } = await organizations();
    if (!items.some(group => group.id === org)) throw new Error("organization_not_available");
    if (active !== org) {
      if (intent?.org !== org) intent = { org, key: crypto.randomUUID() };
      const result = await transport.mutation("identity/organizations/select", {
        headers: { "Content-Type": "application/json", "Idempotency-Key": intent.key },
        body: JSON.stringify({ organization_id: org }),
      });
      if (selected.parse(await result.json()).organization.id !== org) throw new Error("organization_not_selected");
      options.store.setItem(resumeKey, JSON.stringify({ sub: options.sub, org }));
      options.reload();
      throw new Error("organization_changed");
    }
    return (await listWorkspaces(transport.call)).filter(row => row.org === org);
  };
  return {
    organizations, catalog, accountLoginUrl: options.accountLoginUrl,
    async pinned(org: string, rows: readonly PlatformWorkspace[]) {
      const reply = await preferences.get();
      if (reply.status !== 200) return [];
      const added = new Set(parsePreferences(reply.body)?.added);
      return rows.filter(row => row.org === org && row.engine_workspace_id && added.has(row.engine_workspace_id));
    },
    resume() {
      const raw = options.store.getItem(resumeKey);
      options.store.removeItem(resumeKey);
      if (!raw) return null;
      try {
        const value = JSON.parse(raw);
        return value?.sub === options.sub && typeof value.org === "string" ? value.org : null;
      } catch { return null; }
    },
    async add(org: string, id: string) {
      const current = await organizations();
      if (current.active_organization_id !== org || !current.items.some(group => group.id === org)) throw new Error("organization_changed");
      const row = (await listWorkspaces(transport.call)).find(item => item.id === id && item.org === org);
      if (!row?.engine_workspace_id) throw new Error("workspace_not_available");
      await options.select(row.id);
      if (options.active() !== row.id) throw new Error("workspace_not_selected");
      const reply = await preferences.put(row.engine_workspace_id);
      if (reply.status !== 204) throw new Error("workspace_preference_not_saved");
      options.reload();
    },
  };
}
