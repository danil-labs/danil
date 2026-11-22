export const NS = "harness.layout.";
// En la web, de la persona y no del navegador; se releen al cambiar de persona.
export const PER_PERSON: ReadonlySet<string> = new Set(["machines.run_on", "machines.known_names", "workspaces.hidden", "workspaces.removed", "projects.last_picked", "projects.hidden"]);
export const REREAD: ReadonlySet<string> = new Set(["machines.run_on", "workspaces.hidden", "projects.last_picked", "projects.hidden"]);
