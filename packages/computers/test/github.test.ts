import assert from "node:assert/strict";
import { test } from "node:test";
import {
  disconnectGithub,
  type GithubFetch,
  type GithubSource,
  githubAuthorize,
  githubInstallations,
  githubStatus,
  githubStatusOf,
  removeGithubMachine,
  restoreGithubMachine,
  setGithubAreas,
} from "../src/index.ts";

type Seen = { url: string; method?: string; headers?: Record<string, string>; body?: string };

function source(status: number, body: unknown, seen: Seen[] = []): GithubSource {
  const fetch: GithubFetch = async (url, init) => {
    seen.push({ url, method: init?.method, headers: init?.headers, body: init?.body });
    return { status, ok: status >= 200 && status < 300, json: async () => body };
  };
  return { endpoint: "https://computers.example", getToken: async () => "jwt", fetch };
}

const credential = {
  id: "cred_1",
  workspace_id: "w",
  kind: "github",
  provider: "github",
  slot: "proveedores/github-account",
  label: "nosoypoot",
  hint: null,
  delivery: "issued",
  status: "active",
  config: { github_user_id: 42, login: "nosoypoot", avatar: "https://avatars.example/42", areas: [{ key: "danil-labs", installation_id: 7, repository_ids: null }, { key: 1 }] },
  version: 3,
  machines: [
    { computer_id: "cmp_vm", name: "vm-alberto", state: "active", version: 3, created_at: "2026-10-23T00:00:00Z", last_seen_at: null },
    { computer_id: "cmp_mac", name: null, state: "removed" },
    { name: "sin id" },
  ],
};

test("el estado de GitHub sale del Worker con el JWT: login, áreas y máquinas", async () => {
  const seen: Seen[] = [];
  const answer = await githubStatus(source(200, { connected: true, credential, install_url: "https://github.com/apps/terminus-app/installations/new" }, seen), "w 1");
  assert.equal(seen[0]?.url, "https://computers.example/v1/workspaces/w%201/github");
  assert.equal(seen[0]?.method, "GET");
  assert.equal(seen[0]?.headers?.authorization, "Bearer jwt");
  assert.equal(answer.kind, "ok");
  if (answer.kind !== "ok") return;
  assert.equal(answer.value.connected, true);
  assert.equal(answer.value.install_url, "https://github.com/apps/terminus-app/installations/new");
  assert.equal(answer.value.credential?.config.login, "nosoypoot");
  assert.deepEqual(answer.value.credential?.config.areas, [{ key: "danil-labs", installation_id: 7, repository_ids: null }]);
  assert.deepEqual(
    answer.value.credential?.machines.map((m) => [m.computer_id, m.name, m.state]),
    [
      ["cmp_vm", "vm-alberto", "active"],
      ["cmp_mac", null, "removed"],
    ],
  );
  // Lo que ya está leído se vuelve a leer igual: la ventana pasa la respuesta del motor por el mismo lector.
  assert.deepEqual(githubStatusOf(answer.value), answer.value);
});

test("sin credencial no hay conexión, y reautorizar se distingue", async () => {
  const none = await githubStatus(source(200, { connected: false, credential: null, install_url: null }), "w");
  assert.deepEqual(none, { kind: "ok", value: { connected: false, credential: null, install_url: null } });
  const stale = await githubStatus(source(200, { connected: true, credential: { ...credential, status: "reauthorize" } }), "w");
  assert.equal(stale.kind === "ok" ? stale.value.credential?.status : null, "reauthorize");
});

test("autorizar manda return_to solo si lo hay; sin él el Worker usa su página", async () => {
  const seen: Seen[] = [];
  const web = await githubAuthorize(source(200, { url: "https://github.com/login/oauth/authorize?x=1", expires_at: "2026-10-23T01:00:00Z" }, seen), "w", "https://app.danil.ai/terminus/");
  assert.deepEqual(web, { kind: "ok", value: { url: "https://github.com/login/oauth/authorize?x=1", expires_at: "2026-10-23T01:00:00Z", opened: false } });
  assert.equal(seen[0]?.url, "https://computers.example/v1/workspaces/w/github/authorize");
  assert.equal(seen[0]?.method, "POST");
  assert.equal(seen[0]?.headers?.["content-type"], "application/json");
  assert.deepEqual(JSON.parse(seen[0]?.body ?? "null"), { return_to: "https://app.danil.ai/terminus/" });
  await githubAuthorize(source(200, { url: "https://github.com/x" }, seen), "w");
  assert.deepEqual(JSON.parse(seen[1]?.body ?? "null"), {});
  const bad = await githubAuthorize(source(400, { error: { code: "invalid_return_to" } }), "w", "https://evil.example/");
  assert.deepEqual(bad, { kind: "failed", status: 400, code: "invalid_return_to" });
});

test("instalaciones, áreas y desconectar van a sus rutas", async () => {
  const seen: Seen[] = [];
  const list = await githubInstallations(
    source(200, {
      installations: [
        {
          key: "danil-labs",
          installation_id: 7,
          account: { login: "danil-labs", type: "Organization", avatar: null },
          repository_selection: "all",
          html_url: "https://github.com/organizations/danil-labs/settings/installations/7",
        },
        { key: "nosoypoot", installation_id: 8, account: {}, repository_selection: "selected", repository_count: 3 },
        { nope: true },
      ],
      install_url: "https://github.com/apps/terminus-app/installations/new",
      install_pending: true,
    }, seen),
    "w",
  );
  assert.equal(seen[0]?.url, "https://computers.example/v1/workspaces/w/github/installations");
  assert.equal(list.kind, "ok");
  if (list.kind === "ok") {
    assert.deepEqual(list.value.installations.map((i) => [i.key, i.installation_id, i.account.login, i.repository_selection]), [
      ["danil-labs", 7, "danil-labs", "all"],
      ["nosoypoot", 8, "nosoypoot", "selected"],
    ]);
    assert.deepEqual(list.value.installations.map((i) => [i.html_url, i.repository_count]), [
      ["https://github.com/organizations/danil-labs/settings/installations/7", null],
      [null, 3],
    ]);
    assert.equal(list.value.install_pending, true);
  }
  // Un Worker anterior no manda `html_url`, `repository_count` ni `install_pending`.
  const old = await githubInstallations(source(200, { installations: [], install_url: null }), "w");
  assert.deepEqual(old, { kind: "ok", value: { installations: [], install_url: null, install_pending: false } });

  const put = await setGithubAreas(source(200, { credential: { ...credential, version: 4 } }, seen), "w", [
    { key: "danil-labs", installation_id: 7, repository_ids: null },
    { key: "nosoypoot", installation_id: 8, repository_ids: [1, 2] },
  ]);
  assert.equal(seen[1]?.url, "https://computers.example/v1/workspaces/w/github/areas");
  assert.equal(seen[1]?.method, "PUT");
  assert.deepEqual(JSON.parse(seen[1]?.body ?? "null"), {
    areas: [
      { key: "danil-labs", installation_id: 7 },
      { key: "nosoypoot", installation_id: 8, repository_ids: [1, 2] },
    ],
  });
  assert.equal(put.kind === "ok" ? put.value.version : null, 4);

  assert.deepEqual(await disconnectGithub(source(200, { ok: true }, seen), "w"), { kind: "ok", value: null });
  assert.equal(seen[2]?.method, "DELETE");
  assert.equal(seen[2]?.url, "https://computers.example/v1/workspaces/w/github");
});

test("quitar y volver a poner una máquina usan las rutas comunes de credenciales", async () => {
  const seen: Seen[] = [];
  await removeGithubMachine(source(200, { credential }, seen), "w", "cred_1", "cmp_vm");
  await restoreGithubMachine(source(200, { credential }, seen), "w", "cred_1", "cmp_vm");
  assert.deepEqual(
    seen.map((s) => [s.method, s.url]),
    [
      ["DELETE", "https://computers.example/v1/workspaces/w/credentials/cred_1/machines/cmp_vm"],
      ["POST", "https://computers.example/v1/workspaces/w/credentials/cred_1/machines/cmp_vm/restore"],
    ],
  );
});

test("cada fallo conserva el código del Worker; la red caída no es una respuesta", async () => {
  assert.deepEqual(await githubStatus(source(401, null), "w"), { kind: "unauthorized" });
  assert.deepEqual(await githubStatus(source(403, { error: { code: "license_required" } }), "w"), { kind: "failed", status: 403, code: "license_required" });
  assert.deepEqual(await githubStatus(source(403, { error: { code: "workspace_not_linked" } }), "w"), { kind: "failed", status: 403, code: "workspace_not_linked" });
  assert.deepEqual(await githubStatus(source(503, { error: { code: "github_disabled" } }), "w"), { kind: "failed", status: 503, code: "github_disabled" });
  assert.deepEqual(await githubStatus(source(200, ["nope"]), "w"), { kind: "failed", status: 200, code: "bad_response" });
  const down: GithubSource = { endpoint: "x.example", getToken: async () => "t", fetch: async () => Promise.reject(new Error("red")) };
  assert.deepEqual(await githubStatus(down, "w"), { kind: "failed", status: null, code: null });
});
