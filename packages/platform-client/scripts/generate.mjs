#!/usr/bin/env node
/**
 * Genera `src/generated/` desde los OpenAPI vendorizados (commit en `contract/PIN`):
 * - `contract/openapi.json` (platform) → `types.ts`: machines, identity, workspaces y credentials.
 * - `contract/billing-v2/openapi/public.openapi.json` (con sus `$defs` de `../schemas/common.v1.schema.json`)
 *   → `billing.ts`: treasury. Va aparte porque sus nombres (`Operation`, `Problem`) chocan con los de platform.
 * Sin dependencias: solo el subconjunto de JSON Schema que usan los contratos (type, enum, const, $ref, properties,
 * required, items, additionalProperties, oneOf/anyOf). Tarea 4.2 del plan front-move: los esquemas que alcanzan
 * las operaciones de cada dominio. Uso: `node packages/platform-client/scripts/generate.mjs [--check]`.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PIN = readFileSync(join(ROOT, "contract/PIN"), "utf8").trim();
const head = (from) => `// GENERADO por packages/platform-client/scripts/generate.mjs desde ${from}. No editar a mano.\n// ${PIN.replace(/\n/g, "; ")}\n`;
const lit = (v) => JSON.stringify(v);
const prim = { string: "string", integer: "number", number: "number", boolean: "boolean", null: "null" };
const pascal = (name) => name.replace(/(^|_)([a-z0-9])/g, (_, __, c) => c.toUpperCase());

/** Operaciones por fuente y dominio; un dominio nuevo se añade aquí y se regenera. */
const SOURCES = [
  {
    file: "contract/openapi.json",
    out: "src/generated/types.ts",
    domains: {
      machines: ["getMachines", "getMachine", "startMachine", "stopMachine", "createMachineTicket", "getOperation"],
      identity: ["getMe", "getOrganizations", "selectOrganization"],
      workspaces: ["getWorkspaces", "selectWorkspace"],
      credentials: [
        "listCredentialProviders", "connectCredentialProvider", "disconnectCredentialProvider",
        "getWorkspaceAccounts", "putWorkspaceAccount", "deleteWorkspaceAccount",
        "removeWorkspaceAccountMachine", "restoreWorkspaceAccountMachine",
        "getGithubConnection", "disconnectGithub", "authorizeGithub",
      ],
    },
  },
  {
    file: "contract/billing-v2/openapi/public.openapi.json",
    /** `$ref` a otro archivo: sus `$defs` se vuelven tipos con nombre en PascalCase (`money` → `Money`). */
    external: { "../schemas/common.v1.schema.json": "contract/billing-v2/schemas/common.v1.schema.json" },
    out: "src/generated/billing.ts",
    domains: {
      treasury: [
        "getCatalog", "getOrganizationBilling", "createCheckoutSession", "getCheckoutSession", "createPortalSession",
        "getCreditBalance", "listCreditTransactions", "createCreditPurchase", "getCreditPurchase",
      ],
    },
  },
];

function generate(source) {
  const raw = readFileSync(join(ROOT, source.file));
  const spec = JSON.parse(raw.toString("utf8"));
  const schemas = spec.components?.schemas ?? {};
  const docs = Object.fromEntries(Object.entries(source.external ?? {}).map(([ref, rel]) => [ref, JSON.parse(readFileSync(join(ROOT, rel), "utf8"))]));
  const defs = {};
  for (const doc of Object.values(docs)) for (const [k, v] of Object.entries(doc.$defs ?? {})) {
    const name = pascal(k);
    if (schemas[name] || defs[name]) throw new Error(`nombre repetido: ${name}`);
    defs[name] = v;
  }
  /** Una `$ref` → el nombre del tipo y su esquema. `#/$defs/x` vale dentro de los archivos externos. */
  const resolve = (ref) => {
    let m = /^#\/components\/schemas\/(.+)$/.exec(ref);
    if (m) return { name: m[1], schema: schemas[m[1]] };
    m = /^(.*)#\/\$defs\/(.+)$/.exec(ref);
    if (m && (m[1] === "" || docs[m[1]])) return { name: pascal(m[2]), schema: defs[pascal(m[2])] };
    m = /^#\/components\/([^/]+)\/(.+)$/.exec(ref);
    if (m) return { inline: spec.components[m[1]][m[2]] };
    throw new Error(`ref no soportada: ${ref}`);
  };
  const operations = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(item)) if (op && typeof op === "object" && op.operationId) operations.push({ path, method, op });
  }
  const wanted = new Set(Object.values(source.domains).flat());
  const used = new Map();
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (typeof node.$ref === "string") {
      const r = resolve(node.$ref);
      if (r.inline) visit(r.inline);
      else if (!r.schema) throw new Error(`esquema ausente: ${node.$ref}`);
      else if (!used.has(r.name)) { used.set(r.name, r.schema); visit(r.schema); }
    }
    for (const value of Object.values(node)) visit(value);
  };
  for (const { op } of operations) if (wanted.has(op.operationId)) { visit(op.responses); visit(op.requestBody); }
  for (const id of wanted) if (!operations.some((o) => o.op.operationId === id)) throw new Error(`operación ${id} no está en ${source.file}`);

  function tsOf(s, indent) {
    if (!s || typeof s !== "object") return "unknown";
    if (s.$ref) return resolve(s.$ref).name ?? "unknown";
    const union = s.oneOf ?? s.anyOf;
    if (Array.isArray(union)) return union.map((u) => tsOf(u, indent)).join(" | ");
    if ("const" in s) return lit(s.const);
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

  const top = [head(source.file), `// Dominios: ${Object.keys(source.domains).join(", ")}.\n`];
  const entries = [];
  for (const name of [...used.keys()].sort()) {
    const s = used.get(name);
    const lines = [];
    if (s.description) lines.push(`/** ${s.description.replace(/\*\//g, "*\\/").replace(/\s+/g, " ")} */`);
    lines.push(`export type ${name} = ${tsOf(s, 0)};\n`);
    entries.push({ name, text: lines.join("\n") });
  }
  const types = [...top, ...entries.map((e) => e.text)];
  const hash = createHash("sha256").update(raw);
  for (const rel of Object.values(source.external ?? {})) hash.update(readFileSync(join(ROOT, rel)));
  const ops = operations.filter((o) => wanted.has(o.op.operationId))
    .map((o) => `  ${o.op.operationId}: { method: ${lit(o.method.toUpperCase())}, path: ${lit(o.path)} },`);
  return { types: types.join("\n"), top, entries, hash: hash.digest("hex"), version: spec.info?.version ?? "", ops };
}

const [platform, billing] = SOURCES.map(generate);
const contract = `${head(SOURCES[0].file)}// source: ../../contract/openapi.json\n\n/** sha256 del openapi.json vendorizado (R7): si no coincide, se regenera. */\nexport const CONTRACT_HASH = ${lit(platform.hash)};\nexport const CONTRACT_VERSION = ${lit(platform.version)};\n\n/** Método y ruta de cada operación generada. */\nexport const OPERATIONS = {\n${platform.ops.join("\n")}\n} as const;\n`
  + `\n/** sha256 de billing-v2 (public.openapi.json y luego common.v1.schema.json); si no coincide, se regenera. */\nexport const BILLING_CONTRACT_HASH = ${lit(billing.hash)};\nexport const BILLING_CONTRACT_VERSION = ${lit(billing.version)};\n\n/** Método y ruta de cada operación de billing-v2 generada. */\nexport const BILLING_OPERATIONS = {\n${billing.ops.join("\n")}\n} as const;\n`;

/**
 * Un archivo de tipos de más de `MAX_LINES` líneas sale en partes (tope R6 de 400): `x.ts` con las
 * primeras y `x-2.ts`, `x-3.ts`… con las demás, en el mismo orden. `x.ts` reexporta las partes,
 * así que quien importa no cambia; cada parte importa de las otras solo los tipos que nombra.
 */
const MAX_LINES = 400;
function split(rel, gen) {
  const text = gen.types;
  if (text.split("\n").length <= MAX_LINES) return { [rel]: text };
  const base = rel.replace(/\.ts$/, ""), stem = base.split("/").pop();
  const parts = [[]];
  let n = gen.top.join("\n").split("\n").length + 12;
  for (const e of gen.entries) {
    const len = e.text.split("\n").length + 1;
    if (n + len > MAX_LINES - 12 && parts.at(-1).length) { parts.push([]); n = 8; }
    parts.at(-1).push(e); n += len;
  }
  const file = (i) => (i === 0 ? `${stem}.ts` : `${stem}-${i + 1}.ts`);
  const owner = new Map(parts.flatMap((p, i) => p.map((e) => [e.name, i])));
  const files = {};
  parts.forEach((p, i) => {
    const code = p.map((e) => e.text.replace(/\/\*\*[\s\S]*?\*\//g, "")).join("\n");
    const needs = new Map();
    for (const [name, j] of owner) if (j !== i && new RegExp(`\\b${name}\\b`).test(code)) (needs.get(j) ?? needs.set(j, []).get(j)).push(name);
    const imports = [...needs].sort(([a], [b]) => a - b).map(([j, names]) => `import type { ${names.join(", ")} } from "./${file(j)}";`);
    const reexports = i === 0 ? parts.slice(1).map((q, k) => `export type { ${q.map((e) => e.name).join(", ")} } from "./${file(k + 1)}";`) : [];
    const lead = i === 0 ? gen.top : [gen.top[0], `// Parte ${i + 1} de ${parts.length} de \`${stem}.ts\`, que la reexporta.\n`];
    const glue = [...imports, ...reexports];
    files[`${base}${i === 0 ? "" : `-${i + 1}`}.ts`] = [...lead, ...(glue.length ? [glue.join("\n") + "\n"] : []), ...p.map((e) => e.text)].join("\n");
  });
  return files;
}

const out = { ...split(SOURCES[0].out, platform), ...split(SOURCES[1].out, billing), "src/generated/contract.ts": contract };
const check = process.argv.includes("--check");
let stale = false;
for (const [rel, text] of Object.entries(out)) {
  const file = join(ROOT, rel);
  if (check) { let cur = ""; try { cur = readFileSync(file, "utf8"); } catch {} if (cur !== text) { stale = true; console.error(`desactualizado: ${rel}`); } }
  else writeFileSync(file, text);
}
if (stale) process.exit(1);
