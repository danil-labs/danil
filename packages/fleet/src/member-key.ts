/** Solo es una clave interna; los ids públicos de las máquinas nunca cambian. */
export const memberKey = (machine: string, context?: string): string => context ? JSON.stringify([machine, context]) : machine;
export const sameContext = (a?: string, b?: string): boolean => (a ?? "") === (b ?? "");

/** Recupera el contexto de una clave contextual serializada. */
export function memberContext(key: string): string | null {
  if (!key.startsWith("[")) return null;
  try {
    const tuple: unknown = JSON.parse(key);
    return Array.isArray(tuple) && tuple.length === 2 && typeof tuple[0] === "string" && typeof tuple[1] === "string" && tuple[1] ? tuple[1] : null;
  } catch { return null; }
}
