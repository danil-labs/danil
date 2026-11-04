import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOf, pageOf, scriptsOf, watchChunks } from "../src/lib/update.web.ts";

test("el build es la lista de scripts del teléfono, no solo la entrada", () => {
  const page = (common: string, entry: string) => `<script src="/m/_expo/static/js/web/__expo-metro-runtime-8c08.js" defer></script>
<script src="/m/_expo/static/js/web/__common-${common}.js" defer></script>
<script src="/m/_expo/static/js/web/entry-${entry}.js" defer></script>`;
  const before = buildOf(scriptsOf(page("6214", "8d49")));
  assert.equal(before, "/m/_expo/static/js/web/__expo-metro-runtime-8c08.js /m/_expo/static/js/web/__common-6214.js /m/_expo/static/js/web/entry-8d49.js");
  // Un deploy que solo cambia `__common` deja la misma entrada.
  assert.notEqual(buildOf(scriptsOf(page("4761", "8d49"))), before);
  assert.equal(buildOf(scriptsOf(page("6214", "8d49"))), before);
  assert.equal(pageOf(before!), "/m/");
  assert.equal(pageOf("/terminus/m/_expo/static/js/web/entry-8d49.js"), "/terminus/m/");
  // La página de inicio de sesión o la de escritorio no son un build del teléfono.
  assert.equal(buildOf(scriptsOf(`<script type="module" src="/assets/web-1234.js"></script>`)), null);
});

test("un trozo que falla se avisa y se sigue rechazando igual", async () => {
  const seen: unknown[] = [];
  const ready = (paths: unknown) => Array.isArray(paths);
  const load = Object.assign(async (path: unknown) => {
    if (path === "gone") throw new Error("Loading module gone failed.");
  }, { isReady: ready });
  const runtime: Record<string, unknown> = { __loadBundleAsync: load };
  assert.equal(watchChunks(runtime, (error) => seen.push(error)), true);
  assert.equal(watchChunks(runtime, () => {}), false, "no se envuelve dos veces");
  const watched = runtime.__loadBundleAsync as typeof load;
  assert.equal(watched.isReady, ready, "Expo sigue sabiendo qué trozos ya cargó");
  await watched("here");
  assert.equal(seen.length, 0);
  await assert.rejects(watched("gone"), /Loading module gone failed/);
  assert.equal(seen.length, 1);
});

test("sin cargador de Metro (o con prefijo) no se rompe nada", () => {
  assert.equal(watchChunks({}, () => {}), false);
  const runtime: Record<string, unknown> = { __METRO_GLOBAL_PREFIX__: "x", x__loadBundleAsync: async () => {} };
  assert.equal(watchChunks(runtime, () => {}), true);
});
