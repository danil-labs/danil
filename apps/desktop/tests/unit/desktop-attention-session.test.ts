import assert from "node:assert/strict";
import { test } from "node:test";
import { sessionFetch } from "../../../../packages/attention/src/request.ts";
import { windowSession } from "../../src/features/attention/desktop-session.ts";

const PREFIX = "/terminus/alpha-api";

/** El BFF de la ventana: una vista vieja recibe 409 hasta que se entra al workspace y se renueva el token. */
function bff(renewed: boolean) {
  const calls: string[] = [];
  const invokes: { command: string; args: Record<string, unknown> }[] = [];
  let entered = false;
  let refreshed = false;
  const request = (async (url: string, init: RequestInit = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    calls.push(`${method} ${url.slice(PREFIX.length)}`);
    if (url.endsWith("/api/workspace/enter")) {
      entered = true;
      return Response.json({ ok: true });
    }
    if (entered && refreshed) return Response.json({ conversations: [] });
    return Response.json({ error: "workspace_context_mismatch" }, { status: 409 });
  }) as typeof fetch;
  const invoke = async (command: string, args: Record<string, unknown>) => {
    invokes.push({ command, args });
    refreshed = renewed;
    return renewed;
  };
  const session = windowSession(invoke, () => ({ request, prefix: PREFIX }));
  session.rememberWorkspace("a:476");
  return { calls, invokes, send: sessionFetch(session, request) };
}

test("a 409 workspace_context_mismatch enters again, renews the window session and repeats once", async () => {
  const b = bff(true);
  const response = await b.send(`${PREFIX}/api/conversations`);
  assert.equal(response.status, 200);
  assert.deepEqual(b.calls, ["GET /api/conversations", "POST /api/workspace/enter", "GET /api/conversations"]);
  assert.deepEqual(b.invokes, [{ command: "agents_session_refresh", args: {} }], "the main window session, without account");
});

test("if the renewal fails, the request is not repeated and the 409 reaches the view", async () => {
  const b = bff(false);
  const response = await b.send(`${PREFIX}/api/conversations`);
  assert.equal(response.status, 409);
  assert.deepEqual(b.calls, ["GET /api/conversations", "POST /api/workspace/enter"]);
  assert.equal(b.invokes.length, 1);
});
