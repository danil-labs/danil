/**
 * Reconocer un valor secreto en texto que la persona pega o que el motor
 * devuelve como dato de máquina. Es una heurística: un falso positivo se
 * resuelve con «Pegar como texto»; un falso negativo deja el texto como hoy.
 */
import { urlWithCredentials } from "@terminus/computers";

export type SecretFamily = "prefix" | "jwt" | "pem" | "entropy" | "url";

/** Prefijos publicados por cada proveedor; el resto del valor debe tener cuerpo de llave. */
const PREFIXES: RegExp[] = [
  /^sk-ant-[A-Za-z0-9_-]{20,}$/,
  /^sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}$/,
  /^gh[opsur]_[A-Za-z0-9]{30,}$/,
  /^github_pat_[A-Za-z0-9_]{30,}$/,
  /^glpat-[A-Za-z0-9_-]{20,}$/,
  /^xox[abpors]-[A-Za-z0-9-]{10,}$/,
  /^(?:AKIA|ASIA)[A-Z0-9]{16}$/,
  /^(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}$/,
  /^AIza[A-Za-z0-9_-]{35}$/,
];

const JWT = /^eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;
const PEM = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z0-9 ]*PRIVATE KEY-----/;
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_CHARS = /^[A-Za-z0-9+/=_.~-]+$/;
const ENTROPY_MIN_LENGTH = 20;
const ENTROPY_MIN_BITS = 3.5;
/** Nombres de campo o bandera que delatan que lo que sigue es un secreto. */
const SENSITIVE_NAME = /(?:^|[_-])(?:token|key|secret|password|passwd|pwd|auth|authorization|bearer|credential|credentials|apikey|api-key|api_key|access-key|private)(?:$|[_-])/i;

function bitsPerChar(text: string): number {
  const counts = new Map<string, number>();
  for (const c of text) counts.set(c, (counts.get(c) ?? 0) + 1);
  let bits = 0;
  for (const n of counts.values()) {
    const p = n / text.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/** Un solo token (sin espacios): de qué familia de secreto es, o `null`. */
export function secretFamilyOf(token: string): SecretFamily | null {
  const value = token.trim();
  if (!value || /\s/.test(value)) return null;
  if (PREFIXES.some((p) => p.test(value))) return "prefix";
  if (JWT.test(value)) return "jwt";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return urlWithCredentials(value) ? "url" : null;
  if (SHA.test(value) || UUID.test(value)) return null;
  if (value.length < ENTROPY_MIN_LENGTH || !TOKEN_CHARS.test(value)) return null;
  // Una ruta (`/usr/…`, `./a/b`, `src/lib/x.ts`) o un nombre con puntos no es una llave.
  // La llave secreta de AWS lleva `/`: una ruta se reconoce por sus partes en minúsculas.
  if (/^[~./]/.test(value) || /^[a-z0-9._-]+(?:\/[a-z0-9._-]+)+\/?$/.test(value) || /\.[a-z]{1,5}$/i.test(value)) return null;
  if (!/[0-9]/.test(value) || !/[A-Za-z]/.test(value)) return null;
  return bitsPerChar(value) >= ENTROPY_MIN_BITS ? "entropy" : null;
}

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

export const MASK = "•••";

/**
 * `detalle` de un servidor MCP (la URL o el comando que manda el motor) sin
 * ningún valor que parezca secreto: sin usuario ni query en la URL, y con los
 * argumentos tras una bandera sensible o con cara de llave tapados.
 */
export function maskServerSource(source: string): string {
  const text = source.trim();
  if (!text) return text;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) && !/\s/.test(text)) {
    try {
      const url = new URL(text);
      const path = url.pathname
        .split("/")
        .map((part) => (part && (secretFamilyOf(part) || SENSITIVE_NAME.test(part)) ? MASK : part))
        .join("/");
      return `${url.protocol}//${url.host}${path === "/" && !text.endsWith("/") ? "" : path}${url.search ? `?${MASK}` : ""}`;
    } catch {
      return MASK;
    }
  }
  const words = text.split(/\s+/);
  let hideNext = false;
  return words
    .map((raw) => {
      if (hideNext) {
        hideNext = false;
        return MASK;
      }
      const word = raw.replace(/^["'`]+|["'`]+$/g, "");
      if (/^(?:bearer|basic|token)$/i.test(word)) {
        hideNext = true;
        return raw;
      }
      const assign = /^(-{0,2})([A-Za-z0-9_.-]+)=(.*)$/.exec(word);
      if (assign) {
        const [, dashes, name, value] = assign;
        if (value && (SENSITIVE_NAME.test(name) || secretFamilyOf(value))) return `${dashes}${name}=${MASK}`;
        return raw;
      }
      if (/^-{1,2}[A-Za-z]/.test(word) && SENSITIVE_NAME.test(word.replace(/^-+/, ""))) {
        hideNext = true;
        return raw;
      }
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(word)) return maskServerSource(word);
      return secretFamilyOf(word) ? MASK : raw;
    })
    .join(" ");
}

