/**
 * Qué pruebas toca un cambio, para `verify --quick`.
 *
 * El mapa sale de los imports de cada prueba y de las rutas que nombra. Un
 * archivo sin lugar en el mapa pide la cadena completa.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import ts from "typescript";

import { locateGit } from "./git.mjs";

const DESKTOP = "apps/desktop/";
const RUST = /^apps\/desktop\/(?:src-tauri\/|seldon-runtime\.lock$)/;
const FULL = /(?:^|\/)(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$|^apps\/desktop\/tests\/helpers\/|^apps\/desktop\/scripts\/(?:verify|verify-scope|git)\.mjs$/;
const OUTSIDE_CHAIN = /\.md$|^\.github\/|^apps\/mobile\/|^apps\/desktop\/(?:docs|release-notes|tests\/release|tests\/security)\//;
const MAPPED_CODE = /^apps\/desktop\/(?:src|scripts|alpha-entry|web-redirect)\//;
const MAPPED_TESTS = /^apps\/desktop\/tests\/(?:unit|perf)\//;
const EXTENSIONS = ["", ".ts", ".tsx", ".mjs", ".js", ".json", "/index.ts", "/index.tsx"];
const NAMED_PATH = /["'`](?:\.{1,2}\/)*((?:src|scripts|alpha-entry|web-redirect)\/[\w./-]*)/g;
const NAMES_BUILD = /["'`/]dist(?:-web)?\b/;

/** Los archivos que difieren de la base, con los de sin commitear y sin seguimiento; `{ reason }` si git no contesta. */
export function changedFiles(root, base) {
  const located = locateGit(root);
  if (!located.ok) return { reason: "git does not reach this tree" };
  const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, ...located.entorno } });
  try {
    const top = git(["rev-parse", "--show-toplevel"], root).trim();
    const mergeBase = git(["merge-base", base, "HEAD"], top).trim();
    const listed = git(["diff", "--name-only", "--no-renames", "-z", mergeBase], top) + git(["ls-files", "--others", "--exclude-standard", "-z"], top);
    return { mergeBase, files: [...new Set(listed.split("\0").filter(Boolean))].sort() };
  } catch {
    return { reason: `git could not compare against ${base}` };
  }
}

/** Reparte el cambio: `full` nombra lo que obliga a la cadena completa, `code` y `tests` pasan por el mapa. */
export function classify(files) {
  const groups = { full: [], rust: [], code: [], tests: [] };
  for (const file of files) {
    if (FULL.test(file)) groups.full.push(file);
    else if (RUST.test(file)) groups.rust.push(file);
    else if (OUTSIDE_CHAIN.test(file)) continue;
    else if (MAPPED_CODE.test(file)) groups.code.push(file);
    else if (MAPPED_TESTS.test(file)) groups.tests.push(file);
    else groups.full.push(file);
  }
  return groups;
}

const isFile = (path) => existsSync(path) && statSync(path).isFile();

function resolveImport(from, specifier) {
  const target = resolve(dirname(from), specifier.split("?")[0]);
  for (const extension of EXTENSIONS) if (isFile(target + extension)) return target + extension;
  return null;
}

/** Devuelve el lector memoizado de una prueba: lo que alcanza por imports y las rutas que nombran sus archivos fuera de `src/`. */
export function testReader(root) {
  const parsed = new Map();
  const parse = (path) => {
    if (parsed.has(path)) return parsed.get(path);
    const text = readFileSync(path, "utf8");
    const code = /\.(?:[cm]?[jt]s|tsx|jsx)$/.test(path);
    const imports = code ? ts.preProcessFile(text, true, true).importedFiles.map(({ fileName }) => fileName).filter((name) => name.startsWith(".")) : [];
    const entry = { imports: imports.map((name) => resolveImport(path, name)).filter(Boolean), text: code ? text : "" };
    parsed.set(path, entry);
    return entry;
  };
  return (entries) => {
    const reached = new Set();
    const pending = [...entries];
    while (pending.length) {
      const path = pending.pop();
      if (reached.has(path)) continue;
      reached.add(path);
      pending.push(...parse(path).imports);
    }
    const prefixes = new Set();
    let needsBuild = false;
    for (const path of reached) {
      if (relative(root, path).replaceAll("\\", "/").startsWith("src/")) continue;
      const { text } = parse(path);
      needsBuild ||= NAMES_BUILD.test(text);
      for (const [, named] of text.matchAll(NAMED_PATH)) prefixes.add(posix.normalize(named));
    }
    const files = new Set([...reached].map((path) => relative(root, path).replaceAll("\\", "/")));
    return { files, prefixes: [...prefixes], needsBuild };
  };
}

/** Si lo que una prueba alcanza incluye algún archivo de `changed`, rutas relativas a la raíz del repositorio. */
export function touches(reach, changed) {
  return changed.some((file) => {
    const local = file.startsWith(DESKTOP) ? file.slice(DESKTOP.length) : `../../${file}`;
    return reach.files.has(local) || reach.prefixes.some((prefix) => local === prefix || local.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
  });
}

/** Los archivos de un paso, con su `*.test.ts` expandido. */
export function stepFiles(args) {
  return args.filter((arg) => isAbsolute(arg) && /\.(?:ts|mjs)$/.test(arg)).flatMap((arg) => {
    if (!arg.includes("*")) return [arg];
    const dir = dirname(arg);
    return readdirSync(dir).filter((name) => name.endsWith(".test.ts")).map((name) => join(dir, name));
  });
}
