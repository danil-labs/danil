import assert from "node:assert/strict";
import test from "node:test";

import { workdirIconKind } from "../../../../packages/ui/src/lib/workdirKind.ts";

const PROVIDERS = ["google_drive", "one_drive", "icloud", "dropbox", "box", "other"];

test("un repositorio en la nube conserva el icono de Git", () => {
  for (const cloud of [...PROVIDERS, null, undefined]) {
    assert.equal(workdirIconKind("git", cloud), "git");
  }
});

test("una carpeta de nube sin Git lleva la nube, sea cual sea el proveedor", () => {
  for (const cloud of PROVIDERS) {
    assert.equal(workdirIconKind("folder", cloud), "cloud");
  }
});

test("sin nube ni Git es una carpeta", () => {
  assert.equal(workdirIconKind("folder", null), "folder");
  assert.equal(workdirIconKind("folder", undefined), "folder");
  assert.equal(workdirIconKind("folder"), "folder");
});
