import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clavesConocidas, elegirLengua, registrarCatalogo, registrarPaquete, sumarFrases, t, type Manifiesto } from "../../src/lib/i18n.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = (code: string): Manifiesto =>
  JSON.parse(readFileSync(join(ROOT, "src/locales", code, "manifiesto.json"), "utf8"));
const CLAVE = "settings.accounts.title";

test("a disk pack keeps the translation of a key whose lazy chunk loads later", () => {
  registrarCatalogo(manifest("es"), { "common.cancel": "Cancelar" });
  const yua: Manifiesto = { ...manifest("en"), codigo: "yua", endonimo: "Maayatʼaan", formato: "es-MX" };
  const ignoradas = registrarPaquete(yua, { [CLAVE]: "Cuentas (yua)", "common.cancel": "Xuʼulsik" });
  assert.equal(ignoradas, 1, "at startup the key is unknown, and only the count says so");

  sumarFrases("es", { [CLAVE]: "Cuentas" });
  assert.ok(clavesConocidas().has(CLAVE));
  elegirLengua("yua");
  assert.equal(t(CLAVE), "Cuentas (yua)");

  assert.equal(registrarPaquete(yua, { [CLAVE]: "Cuentas (yua)" }), 0, "once the chunk loaded, the key counts as known");
});
