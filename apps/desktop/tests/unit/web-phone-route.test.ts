import assert from "node:assert/strict";
import test from "node:test";
import { phoneRoute } from "../../src/web/phone.ts";

const phone = (saved: string | null = null, small = true) => ({ matchMedia: () => ({ matches: small }), localStorage: { getItem: () => saved } });

test("un teléfono que abre la raíz de la web va a la versión del teléfono, con su query", () => {
  assert.equal(phoneRoute({ pathname: "/", search: "" }, "/", phone()), "/m/");
  assert.equal(phoneRoute({ pathname: "/", search: "?error=x" }, "/", phone()), "/m/?error=x");
  assert.equal(phoneRoute({ pathname: "/terminus/", search: "" }, "/terminus/", phone()), "/terminus/m/");
});

test("una ruta profunda del teléfono que cae en la web vuelve como ?to= a su raíz", () => {
  assert.equal(phoneRoute({ pathname: "/m/settings", search: "?section=account" }, "/", phone()), "/m/?to=%2Fsettings%3Fsection%3Daccount");
});

test("la raíz del teléfono misma, una pantalla grande o quien eligió escritorio se quedan", () => {
  assert.equal(phoneRoute({ pathname: "/m/", search: "" }, "/", phone()), null, "sin el teléfono publicado: no hay bucle");
  assert.equal(phoneRoute({ pathname: "/", search: "" }, "/", phone(null, false)), null);
  assert.equal(phoneRoute({ pathname: "/", search: "" }, "/", phone("desktop")), null);
  assert.equal(phoneRoute({ pathname: "/", search: "" }, "/", phone("mobile", false)), "/m/");
});
