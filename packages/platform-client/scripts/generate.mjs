#!/usr/bin/env node
// Genera src/generated/{types,operations,contract}.ts desde contract/openapi.json.
// Node puro, sin dependencias. No editar a mano lo generado.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const specPath = join(root, "contract", "openapi.json");
const outDir = join(root, "src", "generated");
const raw = readFileSync(specPath);
const spec = JSON.parse(raw.toString("utf8"));
const HEADER = "// GENERADO por scripts/generate.mjs. No editar.\n";

const refName = (ref) => ref.split("/").pop();
const lookup = (ref) => ref.replace(/^#\//, "").split("/").reduce((o, k) => o?.[k], spec);
const q = (s) => (/^[A-Za-z_$][\w$]*$/.test(s) ? s : JSON.stringify(s));
const doc = (s, pad = "") =>
  s?.description ? `${pad}/** ${String(s.description).replace(/\*\//g, "*\\/").replace(/\n/g, " ")} */\n` : "";

function ts(s, pad = "") {
  if (!s || typeof s !== "object") return "unknown";
  if (s.$ref) return refName(s.$ref);
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (s.oneOf || s.anyOf) return (s.oneOf ?? s.anyOf).map((x) => ts(x, pad)).join(" | ");
  if (s.allOf) return s.allOf.map((x) => ts(x, pad)).join(" & ");
  if (Array.isArray(s.type)) return s.type.map((t) => ts({ ...s, type: t }, pad)).join(" | ");
  switch (s.type) {
    case "string": return "string";
    case "integer":
    case "number": return "number";
    case "boolean": return "boolean";
    case "null": return "null";
    case "array": return `Array<${ts(s.items, pad)}>`;
    case "object": case undefined: {
      const props = s.properties ?? {};
      const req = new Set(s.required ?? []);
      const lines = Object.entries(props).map(
        ([k, v]) => `${doc(v, pad + "  ")}${pad}  ${q(k)}${req.has(k) ? "" : "?"}: ${ts(v, pad + "  ")};`,
      );
      if (s.additionalProperties) {
        const v = s.additionalProperties === true ? "unknown" : ts(s.additionalProperties, pad + "  ");
        lines.push(`${pad}  [key: string]: ${v};`);
      }
      return lines.length ? `{\n${lines.join("\n")}\n${pad}}` : "Record<string, unknown>";
    }
    default: return "unknown";
  }
}

// types.ts
let types = HEADER;
for (const [name, s] of Object.entries(spec.components?.schemas ?? {})) {
  types += `\n${doc(s)}export type ${name} = ${ts(s)};\n`;
}
// Los índices abiertos ([key: string]: unknown) chocan con propiedades tipadas;
// se relajan a `any` solo en esa firma para que el archivo compile.
types = types.replace(/\[key: string\]: unknown;/g, "[key: string]: any;");

// operations.ts
const camel = (s) => s.replace(/-(\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, (c) => c.toLowerCase());
const imports = new Set();
const track = (t) => { for (const m of t.matchAll(/\b[A-Z]\w+\b/g)) if (spec.components?.schemas?.[m[0]]) imports.add(m[0]); return t; };
const ops = [];
for (const [path, item] of Object.entries(spec.paths)) {
  for (const method of ["get", "post", "put", "patch", "delete"]) {
    const op = item[method];
    if (!op) continue;
    const params = [...(item.parameters ?? []), ...(op.parameters ?? [])].map((p) => (p.$ref ? lookup(p.$ref) : p));
    const fields = [];
    const pathP = [], queryP = [], headerP = [];
    for (const p of params) {
      const key = p.in === "header" ? camel(p.name) : p.name;
      fields.push(`${q(key)}${p.required ? "" : "?"}: ${track(ts(p.schema))}`);
      (p.in === "path" ? pathP : p.in === "query" ? queryP : headerP).push({ key, name: p.name });
    }
    const bodySchema = op.requestBody?.content?.["application/json"]?.schema;
    if (bodySchema) fields.push(`body${op.requestBody.required ? "" : "?"}: ${track(ts(bodySchema))}`);
    const okKey = Object.keys(op.responses ?? {}).find((c) => /^2/.test(c));
    const okSchema = okKey && op.responses[okKey].content?.["application/json"]?.schema;
    const ret = okSchema ? track(ts(okSchema)) : "void";
    const allOptional = fields.every((f) => f.includes("?:"));
    const argT = fields.length ? `args${allOptional ? "?" : ""}: { ${fields.join("; ")} }` : "";
    const pathExpr = "`" + path.replace(/^\/v1/, "").replace(/\{(\w+)\}/g, (_, n) => `\${encodeURIComponent(String(args!.${n}))}`) + "`";
    const obj = (list, from = "args") => `{ ${list.map((x) => `${q(x.name)}: ${from}?.${q(x.key)}`).join(", ")} }`;
    ops.push(
      `${op.summary ? `    /** ${op.summary} */\n` : ""}    ${op.operationId}: (${argT}) =>\n` +
      `      t<${ret}>({ method: "${method.toUpperCase()}", path: ${pathExpr}` +
      (queryP.length ? `, query: ${obj(queryP)}` : "") +
      (headerP.length ? `, headers: ${obj(headerP)}` : "") +
      (bodySchema ? `, body: args?.body` : "") + ` }),`,
    );
  }
}
const operations =
  HEADER +
  `import type { ${[...imports].sort().join(", ")} } from "./types.ts";\n\n` +
  `export type TransportRequest = {\n  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";\n  path: string;\n` +
  `  query?: Record<string, string | number | boolean | undefined>;\n  headers?: Record<string, string | undefined>;\n  body?: unknown;\n};\n` +
  `export type Transport = <T>(req: TransportRequest) => Promise<T>;\n\n` +
  `export function createOperations(t: Transport) {\n  return {\n${ops.join("\n")}\n  };\n}\n` +
  `export type Operations = ReturnType<typeof createOperations>;\n`;

const hash = createHash("sha256").update(raw).digest("hex");
const contract =
  HEADER + `// source: packages/platform-client/contract/openapi.json\n` + `export const CONTRACT_HASH = "${hash}";\n`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "types.ts"), types);
writeFileSync(join(outDir, "operations.ts"), operations);
writeFileSync(join(outDir, "contract.ts"), contract);
console.log(`generated ${ops.length} operations, hash ${hash.slice(0, 12)}`);
