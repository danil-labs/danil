#!/usr/bin/env node
// Gates R1–R14 (R13: textos de apps/desktop) del front nuevo. Ver scripts/verify-front/README.md.
import { loadFiles } from "./verify-front/lib.mjs";
import { r1 } from "./verify-front/r1.mjs";
import { r2, r3, r4, r5, r10 } from "./verify-front/r2-r5.mjs";
import { r6 } from "./verify-front/r6.mjs";
import { r7, r8 } from "./verify-front/r7-r8.mjs";
import { r9 } from "./verify-front/r9.mjs";
import { r11, r12, r14 } from "./verify-front/r11-r14.mjs";
import { r13 } from "./verify-front/r13.mjs";

const RULES = [["R1", r1], ["R2", r2], ["R3", r3], ["R4", r4], ["R5", r5], ["R6", r6], ["R7", r7], ["R8", r8], ["R9", r9], ["R10", r10], ["R11", r11], ["R12", r12], ["R13", r13], ["R14", r14]];

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
