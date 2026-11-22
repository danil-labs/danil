import { isPersonal, type PersonalSignal } from "../../../session/src/personal-org.ts";

type Workspace = { id: string; name: string };
/** El sello clasifica la cuenta; ser la personal (no el plan) decide la fuente que puede ejecutar el workspace. */
export function sessionWorkspaceSource(group: PersonalSignal | null, organizationMachine: () => readonly Workspace[] | null, thisComputer: () => readonly Workspace[]): readonly Workspace[] | null {
  return group && isPersonal(group) ? thisComputer() : organizationMachine();
}
