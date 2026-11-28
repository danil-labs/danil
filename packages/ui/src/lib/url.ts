/** Utilidades puras de validación y origen de URLs para marcos embebidos y enlaces externos. */

export function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function isSafeExternalUrl(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
