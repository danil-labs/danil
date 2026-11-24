/** Una respuesta parcial o malformada nunca autoriza borrar copias de otras sesiones. */
export function settledContextIds(rows: unknown): string[] | null {
  if (!Array.isArray(rows)) return null;
  const ids: string[] = [];
  for (const family of rows) {
    if (!family || typeof family !== "object" || !Array.isArray(family.contexts)) return null;
    for (const context of family.contexts) {
      if (!context || typeof context.context_id !== "string" || !context.context_id || typeof context.org !== "string" || !context.org) return null;
      ids.push(context.context_id);
    }
  }
  return [...new Set(ids)];
}
