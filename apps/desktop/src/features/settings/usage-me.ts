/**
 * `GET /v1/usage/me` de Computers: lo que midieron las máquinas de la cuenta
 * (`docs/usage.md`). Un dato que el servidor no manda no se rellena con cero.
 */

export type UsageTokens = {
  input_uncached: number;
  cache_read: number;
  cache_write: number;
  output: number;
  reasoning: number;
};

export type UsageTotals = {
  turns: number;
  sessions: number;
  duration_ms: number;
  measured_turns: number;
  turns_without_cost: number;
  tokens: UsageTokens;
  /** `null`: ningún turno trajo importe del proveedor; un cero sería falso. */
  cost_usd: number | null;
};

export type UsagePlan = { key: string | null; source: string; paid: boolean };
export type UsageWindow = { days: number; since: string; until: string };
export type UsageDay = UsageTotals & { date: string };
export type UsageModel = UsageTotals & { agent: string; model: string | null };
export type UsageMachine = UsageTotals & { machine_id: string; origin: string };

export type UsageMe = {
  account_id: number;
  plan: UsagePlan;
  window: UsageWindow;
  totals: UsageTotals;
  daily: UsageDay[];
  models: UsageModel[];
  machines: UsageMachine[];
  truncated: boolean;
};

/** La ventana que ofrece la vista; el servidor acepta de 1 a 90 días. */
export type UsageDays = 7 | 30 | 90;

export type UsageMeSource = {
  get(days: UsageDays): Promise<UsageMe>;
};

const invalid = () => new Error("invalid_response");

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}

function rows(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw invalid();
  return value;
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw invalid();
  return value;
}

function positive(value: unknown): number {
  const number = integer(value);
  if (number <= 0) throw invalid();
  return number;
}

function amount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw invalid();
  return value;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw invalid();
  return value;
}

function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}

function bool(value: unknown): boolean {
  if (typeof value !== "boolean") throw invalid();
  return value;
}

function tokensOf(value: unknown): UsageTokens {
  const row = object(value);
  return {
    input_uncached: integer(row.input_uncached),
    cache_read: integer(row.cache_read),
    cache_write: integer(row.cache_write),
    output: integer(row.output),
    reasoning: integer(row.reasoning),
  };
}

function totalsOf(value: unknown): UsageTotals {
  const row = object(value);
  return {
    turns: integer(row.turns),
    sessions: integer(row.sessions),
    duration_ms: integer(row.duration_ms),
    measured_turns: integer(row.measured_turns),
    turns_without_cost: integer(row.turns_without_cost),
    tokens: tokensOf(row.tokens),
    cost_usd: row.cost_usd === null ? null : amount(row.cost_usd),
  };
}

/** La respuesta tal cual, sin inventar los campos que falten. */
export function readUsageMe(value: unknown): UsageMe {
  const row = object(value);
  const plan = object(row.plan);
  const window = object(row.window);
  return {
    account_id: positive(row.account_id),
    plan: { key: nullableText(plan.key), source: text(plan.source), paid: bool(plan.paid) },
    window: { days: positive(window.days), since: text(window.since), until: text(window.until) },
    totals: totalsOf(row.totals),
    daily: rows(row.daily).map((item) => {
      const day = object(item);
      return { ...totalsOf(day), date: text(day.date) };
    }),
    models: rows(row.models).map((item) => {
      const entry = object(item);
      return { ...totalsOf(entry), agent: text(entry.agent), model: nullableText(entry.model) };
    }),
    machines: rows(row.machines).map((item) => {
      const entry = object(item);
      return { ...totalsOf(entry), machine_id: text(entry.machine_id), origin: text(entry.origin) };
    }),
    truncated: bool(row.truncated),
  };
}

/** Los cinco contadores de tokens; el total de la vista es su suma. */
export const tokensTotal = (tokens: UsageTokens): number =>
  tokens.input_uncached + tokens.cache_read + tokens.cache_write + tokens.output + tokens.reasoning;

/** Un periodo sin turnos ni tokens: la vista lo dice en vez de pintar ceros. */
export const isEmptyUsage = (report: UsageMe): boolean =>
  report.totals.turns === 0 && tokensTotal(report.totals.tokens) === 0;

export type CostCoverage = {
  /** Turnos con importe conocido (`measured_turns`). */
  measured: number;
  turns: number;
  /** Turnos sin importe conocido (`turns_without_cost`). */
  withoutCost: number;
  complete: boolean;
};

export function costCoverage(totals: UsageTotals): CostCoverage {
  return {
    measured: totals.measured_turns,
    turns: totals.turns,
    withoutCost: totals.turns_without_cost,
    complete: totals.turns > 0 && totals.turns_without_cost === 0,
  };
}

export type PlanKind = "personal" | "teams" | "enterprise" | "none" | "other";

/** El plan que se pinta; una llave desconocida se enseña tal cual, no se adivina. */
export function planKind(plan: UsagePlan): PlanKind {
  const key = plan.key?.toLowerCase() ?? "";
  if (!key) return "none";
  if (key.includes("enterprise")) return "enterprise";
  if (key.includes("team")) return "teams";
  if (key.includes("personal")) return "personal";
  return "other";
}

export type OriginKind = "local" | "vm" | "shared" | "other";

export function originKind(origin: string): OriginKind {
  return origin === "local" || origin === "vm" || origin === "shared" ? origin : "other";
}

/** El día de mayor consumo; con la serie entera en cero, el primero. */
export function peakOf(days: readonly UsageDay[]): { date: string; tokens: number } {
  let top = { date: days[0]?.date ?? "", tokens: 0 };
  for (const row of days) {
    const tokens = tokensTotal(row.tokens);
    if (tokens > top.tokens) top = { date: row.date, tokens };
  }
  return top;
}
