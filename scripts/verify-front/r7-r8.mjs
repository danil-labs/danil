import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ROOT, scan } from "./lib.mjs";

const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

function checkContract(rel, sourcePath) {
  const file = join(ROOT, rel);
  if (!existsSync(file)) return [];
  const text = readFileSync(file, "utf8");
  const hash = /CONTRACT_HASH\s*(?::[^=]+)?=\s*["']([^"']+)["']/.exec(text);
  const lineOf = (re) => text.slice(0, re?.index ?? 0).split("\n").length;
  const fail = (line, reason) => [{ path: rel, line, reason: `R7: ${reason}` }];
  if (!hash) return fail(1, "no se encontró CONTRACT_HASH");
  const source = sourcePath(text, file);
  if (!source.path) return fail(lineOf(hash), source.error);
  if (!existsSync(source.path)) return fail(lineOf(hash), `la fuente ${source.path} no existe`);
  const expected = sha(source.path);
  const got = hash[1].replace(/^sha256:/i, "").toLowerCase();
  return got === expected ? [] : fail(lineOf(hash), `CONTRACT_HASH ${got} ≠ sha256 de la fuente ${expected}; regenera el cliente`);
}

export function r7() {
  const out = checkContract("packages/engine-client/src/generated/contract.ts",
    () => ({ path: join(ROOT, "apps/desktop/src-tauri/crates/engine-protocol/commands.json") }));
  out.push(...checkContract("packages/platform-client/src/generated/contract.ts", (text, file) => {
    const m = /source:\s*(\S+)/.exec(text);
    if (!m) return { error: 'falta el comentario "source:" con la ruta del openapi.json' };
    const rel = m[1].replace(/^["'`]|["'`,;]+$/g, "");
    const near = resolve(dirname(file), rel);
    return { path: existsSync(near) ? near : resolve(ROOT, rel) };
  }));
  return out;
}

const BLACKLIST = /supabase|appv2|messaging|mensajeria|\/v1\/compute|\/v1\/computers/i;

export function r8(files) {
  return scan(files, () => true, BLACKLIST, "R8: término de la lista negra (supabase, appv2, mensajería, /v1/compute, /v1/computers)");
}
