type Workspace = { id: string; name: string };
/** El sello clasifica la cuenta; el plan decide la fuente que puede ejecutar el workspace. */
export function sessionWorkspaceSource(plan: string | null, organizationMachine: () => readonly Workspace[] | null, thisComputer: () => readonly Workspace[]): readonly Workspace[] | null {
  return plan === "free" ? thisComputer() : organizationMachine();
}
