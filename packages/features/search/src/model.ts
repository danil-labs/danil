import type { EngineClient } from "@danil/engine-client";
import { clavesConocidas, t } from "@danil/ui/i18n";

// Derivación de tipos de EngineClient (R2)
export type RawArchivedTasksOutput = Awaited<ReturnType<EngineClient["archived_tasks"]>>;

export type SearchFilter = "all" | "tasks" | "archived" | "folders" | "actions";
export type Group = Exclude<SearchFilter, "all">;

export interface SpaceRef {
  id: string;
  name: string | null;
  deleted?: boolean;
}

export interface Space {
  id: string;
  name: string | null;
  folders?: string[];
  [key: string]: unknown;
}

export interface Project {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface SessionRow {
  id: string;
  title: string;
  last_message?: string | null;
  agent?: string | null;
  folder?: string;
  space?: string | null;
  updated_at: number;
  [key: string]: unknown;
}

export interface Archivadas {
  tasks: (SessionRow & { folder: string })[];
  spaces: SpaceRef[];
}

export interface Result {
  key: string;
  group: Group;
  title: string;
  detail: string;
  deleted?: boolean;
  run: () => void;
}

export const GROUPS: Group[] = ["tasks", "archived", "folders", "actions"];
export const PER_GROUP = 5;
export const RECENT = 8;

export const spaceName = (i: { name: string | null } | null | undefined): string =>
  i?.name ?? t("spaces.default_name");

const fold = (text: string): string => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Cada palabra de la búsqueda aparece en algún campo, sin importar acentos, mayúsculas ni orden. */
export function matchesTaskQuery(fields: (string | null | undefined)[], query: string): boolean {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = fields.map((field) => fold(field ?? "")).join("\n");
  return terms.every((term) => haystack.includes(term));
}

export type Frase = {
  clave: string;
  datos?: Record<string, string | number>;
};

export type Prosa = string | Frase;

export function prosa(p: Prosa): string {
  if (typeof p === "string") return p;
  return t(p.clave, p.datos);
}

export interface Failure {
  what: Prosa;
  detail: string;
}

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

const humano = (v: unknown): v is string => readable(v) && /\s/.test(v.trim());

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

export function claveDe(e: unknown): string | null {
  const what = whatOf(e);
  const clave = record(what) ? what.clave : what;
  return typeof clave === "string" && clavesConocidas().has(clave) ? clave : null;
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

function conExplicacion(what: Prosa, e: unknown): Prosa {
  const extra = explicacionDelMotor(e);
  if (!extra) return what;
  const texto = prosa(what);
  return texto.includes(extra) ? texto : `${texto}\n${extra}`;
}

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

/** Una estructura inesperada nunca sustituye la explicación por su coerción a texto. */
export function asFailure(e: unknown, datos?: Data): Failure {
  const envelope = record(e) && "what" in e;
  const what = (envelope || claveDe(e)) && phrase(whatOf(e), datos);
  return {
    what: what ? conExplicacion(what, e) : { clave: "common.failure.generic" },
    detail: diagnostic(envelope ? e.detail : e),
  };
}
