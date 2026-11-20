import type { PersonalOutcome } from "./personal-open.ts";

/** Hecho cuando el login terminó y no quedan locales sin organización (plan § 2.6). */
export const FIRST_LOGIN_KEY = "onboarding.first_login_v1";

export type AdoptionStep = "waiting" | "working" | "done" | "later";
export type AdoptionProgress = { org: string; finished: boolean; rows: { id: string; name: string; step: AdoptionStep }[] };
type Status = { state?: string; email?: string | null; sessions?: { email?: string | null }[] } | null;
export type FirstLoginPhase = { t: "hidden" } | { t: "sign_in" } | { t: "continue"; email: string } | { t: "linking" };

let signedInThisRun = false;
/** El alta de esta ventana ya pidió la sesión: la pantalla no la vuelve a pedir. */
export const noteFirstLoginSignedIn = () => { signedInThisRun = true; };
export const firstLoginSignedIn = () => signedInThisRun;

export function firstLoginPhase(input: { done: boolean; status: Status; signedInThisRun: boolean }): FirstLoginPhase {
  if (input.done) return { t: "hidden" };
  const status = input.status;
  if (status?.state !== "connected") return { t: "sign_in" };
  if (input.signedInThisRun) return { t: "linking" };
  const email = status.email ?? status.sessions?.find((s) => s.email)?.email;
  return email ? { t: "continue", email } : { t: "sign_in" };
}

export const shouldMarkFirstLoginDone = (input: { signedIn: boolean; remaining: number }) => input.signedIn && input.remaining === 0;

/** `background`: no hay pantalla de error; lo pendiente sigue solo y el riel queda libre. */
export function linkingOutcome(progress: AdoptionProgress | null, outcome: PersonalOutcome | null): "waiting" | "done" | "background" {
  if (outcome && outcome.kind !== "open") return "background";
  return progress?.finished ? "done" : "waiting";
}

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
// La fila propia por la flota puede llegar sin `features`; lo que el motor anunció en esta ejecución vale.
let adopts = false;
/** Los locales sin organización que este motor puede ligar; `0` si no sabe adoptar o no contesta. */
export async function localCandidateCount(invoke: Invoke): Promise<number> {
  try {
    const self = (await invoke<{ id: string; local?: boolean; features?: string[] }[]>("machine_list")).find((m) => m.local);
    adopts ||= !!(self?.features?.includes("account_adoption_v1") && self.features.includes("account_adoption_proof_v1"));
    if (!self || !adopts) return 0;
    return (await invoke<{ adoptable?: boolean }[]>("adoption_candidates", { "x-terminus-machine": self.id })).filter((c) => c.adoptable !== false).length;
  } catch {
    return 0;
  }
}
