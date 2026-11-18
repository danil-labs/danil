type Family = { family: string; email: string | null; contexts: readonly unknown[] };
/** El correo puede tener varias familias; la confirmación cuenta organizaciones conectadas en todas. */
export function emailContextCount(families: readonly Family[], email: string | null, fallback: string): number {
  const normalized = email?.trim().toLowerCase();
  return families.filter((f) => normalized ? f.email?.trim().toLowerCase() === normalized : f.family === fallback).reduce((n, f) => n + f.contexts.length, 0);
}
export function confirmEmailClose(count: number, message: (count: number) => string, confirm: (message: string) => boolean): boolean {
  return count <= 1 || confirm(message(count));
}
