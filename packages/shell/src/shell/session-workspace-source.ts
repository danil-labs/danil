import type { Workspace } from "../../../features/workspaces/src/model.ts";
type SessionWorkspace = Pick<Workspace, "id" | "name">;
/** El sello clasifica la cuenta; el plan decide la fuente que puede ejecutar el workspace. */
export function sessionWorkspaceSource(plan: string | null, organizationMachine: () => readonly SessionWorkspace[] | null, thisComputer: () => readonly SessionWorkspace[]): readonly SessionWorkspace[] | null {
  return plan === "free" ? thisComputer() : organizationMachine();
}
