import type { MemoryFileRef } from "../../../../platform-client/src/memory.ts";

/** El alcance de una carpeta de memoria, como lo nombra el motor. */
export type MemoryScope = { kind: "workspace" } | { kind: "project" } | { kind: "agent"; name: string };

/**
 * Las carpetas del repo donde puede vivir la memoria de ese alcance visto desde
 * un proyecto. Un encargado puede ser del proyecto o del workspace: se prueban
 * las dos, primero la del proyecto.
 */
export function memoryDirs(project: string, scope: MemoryScope): string[] {
  if (scope.kind === "workspace") return ["memory/"];
  if (scope.kind === "project") return [`projects/${project}/memory/`];
  return [`projects/${project}/agents/${scope.name}/memory/`, `agents/${scope.name}/memory/`];
}

/** Solo las entradas directas de una carpeta (sin el índice ni subcarpetas). */
export function entriesIn(files: MemoryFileRef[], dir: string): MemoryFileRef[] {
  return files.filter((f) => f.path.startsWith(dir) && !f.path.slice(dir.length).includes("/") && f.path.endsWith(".md") && !f.path.endsWith("/MEMORY.md"));
}

const CONFLICT_RE = /^(.*)\.conflicto-([a-z0-9]+(?:-[a-z0-9]+)*?)(?:-(\d+))?\.md$/;

/**
 * Si el nombre es la copia que dejó un conflicto (`<base>.conflicto-<quién>[-n].md`),
 * de qué entrada es y quién la había escrito; si no, null.
 */
export function conflictCopyOf(file: string): { original: string; who: string } | null {
  const name = file.slice(file.lastIndexOf("/") + 1);
  const m = CONFLICT_RE.exec(name);
  if (!m) return null;
  return { original: `${file.slice(0, file.lastIndexOf("/") + 1)}${m[1]}.md`, who: m[2] as string };
}

/** Una entrada leída: el frontmatter que usa el motor (`type`, `modified`, `origin`) y el cuerpo. */
export type MemoryEntryText = {
  type: string | null;
  modified: string | null;
  origin: Record<string, string>;
  body: string;
};

/** Lee el frontmatter YAML sencillo del motor; un archivo sin él es todo cuerpo. */
export function parseMemoryEntry(raw: string): MemoryEntryText {
  const out: MemoryEntryText = { type: null, modified: null, origin: {}, body: raw };
  const lines = raw.split("\n");
  if (lines[0]?.trim() !== "---") return out;
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (close < 0) return out;
  let inOrigin = false;
  for (const line of lines.slice(1, close)) {
    const nested = /^\s+([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (inOrigin && nested) {
      out.origin[nested[1] as string] = (nested[2] as string).trim();
      continue;
    }
    inOrigin = false;
    const top = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (!top) continue;
    const [, key, value] = top as unknown as [string, string, string];
    if (key === "origin" && !value.trim()) inOrigin = true;
    else if (key === "type") out.type = value.trim() || null;
    else if (key === "modified") out.modified = value.trim() || null;
  }
  out.body = lines
    .slice(close + 1)
    .join("\n")
    .replace(/^\n+/, "");
  return out;
}

/**
 * Arma el archivo de una entrada escrita a mano desde la web o el teléfono, con
 * el frontmatter que lee el motor (`from_markdown`: exige `modified`). Sin
 * `agent` en `origin`: la escribió la persona.
 */
export function memoryEntryText(entry: { type: string | null; body: string; workspace: string; project: string; now?: Date }): string {
  const header = ["---"];
  const kind = (entry.type ?? "").trim();
  if (kind) header.push(`type: ${kind}`);
  header.push(`modified: ${(entry.now ?? new Date()).toISOString().replace(/\.\d{3}Z$/, "Z")}`);
  header.push("origin:", `  workspace: ${entry.workspace}`, `  project: ${entry.project}`);
  header.push("---", "");
  const body = entry.body.trim();
  return `${header.join("\n")}\n${body}\n`;
}
