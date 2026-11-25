/**
 * El catálogo `GET /v1/workspaces` del borde, en la forma que ya pinta el teléfono.
 * El id que ve el motor es `engine_workspace_id`. Una fila sin ese id, archivada,
 * o de otra organización (el borde omite el id) no se ofrece. Sin React Native.
 */
import type { AccountWorkspace, Computer } from "@terminus/computers";

export type EdgeWorkspace = AccountWorkspace & {
  /** Dónde puede correr. `null`: el catálogo no lo limita. */
  runs_on?: ReadonlyArray<"personal" | "cloud"> | null;
};

export type WorkspaceRead =
  | { kind: "ok"; value: EdgeWorkspace[] }
  | { kind: "organization" }
  | { kind: "workspace" }
  | { kind: "unavailable" };

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

const text = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

/** `runs_on` manda. Si falta, `placement.kind` dice lo mismo que en el contrato: un valor desconocido es nube. */
function runsOn(row: Record<string, unknown>): ReadonlyArray<"personal" | "cloud"> | null {
  const listed = Array.isArray(row.runs_on) ? row.runs_on.filter((value): value is "personal" | "cloud" => value === "personal" || value === "cloud") : [];
  if (listed.length) return listed;
  const kind = record(row.placement)?.kind;
  if (kind === "member_computer") return ["personal"];
  if (typeof kind === "string" && kind) return ["cloud"];
  return null;
}

/** Una página del catálogo. `items` que no es una lista es una respuesta que no se entiende. */
export function catalogPage(body: unknown): { rows: EdgeWorkspace[]; next: string | null; empty: string | null } {
  const page = record(body);
  if (!Array.isArray(page?.items)) throw new Error("invalid_workspaces");
  const rows: EdgeWorkspace[] = [];
  for (const raw of page.items) {
    const row = record(raw);
    if (!row || row.archived === true || row.state === "archived") continue;
    const engine = text(row.engine_workspace_id);
    if (!engine) continue;
    rows.push({
      id: engine,
      name: text(row.name) ?? engine,
      projects: [],
      computers: [],
      runs_on: runsOn(row),
    });
  }
  return { rows, next: text(page.next_cursor), empty: text(page.empty_reason) };
}

/** Junta las páginas. Una lista vacía solo es un límite cuando el borde dice por qué. */
export function workspaceRead(pages: readonly { rows: readonly EdgeWorkspace[]; empty: string | null }[]): WorkspaceRead {
  const rows = pages.flatMap((page) => page.rows);
  const empty = pages.find((page) => page.rows.length === 0)?.empty ?? null;
  if (!rows.length && (empty === "no_organization" || empty === "organization_access_denied")) return { kind: "organization" };
  if (!rows.length && empty === "no_workspace_access") return { kind: "workspace" };
  return { kind: "ok", value: [...rows] };
}

/** Si este workspace puede correr en una máquina de ese `kind`. Sin dato, no se inventa un rechazo. */
export function allows(runs: EdgeWorkspace["runs_on"], kind: string | null | undefined): boolean {
  if (!runs?.length) return true;
  if (kind === "personal") return runs.includes("personal");
  if (kind === "organization") return runs.includes("cloud");
  return true;
}

/**
 * El catálogo es la lista que la persona puede ver. Cada máquina recibe solo los
 * workspaces que pueden correr en ella: el teléfono ya filtra por `workspaces`.
 * El registro conserva esas máquinas para cuando estén apagadas.
 */
export function placeWorkspaces(rows: readonly EdgeWorkspace[], machines: readonly Computer[]): { registry: AccountWorkspace[]; machines: Computer[] } {
  return {
    registry: rows.map((workspace) => ({
      ...workspace,
      computers: machines.filter((machine) => allows(workspace.runs_on, machine.kind)).map((machine) => machine.computer_id),
    })),
    machines: machines.map((machine) => ({
      ...machine,
      workspaces: rows.filter((workspace) => allows(workspace.runs_on, machine.kind)).map((workspace) => workspace.id),
    })),
  };
}
