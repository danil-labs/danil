import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { platformFetch, setEdgeContext } from "../src/client.ts";

const EDGE = "https://edge.test";
const real = globalThis.fetch;
/** Lo que llega a la red: el `X-Danil-Session` de cada llamada. */
function captured() {
  const seen: (string | null)[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    seen.push(new Headers(init?.headers).get("X-Danil-Session"));
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  return seen;
}
afterEach(() => { globalThis.fetch = real; setEdgeContext(null); });

test("una ruta con organización sin contexto propio lleva el del grupo activo", async () => {
  const seen = captured();
  setEdgeContext(EDGE, () => "ctx_danil");
  await platformFetch(`${EDGE}/v1/workspaces/w1/logo`, { method: "PUT", body: "x" });
  await platformFetch(`${EDGE}/v1/workspaces/w1/background`, { method: "DELETE" });
  await platformFetch(`${EDGE}/v1/workspaces/preferences`);
  assert.deepEqual(seen, ["ctx_danil", "ctx_danil", "ctx_danil"]);
});

test("el contexto que ya puso quien llama se respeta", async () => {
  const seen = captured();
  setEdgeContext(EDGE, () => "ctx_danil");
  await platformFetch(`${EDGE}/v1/machines`, { headers: { "X-Danil-Session": "ctx_personal" } });
  assert.deepEqual(seen, ["ctx_personal"]);
});

test("ctx=none, otro origen o sin ventana: sin encabezado", async () => {
  const seen = captured();
  await platformFetch(`${EDGE}/v1/machines`);
  setEdgeContext(EDGE, () => "ctx_danil");
  await platformFetch(`${EDGE}/v1/workspaces`);
  await platformFetch(`${EDGE}/v1/identity/sessions/catalog`);
  await platformFetch(`${EDGE}/v1/identity/organizations/select`, { method: "POST" });
  await platformFetch("https://updates.test/v1/latest.json");
  assert.deepEqual(seen, [null, null, null, null, null]);
});
