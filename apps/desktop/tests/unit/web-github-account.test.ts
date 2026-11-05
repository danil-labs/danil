/**
 * En la web GitHub de la cuenta lo contesta el Worker con la sesión de la
 * persona (`web/github-account.ts` dentro de `web/transport.ts`): no llega a
 * ninguna máquina, vuelve a esta misma página y sus fallos tienen la forma de
 * los del motor.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import "../helpers/catalog.ts";
import { returnToOf, webGithubAccount } from "../../src/web/github-account.ts";
import { notHere } from "../../src/features/settings/github-account/failures.ts";
import { type BrowserHost, createWebTransport } from "../../src/web/transport.ts";

type Seen = { url: string; method?: string; headers?: Record<string, string>; body?: string };

test("a Worker without GitHub account routes keeps the local connection available", async () => {
  for (const body of [{ error: "not_found" }, null]) {
    const { transport } = setup(() => ({ status: 404, body }));
    await assert.rejects(transport.handle("github_account_status", { scope: "w" }), notHere);
  }
  assert.equal(notHere({ detail: "credentials.error.github_unavailable" }), false, "an actual service failure is still reported");
});

const host: BrowserHost = {
  openUrl: () => {},
  confirm: () => true,
  alert: () => {},
  reload: () => {},
  writeText: async () => {},
  readText: async () => "",
};

function setup(reply: (seen: Seen) => { status: number; body: unknown }, href = "https://app.danil.ai/terminus/?github=connected#ajustes") {
  const seen: Seen[] = [];
  const engine: string[] = [];
  let unauthorized = 0;
  const github = webGithubAccount({
    endpoint: "https://computers.example",
    getToken: async () => "jwt",
    onUnauthorized: () => void unauthorized++,
    href: () => href,
    fetch: async (url, init) => {
      const s = { url, method: init?.method, headers: init?.headers, body: init?.body };
      seen.push(s);
      const { status, body } = reply(s);
      return { status, ok: status >= 200 && status < 300, json: async () => body };
    },
  });
  const transport = createWebTransport(
    {
      handle: async (command) => {
        engine.push(command);
        return "de la máquina";
      },
    },
    "0.0.0",
    host,
    github,
  );
  return { transport, seen, engine, unauthorized: () => unauthorized };
}

const credential = { id: "cred_1", kind: "github", status: "active", version: 2, config: { login: "nosoypoot", areas: [] }, machines: [] };

test("github_account_* va al Worker con el JWT y no a una máquina", async () => {
  const { transport, seen, engine } = setup((s) =>
    s.url.endsWith("/authorize")
      ? { status: 200, body: { url: "https://github.com/login/oauth/authorize?state=s", expires_at: null } }
      : s.url.endsWith("/areas")
        ? { status: 200, body: { credential: { ...credential, version: 3 } } }
        : { status: 200, body: { connected: true, credential, install_url: "https://github.com/apps/terminus-app/installations/new" } },
  );
  const status = (await transport.handle("github_account_status", { scope: "fqgx1w8m" })) as { connected: boolean; credential: { config: { login: string } } };
  assert.equal(status.connected, true);
  assert.equal(status.credential.config.login, "nosoypoot");
  assert.equal(seen[0]?.url, "https://computers.example/v1/workspaces/fqgx1w8m/github");
  assert.equal(seen[0]?.headers?.authorization, "Bearer jwt");

  const authorize = (await transport.handle("github_account_authorize", { scope: "fqgx1w8m" })) as { url: string };
  assert.equal(authorize.url, "https://github.com/login/oauth/authorize?state=s");
  assert.deepEqual(JSON.parse(seen[1]?.body ?? "null"), { return_to: "https://app.danil.ai/terminus/" }, "vuelve a esta página, sin la marca de la vuelta anterior");

  const areas = [{ key: "danil-labs", installation_id: 7, repository_ids: null }];
  const put = (await transport.handle("github_account_set_areas", { scope: "fqgx1w8m", areas })) as { credential: { version: number } };
  assert.equal(put.credential.version, 3);
  assert.equal(seen[2]?.method, "PUT");
  assert.deepEqual(JSON.parse(seen[2]?.body ?? "null"), { areas: [{ key: "danil-labs", installation_id: 7 }] });

  assert.deepEqual(await transport.handle("github_account_disconnect", { scope: "fqgx1w8m" }), { ok: true });
  assert.equal(seen[3]?.method, "DELETE");

  await transport.handle("account_credential_remove_machine", { scope: "fqgx1w8m", credential: "cred_1", computer: "cmp_vm" });
  assert.equal(seen[4]?.url, "https://computers.example/v1/workspaces/fqgx1w8m/credentials/cred_1/machines/cmp_vm");

  assert.deepEqual(engine, [], "ninguna máquina recibió nada");
  assert.equal(await transport.handle("list_projects", {}), "de la máquina", "lo demás sigue yendo a las máquinas");
  assert.deepEqual(engine, ["list_projects"]);
});

test("los fallos del Worker llegan como los del motor; un 401 renueva la sesión", async () => {
  const codes: Record<string, { status: number; body: unknown }> = {
    "/github": { status: 403, body: { error: { code: "workspace_not_linked" } } },
    "/installations": { status: 409, body: { error: { code: "github_reauthorize" } } },
    "/authorize": { status: 401, body: null },
  };
  const { transport, unauthorized } = setup((s) => codes[Object.keys(codes).find((k) => s.url.endsWith(k)) ?? ""] ?? { status: 500, body: null });
  await assert.rejects(transport.handle("github_account_status", { scope: "w" }), (e: { what: unknown; detail: string }) => {
    assert.equal(e.detail, "credentials.error.workspace_not_linked");
    assert.equal(e.what, "Esta computadora no tiene sesión de Danil para este workspace. Inicia sesión en Danil para que tus tareas usen tu GitHub.");
    return true;
  });
  await assert.rejects(transport.handle("github_account_installations", { scope: "w" }), { detail: "credentials.error.github_reauthorize" });
  await assert.rejects(transport.handle("github_account_authorize", { scope: "w" }), { detail: "credentials.error.unauthorized" });
  assert.equal(unauthorized(), 1);
  await assert.rejects(transport.handle("github_account_status", {}), { detail: "credentials.error.bad_request" }, "sin workspace no se pregunta");
});

test("return_to es la página actual sin la marca de GitHub ni el ancla", () => {
  assert.equal(returnToOf("https://app.danil.ai/terminus/w/fqgx1w8m?x=1&github=error&code=denied#a"), "https://app.danil.ai/terminus/w/fqgx1w8m?x=1");
  assert.equal(returnToOf("https://app.danil.ai/terminus/"), "https://app.danil.ai/terminus/");
});

test("las instalaciones llegan del Worker con su página, su número de repos y la pendiente", async () => {
  const installations = {
    installations: [
      { key: "danil-labs", installation_id: 7, account: { login: "danil-labs", type: "Organization", avatar: null }, repository_selection: "all", html_url: "https://github.com/organizations/danil-labs/settings/installations/7" },
      { key: "nosoypoot", installation_id: 8, account: { login: "nosoypoot", type: "User" }, repository_selection: "selected", repository_count: 3 },
    ],
    install_url: "https://github.com/apps/danil/installations/new?state=s",
    install_pending: true,
  };
  const { transport, seen, engine } = setup(() => ({ status: 200, body: installations }));
  const listed = (await transport.handle("github_account_installations", { scope: "w" })) as {
    installations: { html_url: string | null; repository_count: number | null }[];
    install_pending: boolean;
  };
  assert.equal(seen[0]?.url, "https://computers.example/v1/workspaces/w/github/installations");
  assert.deepEqual(listed.installations.map((i) => [i.html_url, i.repository_count]), [
    ["https://github.com/organizations/danil-labs/settings/installations/7", null],
    [null, 3],
  ]);
  assert.equal(listed.install_pending, true);
  assert.deepEqual(engine, []);
});
