import type { TreeFolder } from "@terminus/protocol";

/** Lo que hay dentro de una carpeta de un árbol: sus subcarpetas y sus archivos, ordenados por nombre. */
export type DirListing = { dirs: string[]; files: string[] };

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

/**
 * `dir` es la ruta de la carpeta sin barra final (`""` es la raíz). Las carpetas
 * salen de las rutas de los archivos y de `folders`, para no perder las vacías;
 * las ignoradas (`node_modules`, `.git`) no se enseñan.
 */
export function listDir(paths: readonly string[], folders: readonly TreeFolder[], dir: string): DirListing {
  const prefix = dir ? `${dir}/` : "";
  const ignored = folders.filter((folder) => folder.ignored).map((folder) => folder.path);
  const hidden = (path: string) => ignored.some((skip) => path === skip || path.startsWith(`${skip}/`));
  const dirs = new Set<string>();
  const files: string[] = [];
  for (const path of paths) {
    if (!path.startsWith(prefix) || hidden(path)) continue;
    const rest = path.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash < 0) files.push(rest);
    else dirs.add(rest.slice(0, slash));
  }
  for (const folder of folders) {
    if (folder.ignored || !folder.path.startsWith(prefix)) continue;
    const rest = folder.path.slice(prefix.length);
    if (!rest) continue;
    dirs.add(rest.split("/")[0]!);
  }
  return { dirs: [...dirs].sort(byName), files: files.sort(byName) };
}

/** `a/b/c.ts` → `c.ts`. */
export const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** `a/b` → `a`; `a` → `""`. */
export const parentOf = (dir: string) => dir.slice(0, Math.max(0, dir.lastIndexOf("/")));
