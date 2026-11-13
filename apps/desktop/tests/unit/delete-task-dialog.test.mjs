/**
 * The task deletion dialog against a simulated engine: a family without losses (no files, branches
 * integrated per the engine's finish check, as many members as announced) is deleted without a second window, only members with listed losses ask for acceptance, accept all, stale consent and errors inside the modal.
 * Mounts `dist/`.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const helper = fileURLToPath(new URL("../helpers/delete-task-ui.mjs", import.meta.url));

for (const scenario of ["clean", "working", "cleanfailed", "cleanchanged", "concurrent", "unmerged", "unchecked", "extra", "mixed", "stale", "refresh", "busy", "partial", "inspection", "unsupported"]) {
  test(`delete dialog: ${scenario}`, () => {
    const output = execFileSync(process.execPath, [helper, scenario], { encoding: "utf8", timeout: 60_000 });
    assert.match(output, /PASS:/);
  });
}
