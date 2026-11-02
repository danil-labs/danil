/**
 * Lecturas de consumo y actividad del Harness. Danil Machine entrega el JSON de
 * `/v1/org/*`; aquí solo se ordena y se decide qué falta, para que la pantalla
 * no invente un cero donde no hubo dato.
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

export type UsageMachine = { id: string; name: string | null; origin: string; turns: number };

export type UsageWindow = { days?: number | null; month?: string | null; since: number; until: number };

export type AdminUsage = {
  window: UsageWindow;
  totals: UsageTotals;
  models: UsageModel[];
  people: UsagePerson[];
  tools: UsageTool[];
  machines?: UsageMachine[];
  workspaces: UsageWorkspace[];
  truncated?: boolean;
};

export type ActivityEvent = {
  id: string;
  /** ISO 8601 del servidor. */
  at: string;
  actor: string;
  workspace: string | null;
  machine: { id: string; name: string | null; origin: string } | null;
  origin: string;
  kind: string;
  action: string;
  result: "ok" | "denied" | "error" | "unknown" | string;
  client: string | null;
  service: string;
  target: string | null;
  detail: Record<string, unknown> | null;
};

export type Activity = { events: ActivityEvent[] };

export type HarnessMember = {
  id: string;
  user_id: string;
  email: string | null;
  name: string | null;
  role: string;
  status: string;
  last_activity_at: string | null;
};
export type HarnessInvitation = { id: string; email: string; role: string | null; state: string | null; created_at: string | null };
export type HarnessMembers = { members: HarnessMember[]; invitations: HarnessInvitation[] };

export type HarnessIdentity = {
  user?: { id?: string; email?: string | null; name?: string | null };
  account?: { id?: number; name?: string | null };
  organization?: { id: string; name: string } | null;
  role?: string;
  admin?: boolean;
  permissions?: string[];
};

export type ActivityFilter = "all" | "mcp" | "denied";

export const tokens = (value: TokenTotals | null | undefined) =>
  value ? value.input_uncached + value.cache_read + value.cache_write + value.output + value.reasoning : 0;

/** Un MCP es lo que el servidor marcó como tal; el nombre de la acción no alcanza. */
export const isMcp = (event: ActivityEvent) => event.kind === "mcp" || event.detail?.channel === "mcp";

export function filterActivity(events: readonly ActivityEvent[], filter: ActivityFilter): ActivityEvent[] {
  if (filter === "mcp") return events.filter(isMcp);
  if (filter === "denied") return events.filter((event) => event.result === "denied");
  return [...events];
}

/** La herramienta que se llamó; el detalle manda sobre el nombre del método. */
export const actionOf = (event: ActivityEvent) =>
  typeof event.detail?.tool === "string" ? event.detail.tool : event.action;

/** El cliente externo que hizo la llamada (Claude, Hermes, Codex…), si lo dijo. */
export const clientOf = (event: ActivityEvent) =>
  event.client || (typeof event.detail?.client === "string" ? event.detail.client : "");

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

/** La clave de frase de un fallo de la fuente, para distinguir «sin permiso» de «no disponible». */
export function failureKey(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const what = (error as { what?: unknown }).what;
  if (what && typeof what === "object" && typeof (what as { clave?: unknown }).clave === "string") {
    return (what as { clave: string }).clave;
  }
  return "";
}

export const isForbidden = (error: unknown) => failureKey(error) === "harness.admin.forbidden";
