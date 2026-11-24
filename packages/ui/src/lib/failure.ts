import { clavesConocidas, t } from "./i18n.ts";
import { prosa, type Prosa } from "./prose.ts";

export type Failure = { what: Prosa; detail: string };

type Data = Record<string, string | number>;
const record = (e: unknown): e is Record<string, unknown> => e !== null && typeof e === "object";
const readable = (e: unknown): e is string =>
  typeof e === "string" && e.trim().length > 0 && !/\[object \w+\]/.test(e);
const whatOf = (e: unknown): unknown => {
  if (typeof e === "string" && clavesConocidas().has(`cli.error.${e}`)) return { clave: `cli.error.${e}` };
  if (!record(e)) return e;
  if ("what" in e) return e.what;
  if (typeof e.message_key === "string" && clavesConocidas().has(e.message_key)) return { clave: e.message_key };
  return e;
};

/** Texto para personas: con espacios, no una clave (`cli.error.x`) ni un código. */
const humano = (v: unknown): v is string => readable(v) && /\s/.test(v.trim());

/**
 * El motivo del rechazo del motor (`detail.reason`, `detail.recovery`, o `message` de una ficha plana),
 * cruda o envuelta por `proxy.rs` o el relay; sin esto se pinta solo la frase o «[object Object]».
 */
export function explicacionDelMotor(e: unknown): string | null {
  const niveles: Record<string, unknown>[] = [];
  let nivel: unknown = e;
  for (let i = 0; i < 3 && record(nivel); i++) {
    niveles.push(nivel);
    nivel = nivel.detail;
  }
  const primero = (campo: string, plano = false) => {
    for (const n of niveles) {
      if (plano && n instanceof Error) continue;
      if (humano(n[campo])) return (n[campo] as string).trim();
    }
    return null;
  };
  const partes = [primero("reason") ?? primero("message", true), primero("recovery")].filter(
    (p, i, all): p is string => !!p && all.indexOf(p) === i,
  );
  return partes.length ? partes.join("\n") : null;
}

/** La frase de la ventana seguida de la explicación del motor, sin repetirla. */
function conExplicacion(what: Prosa, e: unknown): Prosa {
  const extra = explicacionDelMotor(e);
  if (!extra) return what;
  const texto = prosa(what);
  return texto.includes(extra) ? texto : `${texto}\n${extra}`;
}

/** El diagnóstico conserva los objetos y los Error sin depender de su toString. */
function diagnostic(e: unknown): string {
  if (typeof e === "string") return readable(e) ? e : "";
  if (e == null) return "";
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(e, (_key, value: unknown) => {
      if (typeof value === "bigint") return value.toString();
      if (!record(value)) return value;
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
      return value instanceof Error ? { ...value, message: value.message, stack: value.stack, cause: value.cause } : value;
    }) ?? "";
  } catch {
    return "";
  }
}

function phrase(e: unknown, datos?: Data): Prosa | null {
  const clave = claveDe(e);
  if (!clave) return readable(e) ? e : null;
  const supplied = record(e) && record(e.datos)
    ? Object.fromEntries(Object.entries(e.datos).filter(([, v]) =>
        typeof v === "string" || typeof v === "number",
      )) as Data : undefined;
  return { clave, datos: { ...supplied, ...datos } };
}

/** Una estructura inesperada nunca sustituye la explicación por su coerción a texto. */
export function asFailure(e: unknown, datos?: Data): Failure {
  const envelope = record(e) && "what" in e;
  const what = (envelope || claveDe(e)) && phrase(whatOf(e), datos);
  return {
    what: what ? conExplicacion(what, e) : { clave: "common.failure.generic" },
    detail: diagnostic(envelope ? e.detail : e),
  };
}

export function prosaDe(e: unknown, datos?: Data): string {
  const what = phrase(whatOf(e), datos);
  if (what) return prosa(conExplicacion(what, e));
  const fallback = t("common.failure.generic");
  const extra = explicacionDelMotor(e) ?? (record(e) && readable(e.message) ? e.message : null);
  return extra ? `${extra}\n${fallback}` : fallback;
}

export function detalleDe(e: unknown): string {
  const failure = asFailure(e);
  return failure.detail || prosa(failure.what);
}

/** La clave se conserva para decidir reintentos y acciones, sin depender del idioma. */
export function claveDe(e: unknown): string | null {
  const what = whatOf(e);
  const clave = record(what) ? what.clave : what;
  return typeof clave === "string" && clavesConocidas().has(clave) ? clave : null;
}
