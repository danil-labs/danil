import { isOrganizationSelectionRequired, type OrganizationSelection } from "../../../platform-client/src/organizations.ts";
import { listenDanilConnectionChange } from "../../../host/src/danilConnectionEvents.ts";
import { onEdgeProblem } from "../../../platform-client/src/client";
import { callShellEngine } from "../../../session/src/shell-queries.ts";
import { hasSessionGroups } from "./session-groups";

/** Un conjunto usa los menús de grupo; sin él, queda el selector anterior. */
export function legacyOrganizationGate(selection: OrganizationSelection) {
  const load = async () => {
    const status = await callShellEngine<{ state: string; sessions?: unknown[] }>("danil_session_status").catch(() => null);
    if (!status?.sessions && status?.state === "connected") await selection.load();
  };
  onEdgeProblem((e) => {
    if (!hasSessionGroups() && isOrganizationSelectionRequired(e)) selection.report(e);
  });
  void listenDanilConnectionChange(() => void load()).catch(() => {});
  void load();
}
