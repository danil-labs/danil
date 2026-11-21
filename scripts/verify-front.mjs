#!/usr/bin/env node
// Gates R1–R10 del front nuevo. Ver scripts/verify-front/README.md.
import { loadFiles } from "./verify-front/lib.mjs";
import { r1 } from "./verify-front/r1.mjs";
import { r6 } from "./verify-front/r6.mjs";

const RULES = [["R1", r1], ["R6", r6]];

const files = loadFiles();
let total = 0;
for (const [id, check] of RULES) {
  const violations = check(files);
  for (const v of violations) console.error(`${v.path}:${v.line}: ${v.reason}`);
  console.log(`${violations.length ? "FAIL" : "ok  "} ${id}`);
  total += violations.length;
}
console.log(`verify-front: ${files.length} archivos, ${total} violaciones`);
process.exit(total ? 1 : 0);
