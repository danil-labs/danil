import type { PersonalOutcome } from "./personal-open.ts";

/** Hecho cuando el login terminó y no quedan locales sin organización (plan § 2.6). */
export const FIRST_LOGIN_KEY = "onboarding.first_login_v1";

export type AdoptionStep = "waiting" | "working" | "done" | "later";
export type AdoptionProgress = { org: string; finished: boolean; rows: { id: string; name: string; step: AdoptionStep }[] };
type Status = { state?: string; email?: string | null; sessions?: { email?: string | null }[] } | null;
export type FirstLoginPhase = { t: "hidden" } | { t: "sign_in" } | { t: "continue"; email: string } | { t: "linking" };

export { firstLoginSignedIn } from "../../../session/src/first-login-run.ts";

export function firstLoginPhase(input: { done: boolean; status: Status; signedInThisRun: boolean }): FirstLoginPhase {
  if (input.done) return { t: "hidden" };
  const status = input.status;
  if (status?.state !== "connected") return { t: "sign_in" };
  if (input.signedInThisRun) return { t: "linking" };
  const email = status.email ?? status.sessions?.find((s) => s.email)?.email;
  return email ? { t: "continue", email } : { t: "sign_in" };
}

/** `remaining: null` es «no se sabe» (el motor no dijo qué anuncia): no se marca. */
export const shouldMarkFirstLoginDone = (input: { signedIn: boolean; remaining: number | null }) => input.signedIn && input.remaining === 0;

/** `background`: no hay pantalla de error; lo pendiente sigue solo y el riel queda libre. */
export function linkingOutcome(progress: AdoptionProgress | null, outcome: PersonalOutcome | null): "waiting" | "done" | "background" {
  if (outcome && outcome.kind !== "open") return "background";
  return progress?.finished ? "done" : "waiting";
}

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
/**
 * Los locales sin organización que este motor puede ligar. `0` con un motor que no sabe adoptar;
 * `null` si no se sabe (sin respuesta del motor): quien marca el login como hecho no debe adivinar.
 */
export async function localCandidateCount(invoke: Invoke, features?: () => Promise<readonly string[] | null>): Promise<number | null> {
  try {
    const self = (await invoke<{ id: string; local?: boolean; features?: string[] }[]>("machine_list")).find((m) => m.local);
    const announced = features ? await features().catch(() => null) : self?.features ?? null;
    if (!self || !announced) return null;
    if (!announced.includes("account_adoption_v1") || !announced.includes("account_adoption_proof_v1")) return 0;
    return (await invoke<{ adoptable?: boolean }[]>("adoption_candidates", { "x-terminus-machine": self.id })).filter((c) => c.adoptable !== false).length;
  } catch {
    return null;
  }
}
