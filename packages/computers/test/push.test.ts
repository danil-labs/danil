import assert from "node:assert/strict";
import { test } from "node:test";
import { type Fetch, forgetPushDevice, keyBytes, pushPublicKey, savePushDevice } from "../src/index.ts";

type Call = { url: string; method?: string; headers?: Record<string, string>; body?: string };

function fake(status: number, body: unknown, calls: Call[] = []): Fetch {
  return async (url, init) => {
    calls.push({ url, ...init });
    return { status, ok: status >= 200 && status < 300, json: async () => body };
  };
}

test("la llave pública sale de /v1/push/config; apagado o sin red es null", async () => {
  const calls: Call[] = [];
  assert.equal(await pushPublicKey("https://computers-dev.danil.ai", fake(200, { public_key: "BKey" }, calls)), "BKey");
  assert.equal(calls[0]?.url, "https://computers-dev.danil.ai/v1/push/config");
  assert.equal(await pushPublicKey("https://c.test", fake(503, { error: { code: "push_disabled" } })), null);
  assert.equal(await pushPublicKey("https://c.test", async () => { throw new Error("offline"); }), null);
});

test("guardar y olvidar mandan el dispositivo con el token de la persona", async () => {
  const calls: Call[] = [];
  const device = { endpoint: "https://web.push.apple.com/x", p256dh: "p", auth: "a", user_agent: "iPhone" };
  assert.deepEqual(await savePushDevice("https://c.test", "jwt", device, fake(204, null, calls)), { kind: "ok", value: null });
  assert.deepEqual(await forgetPushDevice("https://c.test", "jwt", device, fake(204, null, calls)), { kind: "ok", value: null });
  assert.deepEqual(calls.map((c) => [c.method, c.url, c.headers?.authorization, JSON.parse(c.body ?? "null")]), [
    ["POST", "https://c.test/v1/push/subscriptions", "Bearer jwt", device],
    ["DELETE", "https://c.test/v1/push/subscriptions", "Bearer jwt", { endpoint: device.endpoint }],
  ]);
  assert.deepEqual(await savePushDevice("https://c.test", "jwt", device, fake(401, null)), { kind: "unauthorized" });
});

test("la llave base64url llega en bytes", () => {
  assert.deepEqual([...keyBytes("AQID_-8")], [1, 2, 3, 255, 239]);
});
