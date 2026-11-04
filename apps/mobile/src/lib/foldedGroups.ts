/** Los grupos de Inicio que la persona plegó, por `groupKey`. Se guardan como una lista JSON. */
export const FOLDED_KEY = "home.folded";

export function decodeFolded(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** La lista con `key` puesta o quitada; la original no se toca. */
export function toggleFolded(folded: readonly string[], key: string): string[] {
  return folded.includes(key) ? folded.filter((x) => x !== key) : [...folded, key];
}
