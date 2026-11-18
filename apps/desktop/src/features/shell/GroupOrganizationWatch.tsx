import { createResource, createRoot, createSignal, onCleanup, onMount, Show } from "solid-js";
import { capabilities } from "../../lib/platform";
import { sessionRailState } from "./session-groups";

export const [webOrganizationAttention, setWebOrganizationAttention] = createRoot(() => createSignal(false));
/** Los rechazos sin un contexto identificable van al «+», nunca al avatar ni a otra organización. */
export function GroupOrganizationWatch() {
  const [selection] = createResource(() => capabilities().organizations, (load) => load());
  return <Show when={selection()}>{(value) => {
    const report = () => {
      const needed = value().needed();
      if (!capabilities().nativeWindow) { setWebOrganizationAttention(needed); return; }
      if (!needed) return;
      const rail = sessionRailState();
      const context = rail?.sessions.defaultContext();
      if (context && rail?.groups()?.some((g) => g.context_id === context)) rail.sessions.noteOrganizationProblem(context);
      else rail?.notifyOrganization();
    };
    onMount(report);
    onCleanup(value().subscribe(report));
    return null;
  }}</Show>;
}
