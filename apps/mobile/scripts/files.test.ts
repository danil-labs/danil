import assert from "node:assert/strict";
import test from "node:test";
import { baseName, listDir, parentOf } from "../src/lib/files.ts";

const paths = ["README.md", "src/main.ts", "src/ui/App.tsx", "src/ui/b.tsx", "docs/guia.md", "node_modules/x/index.js"];
const folders = [{ path: "empty", repo: false }, { path: "node_modules", repo: false, ignored: true }];

test("la raíz junta carpetas y archivos, sin las ignoradas, y con las carpetas vacías", () => {
  assert.deepEqual(listDir(paths, folders, ""), { dirs: ["docs", "empty", "src"], files: ["README.md"] });
});

test("una subcarpeta enseña solo lo suyo", () => {
  assert.deepEqual(listDir(paths, folders, "src"), { dirs: ["ui"], files: ["main.ts"] });
  assert.deepEqual(listDir(paths, folders, "src/ui"), { dirs: [], files: ["App.tsx", "b.tsx"] });
});

test("un prefijo parecido no cuenta como carpeta", () => {
  assert.deepEqual(listDir(["srcs/a.ts", "src/b.ts"], [], "src"), { dirs: [], files: ["b.ts"] });
});

test("nombres de ruta", () => {
  assert.equal(baseName("a/b/c.ts"), "c.ts");
  assert.equal(baseName("c.ts"), "c.ts");
  assert.equal(parentOf("a/b"), "a");
  assert.equal(parentOf("a"), "");
});
