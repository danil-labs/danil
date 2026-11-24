import assert from "node:assert/strict";
import test from "node:test";
import type { EdgeTransport } from "../../../../packages/platform-client/src/edge.ts";
import { composeControlPlane, webEdgeGithubAccount } from "../../../../packages/session/src/github-account.ts";
import { createWebTransport, type BrowserHost } from "../../../../packages/session/src/transport.ts";

const host: BrowserHost = {
  openUrl: () => {},
  confirm: () => true,
  alert: () => {},
  reload: () => {},
  writeText: async () => {},
  readText: async () => "",
};

test("webEdgeGithubAccount routes github_account_* commands over EdgeTransport without hitting engine", async () => {
  const calls: { method: string; path: string; body?: string }[] = [];
  const transport: EdgeTransport = {
    call: async (path) => {
      calls.push({ method: "GET", path });
      if (path === "workspaces/ws_1/github") {
        return new Response(JSON.stringify({ connected: false, credential: null, install_url: "https://github.com/apps/danil" }), { status: 200 });
      }
      if (path === "workspaces/ws_1/github/installations") {
        return new Response(JSON.stringify({ installations: [], install_url: null, install_pending: false }), { status: 200 });
      }
      return new Response(null, { status: 404 });
    },
    mutation: async (path, init) => {
      calls.push({ method: init?.method ?? "POST", path, body: typeof init?.body === "string" ? init.body : undefined });
      if (path === "workspaces/ws_1/github/authorize") {
        return new Response(JSON.stringify({ url: "https://github.com/login/oauth/authorize", expires_at: null, opened: false }), { status: 200 });
      }
      return new Response(null, { status: 204 });
    },
  };

  let engineCalls = 0;
  const sessionHandler = {
    answers: (cmd: string) => cmd === "danil_session_status",
    handle: async () => ({ state: "connected", sessions: [] }),
  };
  const githubHandler = webEdgeGithubAccount("https://api.danil.ai", transport, () => "https://beta.danil.ai/terminus/?github=ok");
  const web = createWebTransport(
    { handle: async () => { engineCalls++; throw { detail: "no_machine" }; } },
    "0.3.5",
    host,
    composeControlPlane(sessionHandler, githubHandler),
  );

  const status = await web.handle("github_account_status", { scope: "ws_1" }) as { connected: boolean; install_url: string };
  assert.equal(status.connected, false);
  assert.equal(status.install_url, "https://github.com/apps/danil");

  const auth = await web.handle("github_account_authorize", { scope: "ws_1" }) as { url: string };
  assert.equal(auth.url, "https://github.com/login/oauth/authorize");
  const authCall = calls.find((c) => c.path === "workspaces/ws_1/github/authorize");
  const authBody = JSON.parse(authCall?.body ?? "{}") as { return_to?: string };
  assert.equal(authBody.return_to, "https://beta.danil.ai/terminus/");

  const session = await web.handle("danil_session_status") as { state: string };
  assert.equal(session.state, "connected");
  assert.equal(engineCalls, 0, "engine router must not be called for control plane commands");
});
