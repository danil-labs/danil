import assert from "node:assert/strict";
import { test } from "node:test";
import { type BlobFetch, accountAssetUrl, readAccountAsset } from "../src/index.ts";

const ENDPOINT = "https://computers.test";
const LOGO = `${ENDPOINT}/v1/workspaces/w1/logo`;
const serve = (status: number, blob: Blob, seen: { url?: string; auth?: string } = {}): BlobFetch => async (input, init) => {
  seen.url = input;
  seen.auth = init?.headers?.authorization;
  return { status, ok: status >= 200 && status < 300, blob: async () => blob };
};
const png = (bytes = 8) => new Blob([new Uint8Array(bytes)], { type: "image/png" });

test("el logo de la cuenta se lee con la sesión y solo del plano de control", async () => {
  const seen: { url?: string; auth?: string } = {};
  const blob = await readAccountAsset(ENDPOINT, LOGO, "logo", "jwt", serve(200, png(), seen));
  assert.equal(blob?.type, "image/png");
  assert.equal(seen.url, LOGO);
  assert.equal(seen.auth, "Bearer jwt");
  // Otro origen: la sesión no sale.
  let asked = false;
  assert.equal(await readAccountAsset(ENDPOINT, "https://elsewhere.example/logo.png", "logo", "jwt", async () => { asked = true; throw new Error("no"); }), null);
  assert.equal(asked, false);
  assert.equal(accountAssetUrl(ENDPOINT, "no es una url"), null);
  assert.equal(accountAssetUrl(ENDPOINT, null), null);
});

test("lo que no se puede pintar es null, sin error", async () => {
  let unauthorized = 0;
  assert.equal(await readAccountAsset(ENDPOINT, LOGO, "logo", "jwt", serve(401, png()), () => unauthorized++), null);
  assert.equal(unauthorized, 1);
  assert.equal(await readAccountAsset(ENDPOINT, LOGO, "logo", "jwt", serve(404, png())), null);
  assert.equal(await readAccountAsset(ENDPOINT, LOGO, "logo", "jwt", serve(200, new Blob(["<svg/>"], { type: "image/svg+xml" }))), null);
  assert.equal(await readAccountAsset(ENDPOINT, LOGO, "logo", "jwt", serve(200, png(1024 * 1024 + 1))), null);
  assert.ok(await readAccountAsset(ENDPOINT, LOGO, "background", "jwt", serve(200, png(1024 * 1024 + 1))));
  assert.equal(await readAccountAsset(ENDPOINT, LOGO, "logo", "jwt", async () => { throw new Error("red"); }), null);
});
