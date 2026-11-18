import { createRoot, createSignal } from "solid-js";
import { capabilities } from "../../lib/platform";
import { sessionRailState } from "./session-groups";

const [webGrouped, setWebGrouped] = createRoot(() => createSignal(true));
export const noteWebAccountMode = () => setWebGrouped(!capabilities().groupAccount?.legacy?.());

/** La ausencia del conjunto en un servidor anterior conserva los controles legados. */
export function usesGroupAccounts() {
  const rail = sessionRailState();
  return !capabilities().nativeWindow ? webGrouped() : !rail?.ready() || !rail.connected() || rail.groups() !== null;
}
