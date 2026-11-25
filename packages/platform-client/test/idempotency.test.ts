import assert from "node:assert/strict";
import { test } from "node:test";
import { deleteCredential, putCredential, removeCredentialMachine, restoreCredentialMachine } from "../src/account-credentials.ts";
import { edgeTransport, type EdgeTransport } from "../src/edge.ts";
import { edgeUntil, type EdgeReply } from "../src/client.ts";
import { webCredentialSource } from "../src/credentials.ts";

const ORIGIN = "https://edge.test";
const CREDENTIAL = { credential_id: "cred_1", kind: "api_key", provider: "openai", slot: "openai", label: null, hint: null, config: {}, machines: [] };
const PUT = { kind: "api_key" as const, provider: "openai", slot: "openai", label: null, hint: null, config: {}, copies: [{ computer_id: "cmp_1", sealed: "c2VhbGVk" }] };

/** El borde de la web sobre un `fetch` de mentira: la `Idempotency-Key` de cada escritura (sin la del CSRF). */
function web(statuses: number[] = [200]) {
  const keys: (string | null)[] = [];
  let n = 0;
  const request = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/v1/identity/csrf")) return Response.json({ csrf_token: "csrf" });
    keys.push(new Headers(init?.headers).get("Idempotency-Key"));
    const status = statuses[Math.min(n++, statuses.length - 1)]!;
    return Response.json({ credential: CREDENTIAL }, { status });
  }) as typeof fetch;
  return { keys, transport: edgeTransport({ origin: ORIGIN, timeoutMs: 5_000 }, request) };
}

/** Un transporte que reintenta la misma escritura tras un 503, con el mismo `init`. */
const retrying = (inner: EdgeTransport): EdgeTransport => ({
  call: inner.call,
  async mutation(path, init) {
    try { return await inner.mutation(path, init); } catch { return inner.mutation(path, init); }
  },
});

test("las 4 escrituras de cuentas de IA mandan Idempotency-Key, distinta por operación", async () => {
  const { keys, transport } = web();
  const source = webCredentialSource(ORIGIN, transport);
  assert.equal((await putCredential(source, "w1", PUT)).kind, "ok");
  assert.equal((await putCredential(source, "w1", PUT)).kind, "ok");
  await deleteCredential(source, "w1", "cred_1");
  await removeCredentialMachine(source, "w1", "cred_1", "cmp_1");
  await restoreCredentialMachine(source, "w1", "cred_1", "cmp_1");
  assert.equal(keys.length, 5);
  assert.ok(keys.every(k => k !== null && /^[0-9a-f-]{36}$/.test(k)), keys.join(","));
  assert.equal(new Set(keys).size, 5);
});

test("el reintento de una escritura de cuentas repite su llave", async () => {
  const { keys, transport } = web([503, 200]);
  const answer = await putCredential(webCredentialSource(ORIGIN, retrying(transport)), "w1", PUT);
  assert.equal(answer.kind, "ok");
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
});

test("dos reintentos del llamador con la misma key mandan la misma llave", async () => {
  const { keys, transport } = web([503]);
  const source = webCredentialSource(ORIGIN, transport);
  for (const write of [
    (key: string) => putCredential(source, "w1", PUT, key),
    (key: string) => deleteCredential(source, "w1", "cred_1", key),
    (key: string) => removeCredentialMachine(source, "w1", "cred_1", "cmp_1", key),
    (key: string) => restoreCredentialMachine(source, "w1", "cred_1", "cmp_1", key),
  ]) {
    keys.length = 0;
    assert.equal((await write("op-1")).kind, "error");
    assert.equal((await write("op-1")).kind, "error");
    assert.deepEqual(keys, ["op-1", "op-1"]);
  }
});

test("edgeUntil repite la llave en cada reintento y estrena una por escritura", async () => {
  const keys: (string | undefined)[] = [];
  let n = 0;
  const send = async <T>(_m: string, _p: string, _b?: unknown, key?: string) => {
    keys.push(key);
    return { status: n++ % 2 === 0 ? 503 : 200, body: null } as EdgeReply<T>;
  };
  await edgeUntil("PUT", "/v1/x", {}, { minDelayMs: 0 }, { send });
  await edgeUntil("PUT", "/v1/x", {}, { minDelayMs: 0 }, { send });
  assert.equal(keys.length, 4);
  assert.equal(keys[0], keys[1]);
  assert.equal(keys[2], keys[3]);
  assert.notEqual(keys[0], keys[2]);
});
