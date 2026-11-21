#!/usr/bin/env node
// Generador del contrato RPC1 del motor: commands.json -> src/generated/*.
// Node puro, sin dependencias. Uso: node packages/engine-client/scripts/generate.mjs
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
// El manifiesto del motor vendorizado (danil-engine crates/engine-manifest): base + extensiones.
const contract = resolve(here, "../contract");
const source = join(contract, "commands.json");
const out = resolve(here, "../src/generated");
const MAX_LINES = 380; // tope R6: 400 líneas por archivo

const raw = readFileSync(source);
const spec = JSON.parse(raw.toString("utf8"));
const digest = createHash("sha256").update(raw);
// Las extensiones (`extensions/*_v1.json`) suman comandos, eventos y features al manifiesto base.
const extDir = join(contract, "extensions");
for (const file of readdirSync(extDir).filter((f) => f.endsWith(".json")).sort()) {
  const bytes = readFileSync(join(extDir, file));
  digest.update(bytes);
  const ext = JSON.parse(bytes.toString("utf8"));
  const known = new Set(spec.commands.map((c) => c.name));
  for (const c of ext.commands ?? []) if (!known.has(c.name)) spec.commands.push(c);
  const events = new Set((spec.events ?? []).map((e) => (typeof e === "string" ? e : e.name)));
  for (const e of ext.events ?? []) if (!events.has(typeof e === "string" ? e : e.name)) (spec.events ??= []).push(e);
  const features = [].concat(spec.features ?? []);
  for (const f of [].concat(ext.features ?? [])) if (!features.includes(f)) features.push(f);
  spec.features = features;
}
const hash = digest.digest("hex");
const HEADER = `// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.\n`;

// ---- tipos Rust -> TS ----
function splitTop(s) {
  const parts = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if ("<([".includes(ch)) depth++;
    if (">)]".includes(ch)) depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}
function generic(t, name) {
  if (!t.startsWith(name + "<") || !t.endsWith(">")) return null;
  return splitTop(t.slice(name.length + 1, -1));
}
/** Devuelve {ts, optional} para un tipo Rust (sin espacios). */
function map(t) {
  t = t.replace(/\s+/g, "");
  let a;
  if (t === "String" || t === "str" || t === "&str" || t === "PathBuf") return { ts: "string" };
  if (t === "bool") return { ts: "boolean" };
  if (/^(u|i)(8|16|32|64|128|size)$/.test(t) || /^f(32|64)$/.test(t)) return { ts: "number" };
  if (t === "()") return { ts: "null" };
  if (t === "Value" || t === "serde_json::Value") return { ts: "unknown" };
  if ((a = generic(t, "Option"))) return { ts: map(a[0]).ts + " | null", optional: true };
  if ((a = generic(t, "Vec"))) return { ts: wrap(map(a[0]).ts) + "[]" };
  if ((a = generic(t, "Wire")) || (a = generic(t, "crate::wire::Wire"))) return map(a[0]);
  for (const h of ["HashMap", "std::collections::HashMap", "BTreeMap", "std::collections::BTreeMap"]) {
    if ((a = generic(t, h))) return { ts: `Record<${map(a[0]).ts}, ${map(a[1]).ts}>` };
  }
  if (t.startsWith("(") && t.endsWith(")")) return { ts: `[${splitTop(t.slice(1, -1)).map((x) => map(x).ts).join(", ")}]` };
  return { ts: "unknown" };
}
const wrap = (ts) => (ts.includes(" ") && !ts.startsWith("Record<") ? `(${ts})` : ts);

function outputType(o) {
  let t = (o || "").replace(/\s+/g, "");
  t = t.replace(/^->/, "");
  if (t === "") return "null";
  let a = generic(t, "Result");
  if (a) t = a[0];
  return map(t).ts;
}
function paramsOf(c) {
  return (c.parameters || []).map((p) => {
    // Los Channel de Tauri no viajan por RPC: se ignoran.
    if (/Channel</.test(p.type.replace(/\s+/g, ""))) return null;
    const m = map(p.type);
    return { key: p.key, ts: m.ts, optional: !!m.optional };
  }).filter(Boolean);
}

const pascal = (n) => (/\s/.test(n) ? "Cli" : "") + n.split(/[_\s-]+/).filter(Boolean).map((s) => s[0].toUpperCase() + s.slice(1)).join("");
const prop = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));

// ---- agrupar por prefijo, partido por tamaño ----
const cmds = [...spec.commands].sort((a, b) => a.name.localeCompare(b.name));
const groups = new Map();
for (const c of cmds) {
  const p = c.name.split(/[_\s]/)[0];
  if (!groups.has(p)) groups.set(p, []);
  groups.get(p).push(c);
}
const LINES_PER_CMD = 18;
const chunks = []; // {file, cmds}
const per = Math.floor(MAX_LINES / LINES_PER_CMD);
const small = [];
for (const [p, list] of groups) {
  if (list.length < 6) { small.push(...list); continue; }
  const n = Math.ceil(list.length / per);
  for (let i = 0; i < n; i++) {
    chunks.push({ file: n === 1 ? p : `${p}-${i + 1}`, cmds: list.slice(i * per, (i + 1) * per) });
  }
}
// Los prefijos pequeños se agrupan para no multiplicar archivos.
for (let i = 0; i * per < small.length; i++) chunks.push({ file: `misc-${i + 1}`, cmds: small.slice(i * per, (i + 1) * per) });

function commandBlock(c) {
  const P = pascal(c.name);
  const ps = paramsOf(c);
  const body = ps.length
    ? `export interface ${P}Params {\n${ps.map((p) => `  ${prop(p.key)}${p.optional ? "?" : ""}: ${p.ts};`).join("\n")}\n}`
    : `export type ${P}Params = Record<string, never>;`;
  return `${body}\nexport type ${P}Output = ${outputType(c.output)};\n`;
}
const meta = (c) =>
  `  ${prop(c.name)}: { kind: ${JSON.stringify(c.kind)}, scope: ${JSON.stringify(c.scope ?? null)}, authority: ${JSON.stringify(c.authority ?? null)}, channel: ${JSON.stringify(c.channel ?? null)}, relay: ${c.relay === false ? "false" : "true"} },`;

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "commands"), { recursive: true });
mkdirSync(join(out, "client"), { recursive: true });
const w = (f, s) => writeFileSync(join(out, f), HEADER + s);

// contract.ts
w("contract.ts",
`export const RPC_VERSION = ${JSON.stringify(spec.rpc_version)};
export const VERSION = ${JSON.stringify(spec.version)};
export const FEATURES = ${JSON.stringify(spec.features ?? [])} as const;
/** sha256 de commands.json. */
export const CONTRACT_HASH = ${JSON.stringify(hash)};
`);

// commands/<chunk>.ts
for (const ch of chunks) {
  w(`commands/${ch.file}.ts`,
    `${ch.cmds.map(commandBlock).join("\n")}\nexport const COMMANDS_${ch.file.replace(/\W/g, "_").toUpperCase()} = {\n${ch.cmds.map(meta).join("\n")}\n} as const;\n`);
}
// commands/index.ts
const varName = (f) => `COMMANDS_${f.replace(/\W/g, "_").toUpperCase()}`;
w("commands/index.ts",
`${chunks.map((c) => `import { ${varName(c.file)} } from "./${c.file}.ts";\nexport * from "./${c.file}.ts";`).join("\n")}

export const COMMANDS = {
${chunks.map((c) => `  ...${varName(c.file)},`).join("\n")}
} as const;
export type CommandName = keyof typeof COMMANDS;
/** Comandos que el motor no expone por relay (\`relay: false\` en el manifiesto): solo IPC local. */
export const LOCAL_ONLY: ReadonlySet<string> = new Set(
  Object.entries(COMMANDS).filter(([, m]) => !m.relay).map(([n]) => n),
);
`);
w("commands.ts", `export * from "./commands/index.ts";\n`);

// events.ts
const events = (spec.events || []).map((e) => (typeof e === "string" ? e : e.name));
w("events.ts",
`export const EVENTS = ${JSON.stringify(events, null, 2)} as const;
export type EventName = (typeof EVENTS)[number];
/** El contrato no describe payloads de eventos todavía: unknown hasta que lo haga. */
export interface EventPayloads {
${events.map((e) => `  ${JSON.stringify(e)}: unknown;`).join("\n")}
}
`);

// client
const clientCmd = (c) => {
  const P = pascal(c.name);
  const ps = paramsOf(c);
  const allOpt = ps.every((p) => p.optional);
  const arg = ps.length ? `params${allOpt ? "?" : ""}: ${P}Params` : "";
  return `    ${prop(c.name)}: (${arg}) => t.call(${JSON.stringify(c.name)}, ${ps.length ? "params" : "{}"}) as Promise<${P}Output>,`;
};
for (const ch of chunks) {
  const names = ch.cmds.flatMap((c) => { const P = pascal(c.name); return [`${P}Params`, `${P}Output`]; });
  w(`client/${ch.file}.ts`,
`import type { EngineTransport } from "../transport.ts";
import type { ${names.join(", ")} } from "../commands/${ch.file}.ts";

export function bind_${ch.file.replace(/\W/g, "_")}(t: EngineTransport) {
  return {
${ch.cmds.map(clientCmd).join("\n")}
  };
}
`);
}
w("client/index.ts",
`${chunks.map((c) => `export { bind_${c.file.replace(/\W/g, "_")} } from "./${c.file}.ts";`).join("\n")}\n`);
w("transport.ts",
`export interface EngineTransport {
  call(name: string, params: unknown): Promise<unknown>;
  subscribe(event: string, cb: (payload: unknown) => void): () => void;
}
`);
w("client.ts",
`import type { EngineTransport } from "./transport.ts";
import type { EventName, EventPayloads } from "./events.ts";
import {
${chunks.map((c) => `  bind_${c.file.replace(/\W/g, "_")},`).join("\n")}
} from "./client/index.ts";
export type { EngineTransport } from "./transport.ts";

export function createEngineClient(transport: EngineTransport) {
  return {
${chunks.map((c) => `    ...bind_${c.file.replace(/\W/g, "_")}(transport),`).join("\n")}
    subscribe<E extends EventName>(event: E, cb: (payload: EventPayloads[E]) => void): () => void {
      return transport.subscribe(event, cb as (payload: unknown) => void);
    },
  };
}
export type EngineClient = ReturnType<typeof createEngineClient>;
`);
console.log(`generado: ${cmds.length} comandos, ${events.length} eventos, ${chunks.length} archivos, hash ${hash.slice(0, 12)}`);
