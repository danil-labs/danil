/**
 * Lecturas de consumo y bitácora del Harness. El motor entrega el JSON tal como
 * lo devuelve el servidor de la organización; aquí solo se ordena y se decide
 * qué falta, para que la pantalla no invente un cero donde no hubo dato.
 */

export type TokenTotals = {
  input_uncached: number;
  cache_read: number;
  cache_write: number;
  output: number;
  reasoning: number;
};

export type UsageTotals = {
  turns: number;
  tokens: TokenTotals;
  cost_usd: number | null;
  turns_without_cost: number;
};

export type UsagePerson = {
  user_id: string;
  name: string | null;
  email: string | null;
  status: string;
  totals: UsageTotals;
};

export type UsageModel = UsageTotals & { agent: string; model: string | null };

export type UsageTool = { user_id: string; name: string; calls: number; failed: number; unknown: number };

export type UsageWorkspace = { id: string; name: string; usage_reporting: string };

export type UsageWindow = { days?: number | null; month?: string | null; since: number; until: number };

export type AdminUsage = {
  organization_id: string;
  window: UsageWindow;
  totals: UsageTotals;
  models: UsageModel[];
  people: UsagePerson[];
  tools: UsageTool[];
  workspaces: UsageWorkspace[];
  resources_truncated?: boolean;
  tools_truncated?: boolean;
};

export type OwnUsage = {
  organization_id: string;
  user_id: string;
  status: string;
  totals: UsageTotals;
  models: UsageModel[];
  tools: UsageTool[];
  workspaces: UsageWorkspace[];
  days: ({ day: string } & UsageTotals)[];
};

export type ActivityEvent = {
  id: number;
  at: number;
  actor: string;
  workspace: string;
  action: string;
  decision: string;
  revision: string;
  target: string;
  detail?: { channel?: string; client?: string; tool?: string } | null;
};

export type Activity = { since: number; events: ActivityEvent[] };

export type GovernedSkill = { id: string; repo: string; path: string; commit: string };
export type GovernedAgent = { id: string; repo: string; path: string; commit: string };
export type GovernedSource = { id: string; remote: string; commit: string; role: string; paths: string[] };
export type GovernedMcp = { id: string; name: string; url: string; auth: string; network?: string | null };
export type GovernedDocument = {
  workspace_id: string;
  workspace_name: string;
  policy_revision: string;
  enforcement: { mode: string; locked: string[] };
  sources: GovernedSource[];
  skills: GovernedSkill[];
  agents: GovernedAgent[];
  mcp_servers: GovernedMcp[];
  models: {
    providers: { id: string; name: string; account_mode: string }[];
    allowed: { provider: string; id: string; name?: string | null }[];
    default: { provider: string; id: string; name?: string | null } | null;
  };
  connections: { id: string; provider: string; name: string; status: string }[];
};
export type GovernancePayload = { governed: unknown; document: GovernedDocument | null };

export type HarnessMember = {
  membership_id: string;
  user_id: string;
  email: string | null;
  name: string | null;
  status: string;
  roles: string[];
  last_activity_at: number | null;
};
export type HarnessInvitation = { id: string; email: string; role: string | null; state: string | null; created_at: string | null };
export type HarnessMembers = { organization: { name?: string } | null; members: HarnessMember[]; invitations: HarnessInvitation[] };

export type HarnessIdentity = {
  user?: { email?: string | null; name?: string | null };
  organization?: { id: string; name: string } | null;
  organizations?: { id: string; name: string }[];
  admin?: boolean;
  roles?: string[];
  permissions?: string[];
  status?: string;
};

export type ActivityFilter = "all" | "mcp" | "denied";

export const tokens = (value: TokenTotals | null | undefined) =>
  value ? value.input_uncached + value.cache_read + value.cache_write + value.output + value.reasoning : 0;

/** Un MCP es lo que el servidor marcó como tal; el nombre de la acción no alcanza. */
export const isMcp = (event: ActivityEvent) => event.detail?.channel === "mcp";

export function filterActivity(events: readonly ActivityEvent[], filter: ActivityFilter): ActivityEvent[] {
  if (filter === "mcp") return events.filter(isMcp);
  if (filter === "denied") return events.filter((event) => event.decision !== "allow");
  return [...events];
}

/** La herramienta que se llamó; el detalle manda sobre el nombre del método. */
export const actionOf = (event: ActivityEvent) => event.detail?.tool || event.action;

/** El cliente externo que hizo la llamada (Claude Code, Codex, etc.), si lo dijo. */
export const clientOf = (event: ActivityEvent) => event.detail?.client || "";

export function aggregateTools(tools: readonly UsageTool[]) {
  const rows = new Map<string, { name: string; calls: number; failed: number; unknown: number }>();
  for (const tool of tools) {
    const row = rows.get(tool.name) ?? { name: tool.name, calls: 0, failed: 0, unknown: 0 };
    row.calls += tool.calls;
    row.failed += tool.failed;
    row.unknown += tool.unknown;
    rows.set(tool.name, row);
  }
  return [...rows.values()].sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));
}

/** El nombre que se pinta de una persona; sin nombre ni correo queda su identificador. */
export function personName(person: { name: string | null; email: string | null; user_id: string }) {
  return person.name || person.email || person.user_id;
}

/** La clave de frase de un fallo del motor, para distinguir «sin permiso» de «no disponible». */
export function failureKey(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const what = (error as { what?: unknown }).what;
  if (what && typeof what === "object" && typeof (what as { clave?: unknown }).clave === "string") {
    return (what as { clave: string }).clave;
  }
  return "";
}

export const isForbidden = (error: unknown) => failureKey(error) === "harness.admin.forbidden";

/** El motor instalado todavía no conoce los comandos: la app se actualiza, no el servidor. */
export function isUnsupported(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { what, detail } = error as { what?: unknown; detail?: unknown };
  return what === "service.error.command" || detail === "command" || detail === "unsupported";
}
