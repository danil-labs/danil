/**
 * La familia visible de una tarea: lo que el riel esconde bajo una sola entrada
 * sin esconder lo que pide atención. Escritorio y teléfono la derivan igual.
 */
import { rolledOutcome, type TaskActivity } from "../../design/src/index.ts";
import { buildTaskTree, type TaskBranch, type TaskTreeRow } from "./tree.ts";

/** De cada tarea, los ids de toda su familia debajo de ella. */
export function delegatedFamilies<R extends TaskTreeRow>(rows: readonly R[]): Map<string, string[]> {
  const families = new Map<string, string[]>();
  const visit = (branches: TaskBranch<R>[], ancestors: string[]) => {
    for (const branch of branches) {
      for (const ancestor of ancestors) families.set(ancestor, [...(families.get(ancestor) ?? []), branch.tarea.id]);
      visit(branch.hijas, [...ancestors, branch.tarea.id]);
    }
  };
  visit(buildTaskTree(rows), []);
  return families;
}

/** Lo que `delegatedAttention` lee de una fila. */
export type AttentionRow = { id: string; esperando?: boolean; outcome?: TaskActivity["outcome"]; sin_ver?: boolean };

export function delegatedAttention(rows: readonly AttentionRow[], live: readonly string[], approvals: readonly string[]): TaskActivity {
  return {
    aprobando: rows.some(row => approvals.includes(row.id)),
    esperando: rows.some(row => !!row.esperando),
    viva: rows.some(row => live.includes(row.id)),
    outcome: rolledOutcome(rows),
    sinVer: rows.some(row => !!row.sin_ver),
  };
}

/**
 * Las filas visibles con la actividad de su familia. `scope` separa las máquinas,
 * donde un id puede repetirse. Sin familia, la misma fila.
 */
export function withFamilyActivity<R extends TaskTreeRow>(
  visible: readonly R[],
  hidden: readonly R[],
  scope: (row: R) => string,
  activity: (rows: R[]) => TaskActivity,
): (R & { delegated_activity?: TaskActivity })[] {
  const scopes = new Map<string, R[]>();
  for (const row of [...visible, ...hidden]) scopes.set(scope(row), [...(scopes.get(scope(row)) ?? []), row]);
  const families = new Map([...scopes].map(([key, rows]) => [key, delegatedFamilies(rows)]));
  return visible.map((row) => {
    const rows = scopes.get(scope(row)) ?? [];
    const children = (families.get(scope(row))?.get(row.id) ?? []).flatMap((id) => rows.find((other) => other.id === id) ?? []);
    return children.length ? { ...row, delegated_activity: activity([row, ...children]) } : row;
  });
}
