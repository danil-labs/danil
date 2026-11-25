import type { RailWorkspaceTarget } from "./remove-rail-workspace";
import type { AttentionState, TaskAttention } from "./attention";
import { OrganizationSessionRows } from "./OrganizationSessionRows";
import type { sessionRail } from "./session-groups";

type RailWorkspace = { id: string; name: string; logo: string | null };
type RowsProps = { sessions: ReturnType<typeof sessionRail>; rows: RailWorkspace[]; active: { workspace: string; context: string } | null; tasksOf: (id: string, context: string) => TaskAttention[]; suppressTooltips?: boolean; staleOf?: (id: string, context: string) => boolean; stateLabel: (state: AttentionState | null) => string; onOpen: (id: string, context: string) => void; onHide: (workspace: RailWorkspaceTarget) => void; onRemove: (workspace: RailWorkspaceTarget) => void; hidden: (workspace: string, context: string) => boolean };

/**
 * El riel, por organización y contexto: cada cuadro sale del catálogo de su sesión
 * (plan workspaces como Slack § 3). La máquina no aporta cuadros propios.
 */
export function SessionWorkspaceRows(props: RowsProps) {
  return <OrganizationSessionRows suppressTooltips={props.suppressTooltips} sessions={props.sessions} rows={props.rows} active={props.active} tasksOf={props.tasksOf} staleOf={props.staleOf} stateLabel={props.stateLabel} onOpen={props.onOpen} onHide={props.onHide} onRemove={props.onRemove} hidden={props.hidden} />;
}

export type { RowsProps as SessionWorkspaceRowsProps };
