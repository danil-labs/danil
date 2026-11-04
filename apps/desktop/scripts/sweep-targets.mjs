#!/usr/bin/env node
/**
 * Barre las `target/` de worktrees sin uso. Solo Linux: lee `/proc`.
 *
 *   node scripts/sweep-targets.mjs --root <carpeta de worktrees>           solo lista
 *   node scripts/sweep-targets.mjs --root <carpeta de worktrees> --apply   además borra
 *
 * Una target se borra si nada la tocó en 24 h (`--hours`) y ningún cargo o rustc
 * trabaja en su worktree. Un proceso de compilación ilegible detiene el borrado.
 */
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync, readlinkSync, rmSync } from "node:fs";
import { basename, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const BUILDERS = /^(cargo|rustc|rustdoc|clippy-driver)/;
const SKIPPED_DIRS = new Set(["node_modules", ".git", "dist"]);
const MAX_DEPTH = 6;
const PS_TIMEOUT_MS = 30_000;
const HOUR_MS = 60 * 60_000;
const GIB = 1024 ** 3;

const within = (path, dir) => path === dir || path.startsWith(`${dir}${sep}`);

function listDir(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function findTargets(dir, depth = 0) {
  const found = [];
  for (const entry of listDir(dir)) {
    if (!entry.isDirectory() || SKIPPED_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.name === "target" && listDir(path).some((child) => child.name === "CACHEDIR.TAG")) found.push(path);
    else if (depth < MAX_DEPTH) found.push(...findTargets(path, depth + 1));
  }
  return found;
}

/** Fecha de escritura o, en un archivo, de lectura: una prueba solo lee sus binarios. */
function usage(dir) {
  const totals = { lastUsedMs: 0, bytes: 0 };
  for (const entry of listDir(dir)) {
    const path = join(dir, entry.name);
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat) continue;
    totals.lastUsedMs = Math.max(totals.lastUsedMs, stat.mtimeMs, entry.isFile() ? stat.atimeMs : 0);
    totals.bytes += stat.blocks * 512;
    if (entry.isDirectory()) {
      const inner = usage(path);
      totals.lastUsedMs = Math.max(totals.lastUsedMs, inner.lastUsedMs);
      totals.bytes += inner.bytes;
    }
  }
  return totals;
}

function readProc(pid) {
  const link = (name) => {
    try {
      return readlinkSync(`/proc/${pid}/${name}`);
    } catch {
      return null;
    }
  };
  const file = (name) => {
    try {
      return readFileSync(`/proc/${pid}/${name}`, "utf8").split("\0");
    } catch {
      return [];
    }
  };
  return { pid, cwd: link("cwd"), exe: link("exe"), args: file("cmdline"), env: file("environ") };
}

/** Procesos vivos según `ps`, cada uno con su `/proc`. */
export function processes() {
  const result = spawnSync("ps", ["-eo", "pid=,comm="], { encoding: "utf8", timeout: PS_TIMEOUT_MS, killSignal: "SIGKILL" });
  if (result.status !== 0) throw new Error(`ps falló: ${result.stderr || result.error?.message}`);
  return result.stdout.trim().split("\n").map((line) => {
    const [pid, comm] = line.trim().split(/\s+/, 2);
    return { ...readProc(pid), comm };
  });
}

/** Devuelve el pid que retiene esta target, o null. */
function holder(target, worktree, running) {
  for (const proc of running) {
    if (proc.exe && within(proc.exe, target)) return proc.pid;
    if (proc.cwd && within(proc.cwd, target)) return proc.pid;
    if (!BUILDERS.test(proc.comm)) continue;
    if (!proc.cwd) return proc.pid;
    if (within(proc.cwd, worktree)) return proc.pid;
    if (proc.args.some((arg) => arg.includes(target))) return proc.pid;
    if (proc.env.some((line) => line.startsWith("CARGO_TARGET_DIR=") && within(line.slice("CARGO_TARGET_DIR=".length), target))) return proc.pid;
  }
  return null;
}

export function scan(root, { hours = 24, now = Date.now(), running = processes() } = {}) {
  const rows = [];
  for (const entry of listDir(root)) {
    if (!entry.isDirectory()) continue;
    const worktree = join(root, entry.name);
    for (const target of findTargets(worktree)) {
      const { lastUsedMs, bytes } = usage(target);
      const heldBy = holder(target, worktree, running);
      rows.push({ worktree, target, lastUsedMs, bytes, heldBy, stale: now - lastUsedMs > hours * HOUR_MS });
    }
  }
  return rows.sort((a, b) => b.bytes - a.bytes);
}

export function sweep(root, options = {}) {
  const rows = scan(root, options);
  const deleted = [];
  for (const row of rows.filter((candidate) => candidate.stale && candidate.heldBy === null)) {
    const fresh = options.running ?? processes();
    if (holder(row.target, row.worktree, fresh) !== null) continue;
    rmSync(row.target, { recursive: true, force: true });
    deleted.push(row.target);
  }
  return { rows, deleted };
}

function main() {
  const argv = process.argv.slice(2);
  const value = (flag) => {
    const index = argv.indexOf(flag);
    return index < 0 ? undefined : argv[index + 1];
  };
  const root = value("--root");
  if (!root) {
    console.error("Uso: sweep-targets.mjs --root <carpeta de worktrees> [--hours 24] [--apply]");
    return 2;
  }
  const hours = Number(value("--hours") ?? 24);
  const apply = argv.includes("--apply");
  const { rows, deleted } = apply ? sweep(root, { hours }) : { rows: scan(root, { hours }), deleted: [] };
  const verdict = (row) => {
    if (deleted.includes(row.target)) return "BORRADA";
    if (row.heldBy !== null) return `en uso (pid ${row.heldBy})`;
    return row.stale ? (apply ? "se conservó" : "se borraría") : "reciente";
  };
  for (const row of rows) console.log(`${(row.bytes / GIB).toFixed(1).padStart(7)} GiB  ${new Date(row.lastUsedMs).toISOString().slice(0, 16)}  ${verdict(row).padEnd(20)} ${basename(row.worktree)}  ${row.target}`);
  const gib = rows.filter((row) => row.stale && row.heldBy === null).reduce((sum, row) => sum + row.bytes, 0) / GIB;
  console.log(`${rows.length} targets; ${apply ? "liberado" : "se liberarían"} ${gib.toFixed(1)} GiB.`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
