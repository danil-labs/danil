import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { ROOT, walkFiles } from "../git.mjs";

const root = process.argv[2] ? resolve(process.argv[2]) : ROOT;
const forbidden = /service[_-]role|\/rest\/v1|supabase-js|DANIL_WEB_(?:SESSION|INBOX)|APPV2_BFF|service\s*=\s*"appv2"/i;
const violations = [];
if (forbidden.test(readFileSync(join(root, "package.json"), "utf8"))) violations.push("package.json");
for (const dir of ["src/web", "alpha-entry"]) {
  for (const file of walkFiles(join(root, dir), [".ts", ".tsx", ".mjs", ".toml"])) {
    if (file.endsWith(".test.mjs")) continue;
    if (forbidden.test(readFileSync(file, "utf8"))) violations.push(relative(root, file));
  }
}
if (violations.length) {
  console.error(`Forbidden legacy web dependencies: ${violations.join(", ")}`);
  process.exitCode = 1;
} else console.log("Web: edge session; no database credentials or direct database clients.");
