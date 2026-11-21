import { isOrganizationSelectionRequired, type OrganizationSelection } from "@terminus/computers";
import { listenDanilConnectionChange } from "../../lib/danilConnectionEvents";
import { onEdgeProblem } from "../../platform/client";
import { invoke } from "../../engine/client";
import { hasSessionGroups } from "./session-groups";

/** Un conjunto usa los menús de grupo; sin él, queda el selector anterior. */
export function legacyOrganizationGate(selection: OrganizationSelection) {
  const load = async () => {
    const status = await invoke<{ state: string; sessions?: unknown[] }>("danil_session_status").catch(() => null);
    if (!status?.sessions && status?.state === "connected") await selection.load();
  };
  onEdgeProblem((e) => {
    if (!hasSessionGroups() && isOrganizationSelectionRequired(e)) selection.report(e);
  });
  void listenDanilConnectionChange(() => void load()).catch(() => {});
  void load();
}
