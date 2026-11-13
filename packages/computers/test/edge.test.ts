/**
 * El borde `/v1` desde un navegador (`edge.ts`): la cookie de la página, CSRF en cada
 * escritura, nunca un Bearer, y la persona de `identity/me` leída con tolerancia.
 *
 *   node --test packages/computers/test/edge.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { EdgeError, edgeIdentity, edgeTransport } from "../src/edge.ts";

const ORIGIN = "https://edge.example";

function recorder(answer: (request: Request) => Response | Promise<Response>) {
  const calls: Request[] = [];
  const request: typeof fetch = async (input, init) => {
    const r = new Request(input, init);
    calls.push(r);
    return answer(r);
  };
  return { calls, request };
}

test("cada llamada va con la cookie del borde y sin Authorization; las escrituras con su CSRF", async () => {
  const { calls, request } = recorder(async (r) => {
    const path = new URL(r.url).pathname;
    if (path === "/v1/identity/csrf") return Response.json({ csrf_token: "bound" });
    if (path === "/v1/machines/m1/start") return Response.json({ operation: { operation_id: "op", status: "succeeded" } }, { status: 202 });
    return Response.json({ items: [] });
  });
  const edge = edgeTransport({ origin: ORIGIN, timeoutMs: 1000 }, request);
  await edge.call("machines");
  await edge.mutation("machines/m1/start", { headers: { "Idempotency-Key": "k1" }, body: "{}" });
  for (const r of calls) {
    assert.equal(r.credentials, "include");
    assert.equal(r.cache, "no-store");
    assert.equal(r.redirect, "error");
    assert.equal(r.headers.has("authorization"), false);
    assert.equal(new URL(r.url).origin, ORIGIN);
  }
  const start = calls.find((r) => r.url.endsWith("/start"))!;
  assert.equal(start.method, "POST");
  assert.equal(start.headers.get("x-csrf-token"), "bound");
  assert.equal(start.headers.get("idempotency-key"), "k1");
});

test("un fallo conserva estado, Retry-After y el código del problem+json", async () => {
  const { request } = recorder(async () =>
    Response.json({ code: "organization_selection_required", request_id: "rq" }, { status: 403, headers: { "content-type": "application/problem+json", "retry-after": "7" } }),
  );
  await assert.rejects(edgeTransport({ origin: ORIGIN, timeoutMs: 1000 }, request).call("identity/me"), (e: unknown) => {
    assert.ok(e instanceof EdgeError);
    assert.equal(e.status, 403);
    assert.equal(e.code, "organization_selection_required");
    assert.equal(e.retryAfter, "7");
    assert.equal(e.requestId, "rq");
    return true;
  });
});

test("la persona: id obligatorio; nombre, correo, workspace y organizaciones opcionales; campos nuevos se ignoran", async () => {
  const bodies: unknown[] = [
    { id: "user_A", name: "Ana", email: "ana@example.com", workspace: "11", organizations: [{ id: "org_1", name: "Danil" }], extra: { nested: true } },
    { id: "user_B" },
  ];
  const { request } = recorder(async () => Response.json(bodies.shift()));
  const identity = edgeIdentity(edgeTransport({ origin: ORIGIN, timeoutMs: 1000 }, request), ORIGIN);
  assert.deepEqual(await identity.me(), { id: "user_A", name: "Ana", email: "ana@example.com", workspace: "11", organizations: [{ id: "org_1", name: "Danil" }] });
  assert.deepEqual(await identity.me(), { id: "user_B", name: null, email: null, workspace: null, organizations: [] });
});

test("un cuerpo sin persona no es una sesión", async () => {
  const { request } = recorder(async () => Response.json({ access_token: "no-es-una-persona" }));
  await assert.rejects(edgeIdentity(edgeTransport({ origin: ORIGIN, timeoutMs: 1000 }, request), ORIGIN).me(), /invalid_identity/);
});

test("entrar es la página de identity con la vuelta exacta; salir es una escritura con CSRF", async () => {
  const { calls, request } = recorder(async (r) => (r.url.endsWith("/csrf") ? Response.json({ csrf_token: "bound" }) : new Response(null, { status: 204 })));
  const identity = edgeIdentity(edgeTransport({ origin: ORIGIN, timeoutMs: 1000 }, request), ORIGIN);
  const login = new URL(identity.loginUrl("https://web.example/"));
  assert.equal(login.href.split("?")[0], `${ORIGIN}/v1/identity/login`);
  assert.equal(login.searchParams.get("return_to"), "https://web.example/");
  await identity.logout();
  const logout = calls.find((r) => r.url.endsWith("/identity/logout"))!;
  assert.equal(logout.method, "POST");
  assert.equal(logout.headers.get("x-csrf-token"), "bound");
  assert.ok(logout.headers.get("idempotency-key"));
});

test("una petición que no contesta se corta en su plazo", async () => {
  const request: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      const guard = setTimeout(() => reject(new Error("request did not abort")), 1000);
      init?.signal?.addEventListener("abort", () => { clearTimeout(guard); reject(init.signal?.reason); }, { once: true });
    });
  await assert.rejects(edgeTransport({ origin: ORIGIN, timeoutMs: 10 }, request).call("identity/me"), { name: "TimeoutError" });
});

test("logout rechazado conserva sesión en otra pestaña; confirmado la revoca", async () => {
  for (const failure of ["csrf", "logout", "network"]) {
    let fail = true;
    let authenticated = true;
    const request: typeof fetch = async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/me")) return authenticated ? Response.json({ id: "user_A" }) : new Response(null, { status: 401 });
      const csrf = path.endsWith("/csrf");
      if (fail && (failure === "csrf" ? csrf : !csrf)) {
        if (failure === "network") throw new TypeError("network unavailable");
        return Response.json({ code: "unavailable" }, { status: 503 });
      }
      if (csrf) return Response.json({ csrf_token: "bound" });
      authenticated = false;
      return new Response(null, { status: 204 });
    };
    const tab = () => edgeIdentity(edgeTransport({ origin: ORIGIN, timeoutMs: 1000 }, request), ORIGIN);
    await assert.rejects(tab().logout());
    assert.equal((await tab().me()).id, "user_A", "otra pestaña o recarga conserva sesión tras fallo");
    fail = false;
    await tab().logout();
    await assert.rejects(tab().me(), { status: 401 }, "la salida confirmada revoca la sesión");
  }
});
