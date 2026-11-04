/**
 * Apunta `core.hooksPath` a `.githooks` en este clon.
 *
 * Corre desde `pnpm install` (prepare) y desde `pnpm hooks:install`. Si no hay
 * git, no hace nada: el hook es una ayuda, no un requisito. Un `core.hooksPath`
 * ajeno se respeta; `--force` lo reemplaza.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const HOOKS_PATH = ".githooks";

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

/** Lo que hizo, en una línea por mensaje; nunca falla la instalación. */
export function installHooks({ cwd, force = false }) {
  try {
    git(["rev-parse", "--show-toplevel"], cwd);
  } catch {
    return { installed: false, lines: ["hooks: git is not available; nothing installed"] };
  }
  let current = "";
  try {
    current = git(["config", "--get", "core.hooksPath"], cwd).trim();
  } catch {
    // Sin valor: `git config --get` sale con 1.
  }
  if (current && current !== HOOKS_PATH && !force) {
    return {
      installed: false,
      lines: [
        `hooks: core.hooksPath is already ${current}; left as is, so the pre-push check does not run.`,
        `hooks: to use this repo's hooks, run \`pnpm hooks:install --force\` or \`git config core.hooksPath ${HOOKS_PATH}\`.`,
      ],
    };
  }
  try {
    git(["config", "core.hooksPath", HOOKS_PATH], cwd);
  } catch {
    return { installed: false, lines: ["hooks: git could not write core.hooksPath; nothing installed"] };
  }
  const replaced = current && current !== HOOKS_PATH ? ` (was ${current})` : "";
  return { installed: true, lines: [`hooks: core.hooksPath=${HOOKS_PATH}${replaced}`] };
}

if (process.argv[1]?.endsWith("install-hooks.mjs")) {
  const repo = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const { lines } = installHooks({ cwd: repo, force: process.argv.includes("--force") });
  for (const line of lines) console.log(line);
}
