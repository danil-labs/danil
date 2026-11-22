#!/usr/bin/env node
/**
 * Genera `src/generated/` desde el OpenAPI vendorizado (`contract/openapi.json`, commit en `contract/PIN`).
 * Sin dependencias: solo el subconjunto de JSON Schema que usa el contrato (type, enum, $ref, properties,
 * required, items, additionalProperties, oneOf/anyOf). Los dominios machines, identity y workspaces (tarea 4.2 del
 * plan front-move): los esquemas que alcanzan sus operaciones. Uso: `node packages/platform-client/scripts/generate.mjs [--check]`.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "contract/openapi.json");
const PIN = readFileSync(join(ROOT, "contract/PIN"), "utf8").trim();
const raw = readFileSync(SOURCE);
const spec = JSON.parse(raw.toString("utf8"));

/** Operaciones por dominio; un dominio nuevo se añade aquí y se regenera. */
const DOMAINS = {
  machines: ["getMachines", "getMachine", "startMachine", "stopMachine", "createMachineTicket", "getOperation"],
  identity: ["getMe", "getOrganizations", "selectOrganization"],
  workspaces: ["getWorkspaces", "selectWorkspace"],
};

const refName = (ref) => /^#\/components\/schemas\/(.+)$/.exec(ref)?.[1] ?? (() => { throw new Error(`ref no soportada: ${ref}`); })();
const schemas = spec.components?.schemas ?? {};
const operations = [];
for (const [path, item] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(item)) if (op && typeof op === "object" && op.operationId) operations.push({ path, method, op });
}

const wanted = new Set(Object.values(DOMAINS).flat());
const used = new Set();
const visit = (node) => {
  if (!node || typeof node !== "object") return;
  if (typeof node.$ref === "string") {
    const [, kind, name] = /^#\/components\/([^/]+)\/(.+)$/.exec(node.$ref) ?? [];
    if (!kind) throw new Error(`ref no soportada: ${node.$ref}`);
    if (kind !== "schemas") visit(spec.components[kind][name]);
    else if (!used.has(name)) { used.add(name); visit(schemas[name]); }
  }
  for (const value of Object.values(node)) visit(value);
};
for (const { op } of operations) if (wanted.has(op.operationId)) { visit(op.responses); visit(op.requestBody); }
for (const id of wanted) if (!operations.some((o) => o.op.operationId === id)) throw new Error(`operación ${id} no está en el contrato`);

const lit = (v) => JSON.stringify(v);
const prim = { string: "string", integer: "number", number: "number", boolean: "boolean", null: "null" };
function tsOf(s, indent) {
  if (!s || typeof s !== "object") return "unknown";
  if (s.$ref) return refName(s.$ref);
  const union = s.oneOf ?? s.anyOf;
  if (Array.isArray(union)) return union.map((u) => tsOf(u, indent)).join(" | ");
  if (Array.isArray(s.enum)) return s.enum.map(lit).join(" | ");
  const types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
  if (!types.length) return s.properties ? objectOf(s, indent) : "unknown";
  return types.map((t) => t === "object" ? objectOf(s, indent) : t === "array" ? `Array<${tsOf(s.items, indent)}>` : prim[t] ?? "unknown").join(" | ");
}
function objectOf(s, indent) {
  const pad = "  ".repeat(indent + 1);
  const required = new Set(s.required ?? []);
  const lines = Object.entries(s.properties ?? {}).map(([k, v]) => {
    const doc = v.description ? `${pad}/** ${v.description.replace(/\*\//g, "*\\/").replace(/\s+/g, " ")} */\n` : "";
    return `${doc}${pad}${/^[A-Za-z_$][\w$]*$/.test(k) ? k : lit(k)}${required.has(k) ? "" : "?"}: ${tsOf(v, indent + 1)};`;
  });
  if (s.additionalProperties !== false) lines.push(`${pad}/** Campos aditivos: el contrato crece sin recompilar (R10). */\n${pad}[key: string]: unknown;`);
  return lines.length ? `{\n${lines.join("\n")}\n${"  ".repeat(indent)}}` : "Record<string, never>";
}

const head = `// GENERADO por packages/platform-client/scripts/generate.mjs desde contract/openapi.json. No editar a mano.\n// ${PIN.replace(/\n/g, "; ")}\n`;
const types = [head, `// Dominios: ${Object.keys(DOMAINS).join(", ")}.\n`];
for (const name of [...used].sort()) {
  const s = schemas[name];
  if (s.description) types.push(`/** ${s.description.replace(/\s+/g, " ")} */`);
  types.push(`export type ${name} = ${tsOf(s, 0)};\n`);
}
const ops = operations.filter((o) => wanted.has(o.op.operationId))
  .map((o) => `  ${o.op.operationId}: { method: ${lit(o.method.toUpperCase())}, path: ${lit(o.path)} },`);
const contract = `${head}// source: ../../contract/openapi.json\n\n/** sha256 del openapi.json vendorizado (R7): si no coincide, se regenera. */\nexport const CONTRACT_HASH = ${lit(createHash("sha256").update(raw).digest("hex"))};\nexport const CONTRACT_VERSION = ${lit(spec.info?.version ?? "")};\n\n/** Método y ruta de cada operación generada. */\nexport const OPERATIONS = {\n${ops.join("\n")}\n} as const;\n`;

const out = { "src/generated/types.ts": types.join("\n"), "src/generated/contract.ts": contract };
const check = process.argv.includes("--check");
let stale = false;
for (const [rel, text] of Object.entries(out)) {
  const file = join(ROOT, rel);
  if (check) { let cur = ""; try { cur = readFileSync(file, "utf8"); } catch {} if (cur !== text) { stale = true; console.error(`desactualizado: ${rel}`); } }
  else writeFileSync(file, text);
}
if (stale) process.exit(1);
