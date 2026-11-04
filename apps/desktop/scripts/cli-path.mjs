#!/usr/bin/env node
import { chmodSync, closeSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { delimiter, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MARK = "danil-cli-launcher:v1 ";
const NAMES = ["danil", "dn"];
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

export function launcher(target, kind) {
  if (/[\r\n\0]/.test(target)) throw new Error("Target contains a control character");
  const metadata = JSON.stringify({ target, kind });
  if (kind === "cmd") {
    if (target.includes('"')) throw new Error("Invalid Windows target");
    return `@rem ${MARK}${metadata}\r\n@echo off\r\nsetlocal DisableDelayedExpansion\r\n"${target.replaceAll("%", "%%")}" %*\r\nexit /b %errorlevel%\r\n`;
  }
  return `#!/bin/sh\n# ${MARK}${metadata}\nexec ${quote(/^[A-Za-z]:\\/.test(target) ? target.replaceAll("\\", "/") : target)} "$@"\n`;
}

function owned(content) {
  const line = content.split(/\r?\n/).find((row) => row.startsWith(`# ${MARK}`) || row.startsWith(`@rem ${MARK}`));
  if (!line) return false;
  try {
    const { target, kind } = JSON.parse(line.slice(line.indexOf(MARK) + MARK.length));
    return ["sh", "cmd"].includes(kind) && typeof target === "string" && launcher(target, kind) === content;
  } catch { return false; }
}

function existing(path) {
  try {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Foreign command: ${path}`);
    const content = readFileSync(path, "utf8");
    if (!owned(content)) throw new Error(`Foreign command: ${path}`);
    return content;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export function configure({ action, target, binDir, pathValue = process.env.PATH ?? "", platform = process.platform, pathExt = process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC", dryRun = false }) {
  if (!["install", "uninstall"].includes(action)) throw new Error("Expected install or uninstall");
  if (!isAbsolute(binDir)) throw new Error("--bin-dir must be absolute");
  const directory = resolve(binDir);
  let ancestor = directory;
  while (true) {
    try { lstatSync(ancestor); break; } catch (error) {
      if (error.code !== "ENOENT" || dirname(ancestor) === ancestor) throw error;
      ancestor = dirname(ancestor);
    }
  }
  if (realpathSync(ancestor) !== ancestor) throw new Error("--bin-dir must be a canonical directory");
  let executable;
  if (action === "install") {
    if (!target || !isAbsolute(target)) throw new Error("--target must be an absolute executable path");
    executable = realpathSync(target);
    const info = lstatSync(executable);
    if (!info.isFile() || (platform !== "win32" && !(info.mode & 0o111))) throw new Error("Target is not executable");
    if (NAMES.includes(executable.split(/[\\/]/).at(-1)?.replace(/\.(exe|cmd)$/i, "")) && owned(readFileSync(executable, "utf8"))) throw new Error("Target must be the CLI executable, not a managed launcher");
  }
  const files = NAMES.flatMap((name) => platform === "win32" ? [{ name, kind: "sh" }, { name: `${name}.cmd`, kind: "cmd" }] : [{ name, kind: "sh" }]);
  const changes = files.map(({ name, kind }) => {
    const path = join(directory, name);
    if (path === executable) throw new Error("Launcher cannot replace its target");
    return { path, before: existing(path), after: action === "install" ? launcher(executable, kind) : null };
  });
  if (action === "install") {
    const separator = platform === "win32" ? ";" : delimiter;
    const extensions = new Set([...pathExt.toLowerCase().split(";").filter(Boolean), ".ps1"]);
    const dirs = new Set([directory, ...(platform === "win32" ? [process.cwd()] : []), ...pathValue.split(separator).filter((part) => platform !== "win32" || part).map((part) => resolve(part || process.cwd()))]);
    for (const dir of dirs) {
      let names;
      try { names = readdirSync(dir); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
      for (const name of names) {
        const lower = name.toLowerCase();
        const extension = extname(lower);
        const base = platform === "win32" ? (extensions.has(extension) ? lower.slice(0, -extension.length) : lower) : name;
        if (!NAMES.includes(base)) continue;
        const path = join(dir, name);
        const expected = changes.find((change) => change.path === path);
        if (!expected || expected.before === null) throw new Error(`PATH collision: ${path}`);
      }
    }
  }
  if (!dryRun) {
    if (action === "install") mkdirSync(directory, { recursive: true });
    for (const change of changes) {
      if (change.before === change.after) continue;
      if (existing(change.path) !== change.before) throw new Error(`Command changed during operation: ${change.path}`);
      if (change.after === null) {
        if (change.before !== null) unlinkSync(change.path);
      } else if (change.before === null) {
        const fd = openSync(change.path, "wx", 0o755);
        try { writeFileSync(fd, change.after); } finally { closeSync(fd); }
      } else {
        const temporary = `${change.path}.${process.pid}.tmp`;
        const fd = openSync(temporary, "wx", 0o755);
        try {
          writeFileSync(fd, change.after);
          closeSync(fd);
          renameSync(temporary, change.path);
        } catch (error) { try { closeSync(fd); } catch {} try { unlinkSync(temporary); } catch {} throw error; }
      }
      if (change.after !== null && platform !== "win32") chmodSync(change.path, 0o755);
    }
  }
  return { action, dryRun, target: executable, files: changes.map(({ path }) => path), pathConfigured: pathValue.split(platform === "win32" ? ";" : delimiter).includes(directory) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.includes("--help")) {
      console.log("Danil CLI launchers (danil and dn)\nnode scripts/cli-path.mjs install --target ABSOLUTE_EXECUTABLE --bin-dir ABSOLUTE_DIRECTORY [--dry-run]\nnode scripts/cli-path.mjs uninstall --bin-dir ABSOLUTE_DIRECTORY [--dry-run]\nChecks danil/dn PATH collisions. Never edits shell profiles or installs the desktop app.");
    } else {
      const action = args.shift();
      const options = { action };
      while (args.length) {
        const arg = args.shift();
        if (arg === "--dry-run") options.dryRun = true;
        else if (["--target", "--bin-dir"].includes(arg) && args.length) options[arg === "--target" ? "target" : "binDir"] = args.shift();
        else throw new Error(`Unknown or incomplete option: ${arg}`);
      }
      console.log(JSON.stringify(configure(options), null, 2));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
