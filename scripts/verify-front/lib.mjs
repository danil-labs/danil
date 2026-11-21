import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const ROOT = join(import.meta.dirname, "..", "..");
const APPS = ["workspace", "auth", "desk"];
const PKGS = ["ui", "platform-client", "engine-client", "session", "host", "shell"];
const SKIP = new Set(["node_modules", "dist", "build", ".turbo", "target"]);

export const slash = (p) => p.split(sep).join("/");

function walk(dir, out) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
}

/** Reemplaza comentarios por espacios (conserva líneas) respetando strings. */
export function stripComments(text) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") { out += n ?? ""; i += 2; continue; }
      if (c === quote) quote = null;
      i++;
    } else if (c === '"' || c === "'" || c === "`") {
      quote = c; out += c; i++;
    } else if (c === "/" && n === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c === "/" && n === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) { out += text[i] === "\n" ? "\n" : " "; i++; }
      i += 2;
    } else { out += c; i++; }
  }
  return out;
}

/** Archivos del alcance del front nuevo: { path (relativo, con /), text, code, lines, codeLines }. */
export function loadFiles() {
  const abs = [];
  for (const a of APPS) walk(join(ROOT, "apps", a), abs);
  for (const p of PKGS) walk(join(ROOT, "packages", p), abs);
  walk(join(ROOT, "packages", "features"), abs);
  return abs.sort().map((f) => {
    const text = readFileSync(f, "utf8");
    const code = stripComments(text);
    return { path: slash(relative(ROOT, f)), text, code, lines: text.split("\n"), codeLines: code.split("\n") };
  });
}

/** Feature a la que pertenece el archivo, o null. */
export const featureOf = (path) => /^packages\/features\/([^/]+)\//.exec(path)?.[1] ?? null;
export const inGenerated = (path) => /^packages\/[^/]+\/src\/generated\//.test(path);

export function scan(files, filter, regex, reason, skipLine) {
  const v = [];
  for (const f of files) {
    if (!filter(f)) continue;
    f.codeLines.forEach((line, i) => {
      if (regex.test(line) && !(skipLine && skipLine(f, line))) v.push({ path: f.path, line: i + 1, reason: typeof reason === "function" ? reason(line) : reason });
    });
  }
  return v;
}
