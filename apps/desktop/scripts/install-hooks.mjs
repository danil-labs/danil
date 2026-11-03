/**
 * Apunta `core.hooksPath` a `.githooks` en este clon.
 *
 * Corre desde `pnpm install` (prepare) y desde `pnpm hooks:install`. Si no hay
 * git, no hace nada: el hook es una ayuda, no un requisito.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../../..");

try {
  execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { cwd: repo, stdio: "ignore" });
  console.log("hooks: core.hooksPath=.githooks");
} catch {
  console.log("hooks: git is not available; nothing installed");
}
