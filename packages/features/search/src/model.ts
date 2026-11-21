import type { EngineClient } from "@danil/engine-client";
import { t } from "@danil/ui/i18n";

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

export function failureWhat(err: unknown): string {
  if (!err) return "";
  if (typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return String(err);
}

export function failureDetail(err: unknown): string | undefined {
  if (typeof err === "object" && err !== null && "detail" in err) {
    const d = (err as { detail: unknown }).detail;
    return typeof d === "string" ? d : JSON.stringify(d);
  }
  return undefined;
}
