#!/usr/bin/env node
/**
 * `pre-push`: lint y tipos de lo que se empuja, en segundos.
 *
 * Falla cerrado ante un error de lint o de tipos; falla abierto si falta una
 * herramienta o no puede comparar la base. `SKIP_HOOKS=1` lo salta.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { lowerPriority } from "./priority.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = join(here, "..");
const repo = join(here, "../../..");
const ZERO = /^0+$/;
const CODE = /^apps\/desktop\/(?:src|scripts|tests)\/.+\.(?:[cm]?[jt]s|tsx|jsx)$/;
const SOURCE = /^apps\/desktop\/src\/.+\.(?:[cm]?[jt]s|tsx|jsx)$|^packages\/.+\.(?:[cm]?[jt]s|tsx|jsx)$/;
const RUST = /^apps\/desktop\/src-tauri\/.+\.rs$/;

const git = (args, cwd = repo) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

/** Las líneas que git manda: `<ref local> <sha local> <ref remoto> <sha remoto>`. */
export function pushedRanges(text) {
  return text.split("\n").filter(Boolean).flatMap((line) => {
    const fields = line.trim().split(/\s+/);
    const [, local, , remote] = fields;
    if (!local || !remote || ZERO.test(local)) return [];
    return [{ local, remote }];
  });
}

function known(sha, cwd) {
  try {
    git(["cat-file", "-e", `${sha}^{commit}`], cwd);
    return true;
  } catch {
    return false;
  }
}

/** La base del empuje: el sha remoto, o el merge-base con dev/main si la rama es nueva. */
export function baseOf({ local, remote }, cwd = repo) {
  if (!ZERO.test(remote) && known(remote, cwd)) return remote;
  for (const branch of ["origin/dev", "origin/main"]) {
    try {
      return git(["merge-base", local, branch], cwd).trim();
    } catch {
      // Esa rama no existe en este clon.
    }
  }
  return null;
}

/** Los archivos del empuje, o `null` si no hay con qué compararlo. */
export function changedPaths(text, cwd = repo) {
  const ranges = pushedRanges(text);
  if (ranges.length === 0) return [];
  const files = new Set();
  for (const range of ranges) {
    const base = baseOf(range, cwd);
    if (!base) return null;
    const listed = git(["diff", "--name-only", "--no-renames", base, range.local], cwd);
    for (const file of listed.split("\n").filter(Boolean)) files.add(file);
  }
  return [...files];
}

function run(command, args, cwd) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    lowerPriority(child.pid);
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", (error) => resolve({ ok: false, seconds: 0, output: error.message, missing: true }));
    child.on("close", (status) => resolve({ ok: status === 0, seconds: (Date.now() - started) / 1000, output }));
  });
}

async function main() {
  if (/^(1|true|yes)$/i.test(process.env.SKIP_HOOKS ?? "")) {
    console.log("pre-push: SKIP_HOOKS set, nothing checked.");
    return 0;
  }

  let files;
  try {
    files = changedPaths(readFileSync(0, "utf8"));
  } catch (error) {
    console.log(`pre-push: cannot read the push (${error.message}); nothing checked.`);
    return 0;
  }
  if (files === null) {
    console.log("pre-push: no base to compare against; nothing checked.");
    return 0;
  }
  if (files.length === 0) return 0;

  const present = (file) => existsSync(join(repo, file));
  const lint = files.filter((file) => CODE.test(file) && present(file)).map((file) => relative(desktop, join(repo, file)).replaceAll("\\", "/"));
  const typecheck = files.some((file) => SOURCE.test(file) && present(file));
  const rust = files.some((file) => RUST.test(file) && present(file));

  const checks = [];
  const biome = join(desktop, "node_modules/@biomejs/biome/bin/biome");
  if (lint.length > 0 && existsSync(biome)) {
    checks.push(["biome", run(process.execPath, [biome, "lint", "--no-errors-on-unmatched", ...lint], desktop)]);
  }
  const tsc = join(desktop, "node_modules/typescript/bin/tsc");
  if (typecheck && existsSync(tsc)) checks.push(["tsc", run(process.execPath, [tsc, "-b", "--pretty", "false"], desktop)]);
  if (rust) checks.push(["cargo fmt", run("cargo", ["fmt", "--check", "--", "--config-path", "rustfmt.toml"], join(desktop, "src-tauri"))]);

  if (checks.length === 0) return 0;

  const started = Date.now();
  const results = await Promise.all(checks.map(async ([name, pending]) => [name, await pending]));
  const total = ((Date.now() - started) / 1000).toFixed(1);
  const failed = results.filter(([, result]) => !result.ok && !result.missing);

  for (const [name, result] of results) {
    if (result.missing) console.log(`pre-push: ${name} is not installed; skipped.`);
    else console.log(`pre-push: ${name.padEnd(8)} ${result.ok ? "ok" : "FAILED"} ${result.seconds.toFixed(1)}s`);
  }

  if (failed.length === 0) {
    console.log(`pre-push: ${checks.length} check${checks.length === 1 ? "" : "s"} in ${total}s.`);
    return 0;
  }

  for (const [name, result] of failed) {
    console.error(`\npre-push: ${name} failed.`);
    const lines = (result.output ?? "").trimEnd().split("\n");
    for (const line of lines.slice(-40)) console.error(`  ${line}`);
    if (lines.length > 40) console.error(`  (${lines.length - 40} earlier lines)`);
  }
  console.error("\npre-push: fix it, or skip with SKIP_HOOKS=1 (never to deliver).");
  return 1;
}

const invoked = process.argv[1]?.endsWith("pre-push.mjs");
if (invoked) process.exit(await main());
