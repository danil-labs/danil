import type { WorkspaceAddLink } from "./workspace-add-link.ts";
import { z } from "zod";
import type { EdgeTransport } from "../../platform-client/src/edge.ts";
import { workspaceId } from "./platform-workspaces.ts";

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

function organizationName(org: string, name: string | null | undefined) {
  return name && name !== org ? name : "";
}

export function webWorkspacePicker(transport: EdgeTransport, options: { store: Storage; takeHarnessWorkspace?: () => WorkspaceAddLink | null; connect?: () => Promise<void>; signIn?: (organization: string) => void }) {
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
    takeHarnessWorkspace: () => options.takeHarnessWorkspace?.() ?? null,
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
    async admit(entry: PickerOrg, { resume = true } = {}) {
      // Desde el aviso «Vuelve a entrar» no se reabre el «+» al volver del login.
      if (resume) options.store.setItem(resumeKey, "1");
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
    /**
     * Agregar es del riel (plan web varias sesiones § 2.1): se comprueba que la fila siga en el
     * catálogo y `apply` la agrega a `added` de su contexto y la abre en el cliente. No hay
     * `workspaces/select`: abrir un workspace no escribe nada global en el servidor.
     */
    async add(chosen: PickerRow, apply: (row: PickerRow) => Promise<void>) {
      const row = await admitted(chosen);
      await apply(row);
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
