import { createResource, createRoot, createSignal, onCleanup, onMount, Show } from "solid-js";
import { subscribeOrganizationProblems } from "../../../session/src/organization-problems";
import { capabilities } from "../../../host/src/platform";
import { sessionRailState } from "./session-groups";

export const [webOrganizationAttention, setWebOrganizationAttention] = createRoot(() => createSignal(false));
export const [webOrganizationName, setWebOrganizationName] = createRoot(() => createSignal<string | null>(null));
/** Los rechazos sin un contexto identificable van al «+», nunca al avatar ni a otra organización. */
export function GroupOrganizationWatch() {
  onCleanup(subscribeOrganizationProblems(({ context }) => {
    const rail = sessionRailState();
    rail?.sessions.noteOrganizationProblem(context);
    if (!rail?.groups()?.some((g) => g.context_id === context)) rail?.notifyOrganization();
  }));
  const [selection] = createResource(() => capabilities().organizations, (load) => load());
  return <Show when={selection()}>{(value) => {
    const report = () => {
      const needed = value().needed();
      if (!capabilities().nativeWindow) { const state = value().state(); setWebOrganizationName(state.kind === "ready" ? state.items.find((org) => org.id === state.active)?.name ?? null : null); setWebOrganizationAttention(needed); return; }
      const rail = sessionRailState();
      if (!needed) { rail?.clearOrganizationNotice(); return; }
      const context = rail?.sessions.defaultContext();
      if (context && rail?.groups()?.some((g) => g.context_id === context)) rail.sessions.noteOrganizationProblem(context);
      else rail?.notifyOrganization();
    };
    onMount(report);
    onCleanup(value().subscribe(report));
    return null;
  }}</Show>;
}
