import assert from "node:assert/strict";
import { test } from "node:test";
import { APP_READS, chatBackgroundImageUrl, chatBackgroundView, isAppCommand } from "../src/index.ts";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

test("la imagen, el patrón y el velo del workspace", () => {
  assert.deepEqual(chatBackgroundView({ preset: null, data_url: PNG, veil: { chat: 0.6, tabs: 0.3, panels: 2 } }), {
    image: PNG,
    preset: null,
    veil: { chat: 0.6, tabs: 0.3, panels: 1 },
  });
  assert.equal(chatBackgroundView({ preset: "dusk", data_url: PNG, veil: null }).image, null, "un patrón elegido manda sobre la imagen guardada");
  assert.deepEqual(chatBackgroundView({ preset: "dusk", data_url: null, veil: 0.5 }).veil, { chat: 0.5, tabs: null, panels: null });
});

test("sin elección, o con algo que no es una imagen en línea, no hay imagen ni velo", () => {
  for (const answer of [null, undefined, "x", {}, { preset: "  ", data_url: "https://evil.test/a.png", veil: "0.4" }]) {
    assert.deepEqual(chatBackgroundView(answer), { image: null, preset: null, veil: { chat: null, tabs: null, panels: null } });
  }
});

test("el teléfono puede leer el fondo", () => {
  assert.ok((APP_READS as readonly string[]).includes("chat_background"));
  assert.ok(isAppCommand("chat_background"));
  assert.ok(!isAppCommand("set_chat_background"));
});

test("la imagen en la cuenta (`image_url`) solo sin patrón y solo por https", () => {
  const url = "https://computers.danil.ai/v1/workspaces/w1/background?v=abc";
  assert.equal(chatBackgroundImageUrl({ preset: null, data_url: null, image_url: url, veil: null }), url);
  assert.equal(chatBackgroundImageUrl({ preset: "dusk", data_url: null, image_url: url, veil: null }), null);
  assert.equal(chatBackgroundImageUrl({ preset: null, data_url: null, image_url: "http://x.test/a", veil: null }), null);
  assert.equal(chatBackgroundImageUrl({ preset: null, data_url: PNG, veil: null }), null, "un motor anterior no la manda");
  assert.equal(chatBackgroundImageUrl(null), null);
});
