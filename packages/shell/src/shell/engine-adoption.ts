/**
 * La adopción que hace el motor (`engine_adoption_v1`, danil-engine `danil/adoption.rs`): la
 * ventana solo pinta su estado y su evento. El motor adopta con su propia sesión: solo es
 * suya cuando también anuncia `person_session_v1`.
 */
import type { AdoptionProgress } from "./first-login.ts";
import { ENGINE_SESSION_FEATURE } from "./session-source.ts";

export const ENGINE_ADOPTION_FEATURE = "engine_adoption_v1";
export const engineOwnsAdoption = (features: readonly string[] | null | undefined) =>
  !!features?.includes(ENGINE_ADOPTION_FEATURE) && features.includes(ENGINE_SESSION_FEATURE);

type State = "idle" | "running" | "done" | "partial";
const STATES = new Set<State>(["idle", "running", "done", "partial"]);
type Row = { id: string; name: string };
/** `engine_adoption_status`: el último repaso del motor. */
export type EngineAdoption = { state: State; org: string | null; adopted: Row[]; already: Row[]; failed: (Row & { reason: string })[]; cause: string | null; attempted: number };

const text = (v: unknown) => (typeof v === "string" && v ? v : null);
const rowsOf = (v: unknown): Row[] => (Array.isArray(v) ? v : []).flatMap((r) => {
  const id = text((r as Row | null)?.id);
  return id ? [{ id, name: text((r as Row).name) ?? id }] : [];
});

export function engineAdoptionOf(raw: unknown): EngineAdoption | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || !STATES.has(r.state as State)) return null;
  const failed = (Array.isArray(r.failed) ? r.failed : []).flatMap((f) => {
    const [row] = rowsOf([f]);
    return row ? [{ ...row, reason: text((f as { reason?: unknown }).reason) ?? "failed" }] : [];
  });
  return { state: r.state as State, org: text(r.org), adopted: rowsOf(r.adopted), already: rowsOf(r.already), failed, cause: text(r.cause), attempted: Number.isInteger(r.attempted) ? (r.attempted as number) : 0 };
}

/** `done` y `partial` cierran un repaso; con un fallo transitorio el motor sigue solo y vuelve a avisar. */
export const engineAdoptionFinished = (a: EngineAdoption) => a.state === "done" || a.state === "partial";

/**
 * Las filas de «Ligando…»: los locales que había al empezar, con lo que el motor ya reportó.
 * El motor no avisa por workspace: mientras corre, los demás están «ligando».
 */
export function engineAdoptionProgress(a: EngineAdoption, locals: readonly Row[]): AdoptionProgress {
  const done = new Set([...a.adopted, ...a.already].map((r) => r.id));
  const later = new Set(a.failed.map((r) => r.id));
  const all = [...locals];
  for (const r of [...a.adopted, ...a.already, ...a.failed]) if (!all.some((x) => x.id === r.id)) all.push(r);
  const finished = engineAdoptionFinished(a);
  return {
    org: a.org ?? "",
    finished,
    rows: all.map(({ id, name }) => ({ id, name, step: done.has(id) ? "done" : later.has(id) || finished ? "later" : a.state === "running" ? "working" : "waiting" })),
  };
}

/** Hecho cuando el motor dice `done`, o `partial`/`idle` sin locales pendientes (`remaining` de `adoption_candidates`). */
export const engineAdoptionDone = (a: EngineAdoption, remaining: number | null) =>
  a.state === "done" || ((a.state === "partial" || a.state === "idle") && remaining === 0);

/** La misma forma que `AdoptionReport` (`session-account-workspaces.ts`), sin importarla: ese módulo importa este. */
type AdoptionReport = {
  context: string; org: string; org_name: string | null;
  adopted: Row[]; refused: (Row & { reason: string })[]; failed: (Row & { reason: string })[];
  unavailable: boolean; cause: string | null;
};

/** El aviso que ya existe (`AdoptionFeedback`). Lo que ya estaba en la plataforma no cuenta como traído. */
export function engineAdoptionReport(a: EngineAdoption, context = "", orgName: string | null = null): AdoptionReport | null {
  if (!engineAdoptionFinished(a) || (!a.adopted.length && !a.failed.length)) return null;
  const refused = a.failed.filter((f) => f.reason === "id_taken");
  return { context, org: a.org ?? "", org_name: orgName, adopted: a.adopted, refused, failed: a.failed.filter((f) => f.reason !== "id_taken"), unavailable: false, cause: a.cause };
}

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
type Listen = <T>(event: string, on: (e: { payload: T }) => void) => Promise<() => void>;

export const readEngineAdoption = async (rpc: Invoke) => engineAdoptionOf(await rpc<unknown>("engine_adoption_status").catch(() => null));
/** Otro repaso del motor: el «Reintentar» del aviso. */
export const retryEngineAdoption = async (rpc: Invoke) => engineAdoptionOf(await rpc<unknown>("engine_adoption_retry").catch(() => null));

export function onEngineAdoption(listen: Listen, on: (a: EngineAdoption) => void): Promise<() => void> {
  return listen<unknown>("engine-adoption", (e) => { const a = engineAdoptionOf(e.payload); if (a) on(a); });
}
