type Problem = { context: string; detail: "organization_selection_required" };
const listeners = new Set<(problem: Problem) => void>();
const pending = new Map<string, Problem>();

/** Un rechazo de una llamada con contexto no se convierte en un aviso de la organización por omisión. */
export function reportOrganizationProblem(context: string, error: unknown) {
  if ((error as { detail?: unknown } | null)?.detail !== "organization_selection_required") return;
  const problem: Problem = { context, detail: "organization_selection_required" };
  if (!listeners.size) pending.set(context, problem);
  else for (const listener of listeners) listener(problem);
}
export function subscribeOrganizationProblems(listener: (problem: Problem) => void) {
  listeners.add(listener);
  for (const problem of pending.values()) listener(problem);
  pending.clear();
  return () => { listeners.delete(listener); };
}
