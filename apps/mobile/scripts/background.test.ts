/**
 * El fondo del chat en el teléfono: sin patrón elegido, la imagen de la cuenta
 * (`background_url` o `image_url`) manda sobre la copia en línea, y solo se
 * pide al plano de control.
 *
 *   node --test apps/mobile/scripts/background.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { withAccountBackground } from "../src/lib/engine.ts";

const API = "https://computers.test";
const PNG = "data:image/png;base64,iVBORw0KGgo=";
const URL_DE_CUENTA = `${API}/v1/workspaces/w1/background?v=abc`;

test("la imagen de la cuenta manda; sin ella, la del motor como hoy", () => {
  assert.equal(withAccountBackground({ preset: null, data_url: PNG, veil: 0.5 }, URL_DE_CUENTA, API).remote, URL_DE_CUENTA);
  const motor = withAccountBackground({ preset: null, data_url: null, image_url: URL_DE_CUENTA, veil: null }, null, API);
  assert.equal(motor.remote, URL_DE_CUENTA, "por el relay una imagen grande llega solo como image_url");
  const hoy = withAccountBackground({ preset: null, data_url: PNG, veil: 0.5 }, null, API);
  assert.equal(hoy.remote, null);
  assert.equal(hoy.image, PNG);
  assert.equal(withAccountBackground(null, URL_DE_CUENTA, API).remote, URL_DE_CUENTA, "con la máquina apagada");
});

test("un patrón elegido manda y otra URL no recibe la sesión", () => {
  assert.equal(withAccountBackground({ preset: "dusk", data_url: null, veil: null }, URL_DE_CUENTA, API).remote, null);
  assert.equal(withAccountBackground({ preset: null, data_url: null, veil: null }, "https://evil.test/a.png", API).remote, null);
});
