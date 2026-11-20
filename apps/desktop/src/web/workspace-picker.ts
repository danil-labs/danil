import { z } from "zod";
import type { EdgeTransport } from "@terminus/computers";
import { parsePreferences } from "../features/shell/workspace-added-sync.ts";
import { webAddedTransport } from "../features/shell/workspace-added-transport.ts";
import { workspace as platformWorkspace, workspaceId } from "./platform-workspaces.ts";

const id = z.string().min(1);
const workspace = z.object({ account_id: workspaceId, engine_workspace_id: id.nullish(), name: id });
const catalogState = z.enum(["listed", "empty", "unavailable"]);
/**
 * Una organización tal como la devuelve el catálogo de identity (plan modelo Slack § 20).
 * `context_id: null` + `admission_required: true` es una membresía activa que todavía no tiene
 * contexto en este conjunto: se muestra y se admite solo esa. `catalog_state` distingue una
 * lista disponible (`listed`), un vacío confirmado (`empty`) y una comprobación fallida
 * (`unavailable`); en los dos últimos casos `workspaces` es null y no se inventa una lista.
 */
const context = z.object({
  context_id: id.nullish(),
  org: id,
  org_name: z.string().nullish(),
  workspaces: workspace.array().nullable(),
  admission_required: z.boolean().optional(),
  catalog_state: catalogState.optional(),
});
const family = z.object({ session_id: id, sub: id, email: z.string().nullish(), contexts: context.array() });
const directory = z.object({ version: z.literal(1), items: family.array() });
const resumeKey = "danil.web.resume-add-workspace";
export type PickerRow = z.infer<typeof workspace> & { context: string; session: string; sub: string; org: string; organization: string; email: string };
/** Una organización del catálogo; sin contexto, `admission_required` pide admitirla antes. */
export type PickerOrg = {
  session: string;
  sub: string;
  email: string;
  org: string;
  organization: string;
  context: string | null;
  admission_required: boolean;
  catalog_state: "listed" | "empty" | "unavailable";
};
export type WorkspacePicker = ReturnType<typeof webWorkspacePicker>;

function scoped(transport: EdgeTransport, row: Pick<PickerRow, "context" | "org">): EdgeTransport {
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

function organizationName(org: string, name: string | null | undefined) {
  return name && name !== org ? name : "";
}

export function webWorkspacePicker(transport: EdgeTransport, options: { store: Storage; connect?: () => Promise<void>; selected?: (row: PickerRow) => void; signIn?: (organization: string) => void }) {
  const subscribers = new Set<() => void>();
  async function catalog() {
    const body = directory.parse(await (await transport.call("identity/sessions/catalog")).json());
    const rows: PickerRow[] = [];
    const organizations: PickerOrg[] = [];
    const seen = new Set<string>();
    let partial = false;
    for (const f of body.items) for (const c of f.contexts) {
      const admission = c.admission_required === true || !c.context_id;
      // Una organización sin contexto se muestra una vez; su lista se conoce tras admitirla.
      if (c.context_id) {
        if (seen.has(c.context_id)) throw new Error("ambiguous_catalog_context");
        seen.add(c.context_id);
      }
      const state = c.catalog_state ?? (c.workspaces ? "listed" : "unavailable");
      organizations.push({
        session: f.session_id, sub: f.sub, email: f.email ?? "", org: c.org,
        organization: organizationName(c.org, c.org_name), context: c.context_id ?? null,
        admission_required: admission, catalog_state: state,
      });
      if (admission || !c.context_id) continue;
      if (!c.workspaces) { partial = true; continue; }
      for (const w of c.workspaces) rows.push({ ...w, context: c.context_id, session: f.session_id, sub: f.sub, org: c.org, organization: organizationName(c.org, c.org_name), email: f.email ?? "" });
    }
    return { rows, organizations, partial };
  }
  async function admitted(chosen: PickerRow) {
    const { rows } = await catalog();
    // El id de la cuenta basta para elegir: `engine_workspace_id: null` solo omite la preferencia
    // del motor, nunca bloquea. `workspace_not_available` es que la fila ya no está en el catálogo.
    const row = rows.find(w => w.session === chosen.session && w.context === chosen.context && w.sub === chosen.sub && w.org === chosen.org && w.account_id === chosen.account_id);
    if (!row) throw new Error("workspace_not_available");
    return row;
  }
  return {
    catalog,
    canConnect: Boolean(options.connect),
    async connect() {
      if (!options.connect) return;
      options.store.setItem(resumeKey, "1");
      try { await options.connect(); } catch (error) { options.store.removeItem(resumeKey); throw error; }
    },
    /**
     * Admite solo esa organización sin tocar las demás (POST /v1/identity/contexts). Si la
     * organización exige SSO o MFA, el borde responde 409 organization_auth_required: se deja la
     * marca para reabrir el selector al volver y se manda el login con `organization_id`, para que
     * AuthKit no pregunte la organización otra vez.
     */
    async admit(entry: PickerOrg) {
      options.store.setItem(resumeKey, "1");
      try {
        await transport.mutation("identity/contexts", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ organization: entry.org, session_id: entry.session }),
        });
      } catch (error) {
        const code = (error as { code?: unknown } | null)?.code;
        if (code === "organization_auth_required" && options.signIn) {
          options.signIn(entry.org);
          return;
        }
        options.store.removeItem(resumeKey);
        throw error;
      }
      // Admisión sin salir de la página: no hay retorno que reabra el selector.
      options.store.removeItem(resumeKey);
      for (const fn of subscribers) fn();
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
        const client = scoped(transport, group[0]);
        const [prefs, active] = await Promise.all([
          group.some(row => row.engine_workspace_id) ? webAddedTransport(client).get().catch(() => null) : null,
          client.call("workspaces").then(async response => z.object({ active_workspace_id: workspaceId.nullable() }).parse(await response.json()).active_workspace_id).catch(() => null),
        ]);
        const added = new Set(prefs?.status === 200 ? parsePreferences(prefs.body)?.added : []);
        return group.filter(row => row.account_id === active || (row.engine_workspace_id && added.has(row.engine_workspace_id)));
      }))).flat();
    },
    async add(chosen: PickerRow) {
      const row = await admitted(chosen);
      const client = scoped(transport, row);
      if (row.engine_workspace_id) {
        const result = await webAddedTransport(client).put(row.engine_workspace_id);
        if (result.status !== 204) throw new Error("workspace_preference_not_saved");
      }
      const response = await client.mutation("workspaces/select", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ workspace: row.account_id }),
      });
      const selection = z.object({ workspace: platformWorkspace }).parse(await response.json());
      if (!response.ok || selection.workspace.id !== row.account_id || selection.workspace.org !== row.org)
        throw new Error("workspace_selection_mismatch");
      options.selected?.(row);
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
