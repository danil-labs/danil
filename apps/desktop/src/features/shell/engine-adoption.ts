/**
 * La adopción que hace el motor (decisión «la sesión vive en el motor» § 2.5): la ventana solo
 * pinta su estado y su evento. Los nombres son provisionales hasta que el motor publique su
 * contrato; viven solo aquí y en `scripts/engine-pending.mjs`.
 */
import type { AdoptionProgress, AdoptionStep } from "./first-login.ts";
/** La misma forma que `AdoptionReport` (`session-account-workspaces.ts`), sin importarla: ese módulo importa este. */
type AdoptionReport = {
  context: string; org: string; org_name: string | null;
  adopted: { id: string; name: string }[]; refused: { id: string; name: string; reason: string }[]; failed: { id: string; name: string; reason: string }[];
  unavailable: boolean; cause: string | null;
};

export const ENGINE_ADOPTION_FEATURE = "engine_adoption_v1";
export const engineOwnsAdoption = (features: readonly string[] | null | undefined) => !!features?.includes(ENGINE_ADOPTION_FEATURE);

type State = "idle" | "running" | "done" | "partial" | "failed";
const STATES = new Set<State>(["idle", "running", "done", "partial", "failed"]);
const STEPS = new Set<AdoptionStep>(["waiting", "working", "done", "later"]);
export type EngineAdoption = {
  state: State;
  org: string | null;
  org_name: string | null;
  /** Locales que el motor todavía tiene que ligar. */
  pending: number;
  items: { id: string; name: string; step: AdoptionStep }[];
  /** Ya eran de una organización: se quedan en ella. */
  kept: { id: string; name: string; org_name: string | null }[];
};

const text = (v: unknown) => (typeof v === "string" && v ? v : null);

export function engineAdoptionOf(raw: unknown): EngineAdoption | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || !STATES.has(r.state as State)) return null;
  const rows = Array.isArray(r.items) ? r.items : [];
  const items: EngineAdoption["items"] = [];
  const kept: EngineAdoption["kept"] = [];
  for (const row of rows as Record<string, unknown>[]) {
    const id = text(row?.id);
    if (!id) continue;
    const name = text(row.name) ?? id;
    if (row.step === "stays") kept.push({ id, name, org_name: text(row.org_name) });
    else items.push({ id, name, step: STEPS.has(row.step as AdoptionStep) ? (row.step as AdoptionStep) : "waiting" });
  }
  const pending = Number.isInteger(r.pending) && (r.pending as number) >= 0 ? (r.pending as number) : items.filter((i) => i.step !== "done").length;
  return { state: r.state as State, org: text(r.org), org_name: text(r.org_name), pending, items, kept };
}

const finished = (a: EngineAdoption) => a.state === "done" || a.state === "partial" || a.state === "failed";

export const engineAdoptionProgress = (a: EngineAdoption): AdoptionProgress => ({ org: a.org ?? "", finished: finished(a), rows: a.items });

/** Hecho cuando el motor terminó sin pendientes; `idle` sin pendientes es que no había nada. */
export const engineAdoptionDone = (a: EngineAdoption) => a.pending === 0 && (a.state === "done" || a.state === "partial" || a.state === "idle");

/** El aviso que ya existe (`AdoptionFeedback`), con lo que el motor trajo. */
export function engineAdoptionReport(a: EngineAdoption, context = ""): AdoptionReport | null {
  if (!finished(a)) return null;
  const adopted = a.items.filter((i) => i.step === "done").map(({ id, name }) => ({ id, name }));
  const failed = a.items.filter((i) => i.step !== "done").map(({ id, name }) => ({ id, name, reason: "later" }));
  if (!adopted.length && !failed.length) return null;
  return { context, org: a.org ?? "", org_name: a.org_name, adopted, refused: [], failed, unavailable: false, cause: null };
}

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
type Listen = <T>(event: string, on: (e: { payload: T }) => void) => Promise<() => void>;

export async function readEngineAdoption(invoke: Invoke): Promise<EngineAdoption | null> {
  return engineAdoptionOf(await invoke<unknown>("adoption_status").catch(() => null));
}

export function onEngineAdoption(listen: Listen, on: (a: EngineAdoption) => void): Promise<() => void> {
  return listen<unknown>("adoption.changed", (e) => { const a = engineAdoptionOf(e.payload); if (a) on(a); });
}
