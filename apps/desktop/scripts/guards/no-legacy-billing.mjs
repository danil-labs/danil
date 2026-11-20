import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { isMain } from "../git.mjs";

const oldRoute = /(?:^|\/)auth\/account\/business(?=\/|[?#]|$)/;
const ignoredDirectories = new Set(["node_modules", "dist", "coverage", ".git"]);

function* sources(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) yield* sources(file);
    if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name)) yield file;
  }
}

function containsLegacyRoute(file) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest);
  const visit = node => {
    if ((ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) && oldRoute.test(node.text)) return true;
    return ts.forEachChild(node, visit);
  };
  return visit(source);
}

export function legacyBillingRoutes(root) {
  const paths = [];
  for (const dir of ["apps/desktop/src", "apps/desktop/alpha-entry", "packages"]) {
    for (const file of sources(join(root, dir))) {
      if (containsLegacyRoute(file)) paths.push(relative(root, file).replaceAll("\\", "/"));
    }
  }
  return paths;
}

if (isMain(import.meta.url)) {
  for (const file of legacyBillingRoutes(join(import.meta.dirname, "../../../.."))) {
    console.error(`Legacy billing route in ${file}`);
    process.exitCode = 1;
  }
}
