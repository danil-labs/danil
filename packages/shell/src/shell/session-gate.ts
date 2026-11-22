import { createRoot, createSignal } from "solid-js";
import { firstLoginPhase, type FirstLoginPhase } from "./first-login.ts";
import type { AdoptionReport } from "./session-account-workspaces.ts";

type Status = { state?: string; email?: string | null; sessions?: { email?: string | null }[] } | null | undefined;
export type GateView = { t: "loading" } | { t: "open" } | Exclude<FirstLoginPhase, { t: "hidden" }>;

/**
 * Qué pinta la ventana antes de la app. `status: undefined` es «todavía no se sabe»;
 * `null`, que no se pudo leer: sin sesión confirmada no se monta nada detrás.
 */
export function gateView(input: { status: Status; done: boolean; signedInThisRun: boolean; linked: boolean }): GateView {
  if (input.status === undefined) return { t: "loading" };
  if (input.status?.state !== "connected") return { t: "sign_in" };
  if (input.done || input.linked) return { t: "open" };
  const phase = firstLoginPhase({ done: false, status: input.status, signedInThisRun: input.signedInThisRun });
  return phase.t === "hidden" ? { t: "open" } : phase;
}

// El aviso de lo que se ligó antes de montar la app lo pinta el riel (`AdoptionFeedback`).
const [handedReport, setHandedReport] = createRoot(() => createSignal<AdoptionReport | null>(null));
export { handedReport };
export const handAdoptionReport = (report: AdoptionReport | null) => setHandedReport(report);
