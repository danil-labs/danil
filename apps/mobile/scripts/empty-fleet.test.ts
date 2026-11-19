import assert from "node:assert/strict";
import { test } from "node:test";
import { DOWNLOAD_URL, EMAIL_MARK, aroundEmail, emptyFleet } from "../src/lib/emptyFleet.ts";

test("sin computadoras: descargar Danil y el correo de la sesión", () => {
  assert.deepEqual(emptyFleet("ok", true, 0, "qa@danil.ai"), { download: DOWNLOAD_URL, email: "qa@danil.ai" });
});

test("sin correo en la sesión, la línea no inventa uno", () => {
  assert.deepEqual(emptyFleet("ok", true, 0, null), { download: DOWNLOAD_URL, email: null });
  assert.deepEqual(emptyFleet("ok", true, 0, "  "), { download: DOWNLOAD_URL, email: null });
});

test("con computadoras o sin respuesta de la flota, no hay estado vacío", () => {
  assert.equal(emptyFleet("ok", true, 1, "qa@danil.ai"), null);
  for (const fleet of ["loading", "error", "license", "no_account", "signed_out"] as const) assert.equal(emptyFleet(fleet, true, 0, "qa@danil.ai"), null);
});

test("con computadoras cuyos hosts aún no llegan, no hay estado vacío", () => {
  // `fleet` ya es `ok` y la lista trae computadoras, pero la flota todavía no arma sus hosts: `contextReady` es falso.
  assert.equal(emptyFleet("ok", false, 0, "qa@danil.ai"), null);
});

test("el correo se resalta sin partir la frase de la clave", () => {
  assert.deepEqual(aroundEmail(`¿Ya tienes Danil? Ábrelo e inicia sesión con ${EMAIL_MARK}.`), ["¿Ya tienes Danil? Ábrelo e inicia sesión con ", "."]);
  assert.deepEqual(aroundEmail("Sin marca."), ["Sin marca.", ""]);
});
