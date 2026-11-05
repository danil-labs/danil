/**
 * Lo del pegado protegido del compositor, fuera de la carga inicial: el chat
 * lo pide al montarse (`Chat.tsx`).
 */
import { secretFamilyOf, type SecretFamily } from "./secretScan.ts";

const PEM = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z0-9 ]*PRIVATE KEY-----/;

export type SecretMatch = { value: string; family: SecretFamily; start: number; end: number };

/**
 * El secreto de un texto pegado. Una llave privada PEM o un token de prefijo,
 * JWT o URL con credenciales se reconocen dentro de una frase; la alta
 * entropía solo cuando lo pegado es ese único token.
 */
export function findPastedSecret(text: string): SecretMatch | null {
  const pem = PEM.exec(text);
  if (pem) return { value: pem[0], family: "pem", start: pem.index, end: pem.index + pem[0].length };
  const trimmed = text.trim();
  if (trimmed && !/\s/.test(trimmed)) {
    const family = secretFamilyOf(trimmed);
    if (!family) return null;
    const start = text.indexOf(trimmed);
    return { value: trimmed, family, start, end: start + trimmed.length };
  }
  for (const m of text.matchAll(/[^\s"'`<>()[\]{},;]+/g)) {
    const family = secretFamilyOf(m[0]);
    if (family && family !== "entropy") return { value: m[0], family, start: m.index, end: m.index + m[0].length };
  }
  return null;
}

/** El nombre que propone el chip; la persona lo cambia antes de guardar. */
export function suggestSecretName(match: Pick<SecretMatch, "value" | "family">): string {
  const v = match.value;
  if (match.family === "pem") return "PRIVATE_KEY";
  if (match.family === "jwt") return "JWT_TOKEN";
  if (match.family === "url") return "SERVICE_URL";
  if (v.startsWith("sk-ant-")) return "ANTHROPIC_KEY";
  if (v.startsWith("sk-")) return "OPENAI_KEY";
  if (/^gh[opsur]_|^github_pat_/.test(v)) return "GITHUB_PAT";
  if (v.startsWith("glpat-")) return "GITLAB_TOKEN";
  if (v.startsWith("xox")) return "SLACK_TOKEN";
  if (/^(?:AKIA|ASIA)/.test(v)) return "AWS_ACCESS_KEY_ID";
  if (/^(?:sk|rk)_(?:live|test)_/.test(v)) return "STRIPE_KEY";
  if (v.startsWith("AIza")) return "GOOGLE_KEY";
  return "API_KEY";
}

/** Un pegado retenido: dónde iba en el campo y qué texto lo rodeaba. El valor no sale de aquí hasta guardarse. */
export type HeldPaste = { match: SecretMatch; pasted: string; start: number; end: number };

/** El campo después de guardar: lo pegado con `$NOMBRE` en lugar del valor. */
export function textWithSecretName(input: string, held: HeldPaste, name: string): { text: string; caret: number } {
  const inserted = `${held.pasted.slice(0, held.match.start)}$${name}${held.pasted.slice(held.match.end)}`;
  const text = input.slice(0, held.start) + inserted + input.slice(held.end);
  return { text, caret: held.start + inserted.length };
}
