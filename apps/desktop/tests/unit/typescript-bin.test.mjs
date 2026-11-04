import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { CLASSIC, NATIVE, typecheckBin } from "../../scripts/typescript.mjs";

function desktop(t, native) {
  const dir = mkdtempSync(join(tmpdir(), "typescript-bin-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  if (native !== undefined) {
    mkdirSync(dirname(join(dir, NATIVE)), { recursive: true });
    writeFileSync(join(dir, NATIVE), native);
  }
  return dir;
}

test("sin tsgo instalado revisa con tsc", (t) => {
  const dir = desktop(t);
  assert.equal(typecheckBin(dir), join(dir, CLASSIC));
});

test("con tsgo que arranca revisa con tsgo", (t) => {
  const dir = desktop(t, "process.exit(0);\n");
  assert.equal(typecheckBin(dir), join(dir, NATIVE));
});

test("un tsgo sin su binario de plataforma cae a tsc", (t) => {
  const dir = desktop(t, "throw new Error('no hay binario para esta plataforma');\n");
  assert.equal(typecheckBin(dir), join(dir, CLASSIC));
});

test("el tsgo de este checkout arranca", () => {
  const root = join(import.meta.dirname, "../..");
  assert.equal(typecheckBin(root), join(root, NATIVE), "falta @typescript/native-preview o su binario para esta plataforma");
});
