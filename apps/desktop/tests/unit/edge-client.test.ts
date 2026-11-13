/**
 * Las llamadas de Desk al borde (`danil_edge_fetch` en Rust, con el Bearer):
 * un 404 o un 501 que Rust ya reintentó llega como `not_available_yet` y el
 * front vuelve a intentar solo, con backoff, hasta que la ruta aparece.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

type Call = { command: string; args: Record<string, unknown> | undefined };

function window(reply: (args: Record<string, unknown> | undefined, n: number) => unknown) {
  const calls: Call[] = [];
  (globalThis as { window?: unknown }).window = {
    __TAURI_INTERNALS__: {
      invoke: async (command: string, args?: Record<string, unknown>) => {
        calls.push({ command, args });
        if (command !== "danil_edge_fetch") throw { detail: "command" };
        return reply(args, calls.length - 1);
      },
    },
  };
  return calls;
}

const edge = () => import("../../src/lib/edge.ts");
const notYet = { what: { clave: "danil.error.not_available_yet" }, detail: "not_available_yet", retry_after_ms: 5 };

test("me, organizations and workspaces go through Rust with the closed paths", async () => {
  const calls = window((args) => ({ path: args?.path }));
  const { me, organizations, workspaces, selectOrganization, selectWorkspace } = await edge();
  await me();
  await organizations();
  await workspaces();
  await selectOrganization("org_1");
  await selectWorkspace("ws_1");
  assert.deepEqual(
    calls.map((c) => [c.args?.method, c.args?.path, c.args?.body ?? null]),
    [
      ["GET", "/v1/identity/me", null],
      ["GET", "/v1/identity/organizations", null],
      ["GET", "/v1/workspaces", null],
      ["POST", "/v1/identity/organizations/select", { organization_id: "org_1" }],
      ["POST", "/v1/workspaces/select", { workspace: "ws_1" }],
    ],
  );
});

test("a route that does not exist yet is retried until it appears", async () => {
  const calls = window((_args, n) => {
    if (n < 3) throw notYet;
    return { items: [{ id: "org_1", name: "Danil", plan: "enterprise", role: "admin" }] };
  });
  const { organizations } = await edge();
  const got = await organizations({ minDelayMs: 1 });
  assert.equal(got.items[0].id, "org_1");
  assert.equal(calls.length, 4);
});

test("other refusals are not retried", async () => {
  const calls = window(() => {
    throw { detail: "no_session" };
  });
  const { workspaces } = await edge();
  const refused = await workspaces({ minDelayMs: 1 }).catch((e: unknown) => e);
  assert.equal((refused as { detail: string }).detail, "no_session");
  assert.equal(calls.length, 1);
});

test("an aborted wait stops retrying", async () => {
  const calls = window(() => {
    throw notYet;
  });
  const { me } = await edge();
  const stop = new AbortController();
  const pending = me({ signal: stop.signal, minDelayMs: 1 });
  setTimeout(() => stop.abort(), 30);
  const refused = await pending.catch((e: unknown) => e);
  assert.equal((refused as { detail: string }).detail, "not_available_yet");
  const seen = calls.length;
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(calls.length, seen, "no more calls after abort");
});

test("the backoff grows, honours the server hint and has a ceiling", async () => {
  const { nextDelay } = await edge();
  assert.equal(nextDelay(0, undefined, 1000), 1000);
  assert.equal(nextDelay(1, undefined, 1000), 2000);
  assert.equal(nextDelay(0, 30_000, 1000), 30_000);
  assert.equal(nextDelay(20, undefined, 1000), 60_000);
});
