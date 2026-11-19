import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const oldRoute = /["'`]\/?auth\/account\/business(?:\/|["'`])/;
for (const dir of ["src", "alpha-entry"]) {
  const folder = join(root, dir);
  for (const entry of readdirSync(folder, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.[cm]?[jt]sx?$/.test(entry.name)) continue;
    const file = join(entry.parentPath, entry.name);
    if (readFileSync(file, "utf8").split("\n").some(line => !/^\s*(?:\*|\/\/)/.test(line) && oldRoute.test(line))) {
      console.error(`Legacy billing route in ${entry.name}`);
      process.exitCode = 1;
    }
  }
}
