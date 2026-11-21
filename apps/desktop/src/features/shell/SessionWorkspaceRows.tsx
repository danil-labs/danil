import { type Accessor, type JSX } from "solid-js";
import { capabilities } from "../../lib/platform";
import { KeyedList } from "../../ui/KeyedList";
import type { AttentionState, TaskAttention } from "./attention";
import { NewAccountTile } from "./NewAccountTile";
import { OrganizationSessionRows } from "./OrganizationSessionRows";
import type { sessionRail } from "./session-groups";

type RailWorkspace = { id: string; name: string; logo: string | null };
type RowsProps = { sessions: ReturnType<typeof sessionRail>; rows: RailWorkspace[]; render: (w: Accessor<RailWorkspace>) => JSX.Element; active: { workspace: string; context: string } | null; tasksOf: (id: string, context: string) => TaskAttention[]; staleOf?: (id: string, context: string) => boolean; stateLabel: (state: AttentionState | null) => string; onOpen: (id: string, context: string) => void; onManage: () => void };

export function SessionWorkspaceRows(props: RowsProps) {
  // En la web no hay «esta computadora»: un workspace que solo reporta una máquina no es un cuadro (plan web varias sesiones § 3).
  const local = () => !capabilities().nativeWindow ? [] : props.sessions.groups() === null ? props.rows : props.rows.filter((w) => !props.sessions.known.has(w.id));
  return <>
    <KeyedList each={local()} by={(w) => w.id}>{(w) => <NewAccountTile id={w().id}>{props.render(w)}</NewAccountTile>}</KeyedList>
    <OrganizationSessionRows sessions={props.sessions} rows={props.rows} active={props.active} tasksOf={props.tasksOf} staleOf={props.staleOf} stateLabel={props.stateLabel} onOpen={props.onOpen} onManage={props.onManage} />
  </>;
}
