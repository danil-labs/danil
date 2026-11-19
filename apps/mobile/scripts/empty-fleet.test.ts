import assert from "node:assert/strict";
import { test } from "node:test";
import { DOWNLOAD_URL, EMAIL_MARK, aroundEmail, emptyFleet } from "../src/lib/emptyFleet.ts";

test("sin computadoras: descargar Danil y el correo de la sesión", () => {
  assert.deepEqual(emptyFleet("ok", 0, "qa@danil.ai"), { download: "https://danil.ai/download", email: "qa@danil.ai" });
  assert.equal(DOWNLOAD_URL, "https://danil.ai/download");
});

test("sin correo en la sesión, la línea no inventa uno", () => {
  assert.deepEqual(emptyFleet("ok", 0, null), { download: DOWNLOAD_URL, email: null });
  assert.deepEqual(emptyFleet("ok", 0, "  "), { download: DOWNLOAD_URL, email: null });
});

test("con computadoras o sin respuesta de la flota, no hay estado vacío", () => {
  assert.equal(emptyFleet("ok", 1, "qa@danil.ai"), null);
  for (const fleet of ["loading", "error", "license", "no_account", "signed_out"]) assert.equal(emptyFleet(fleet, 0, "qa@danil.ai"), null);
});

test("el correo se resalta sin partir la frase de la clave", () => {
  assert.deepEqual(aroundEmail(`¿Ya tienes Danil? Ábrelo e inicia sesión con ${EMAIL_MARK}.`), ["¿Ya tienes Danil? Ábrelo e inicia sesión con ", "."]);
  assert.deepEqual(aroundEmail("Sin marca."), ["Sin marca.", ""]);
});
