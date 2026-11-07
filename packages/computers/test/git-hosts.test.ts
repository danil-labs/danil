import assert from "node:assert/strict";
import { test } from "node:test";
import {
  disconnectGitHost,
  type GithubFetch,
  type GithubSource,
  gitHostAreas,
  gitHostAuthorize,
  gitHostStatus,
  removeGitHostMachine,
  restoreGitHostMachine,
} from "../src/index.ts";

type Seen = { url: string; method?: string; headers?: Record<string, string>; body?: string };

function source(status: number, body: unknown, seen: Seen[] = []): GithubSource {
  const fetch: GithubFetch = async (url, init) => {
    seen.push({ url, method: init?.method, headers: init?.headers, body: init?.body });
    return { status, ok: status >= 200 && status < 300, json: async () => body };
  };
  return { endpoint: "https://computers.example", getToken: async () => "jwt", fetch };
}

const gitlab = {
  id: "cred_gl",
  workspace_id: null,
  kind: "gitlab",
  provider: "gitlab",
  label: "aceballos",
  status: "active",
  version: 2,
  config: { gitlab_user_id: 77, login: "aceballos", avatar: "https://gitlab.com/uploads/77.png" },
  machines: [{ computer_id: "cmp_vm", name: "vm-alberto", state: "active" }, { computer_id: "cmp_mac", state: "removed" }, { name: "sin id" }],
};
const bitbucket = { ...gitlab, id: "cred_bb", kind: "bitbucket", provider: "bitbucket", config: { bitbucket_uuid: "{u-1}", login: "alberto", avatar: null } };

test("el estado de GitLab sale de la ruta de la persona, sin workspace", async () => {
  const seen: Seen[] = [];
  const answer = await gitHostStatus(source(200, { connected: true, credential: gitlab, manage_url: "https://gitlab.com/-/user_settings/applications" }, seen), "gitlab");
  assert.equal(seen[0]?.url, "https://computers.example/v1/git-hosts/gitlab");
  assert.equal(seen[0]?.method, "GET");
  assert.equal(seen[0]?.headers?.authorization, "Bearer jwt");
  assert.equal(answer.kind, "ok");
  if (answer.kind !== "ok") return;
  assert.equal(answer.value.connected, true);
  assert.equal(answer.value.manage_url, "https://gitlab.com/-/user_settings/applications");
  assert.deepEqual(answer.value.credential?.config, { user_id: "77", login: "aceballos", name: null, avatar: "https://gitlab.com/uploads/77.png" });
  assert.deepEqual(answer.value.credential?.machines.map((m) => [m.computer_id, m.state]), [["cmp_vm", "active"], ["cmp_mac", "removed"]]);
});

test("Bitbucket se identifica por su uuid y una credencial de otro proveedor no cuenta como conexión", async () => {
  const ok = await gitHostStatus(source(200, { connected: true, credential: bitbucket, manage_url: null }), "bitbucket");
  assert.equal(ok.kind === "ok" && ok.value.credential?.config.user_id, "{u-1}");
  const other = await gitHostStatus(source(200, { connected: true, credential: gitlab, manage_url: null }), "bitbucket");
  assert.deepEqual(other.kind === "ok" && other.value, { connected: false, credential: null, manage_url: null });
  const none = await gitHostStatus(source(200, { connected: true, credential: null }), "gitlab");
  assert.equal(none.kind === "ok" && none.value.connected, false, "without a credential there is no connection");
});

test("autorizar pide la URL con la página de vuelta", async () => {
  const seen: Seen[] = [];
  const answer = await gitHostAuthorize(source(200, { url: "https://gitlab.com/oauth/authorize?state=s", expires_at: "2026-11-05T10:10:00Z" }, seen), "gitlab", "https://app.danil.ai/terminus/");
  assert.equal(seen[0]?.url, "https://computers.example/v1/git-hosts/gitlab/authorize");
  assert.equal(seen[0]?.method, "POST");
  assert.deepEqual(JSON.parse(seen[0]?.body ?? "null"), { return_to: "https://app.danil.ai/terminus/" });
  assert.deepEqual(answer, { kind: "ok", value: { url: "https://gitlab.com/oauth/authorize?state=s", expires_at: "2026-11-05T10:10:00Z" } });
  const plain: Seen[] = [];
  await gitHostAuthorize(source(200, { url: "https://bitbucket.org/site/oauth2/authorize" }, plain), "bitbucket");
  assert.equal(plain[0]?.body, "{}");
});

test("las áreas traen su enlace web y nada que no sea https", async () => {
  const seen: Seen[] = [];
  const answer = await gitHostAreas(
    source(200, {
      areas: [
        { key: "aceballos", name: "Alberto", kind: "user", url: "https://gitlab.com/aceballos" },
        { key: "raelay", name: "Raelay Labs", kind: "group", url: "https://gitlab.com/groups/raelay" },
        { key: "rara", kind: "otra", url: "javascript:alert(1)" },
        { name: "sin clave" },
      ],
      manage_url: "https://gitlab.com/-/user_settings/applications",
    }, seen),
    "gitlab",
  );
  assert.equal(seen[0]?.url, "https://computers.example/v1/git-hosts/gitlab/areas");
  assert.deepEqual(answer.kind === "ok" && answer.value.areas, [
    { key: "aceballos", name: "Alberto", kind: "user", url: "https://gitlab.com/aceballos" },
    { key: "raelay", name: "Raelay Labs", kind: "group", url: "https://gitlab.com/groups/raelay" },
    { key: "rara", name: "rara", kind: null, url: null },
  ]);
});

test("los fallos conservan el código del Worker con su prefijo de proveedor", async () => {
  assert.deepEqual(await gitHostAreas(source(409, { error: { code: "gitlab_reauthorize" } }), "gitlab"), { kind: "failed", status: 409, code: "gitlab_reauthorize" });
  assert.deepEqual(await gitHostStatus(source(503, { error: "bitbucket_disabled" }), "bitbucket"), { kind: "failed", status: 503, code: "bitbucket_disabled" });
  assert.deepEqual(await gitHostStatus(source(401, null), "gitlab"), { kind: "unauthorized" });
  assert.deepEqual(await gitHostAreas(source(200, { nope: true }), "gitlab"), { kind: "failed", status: 200, code: "bad_response" });
});

test("desconectar borra y quitar o volver a poner una máquina usa las rutas comunes", async () => {
  const seen: Seen[] = [];
  assert.deepEqual(await disconnectGitHost(source(200, { ok: true }, seen), "bitbucket"), { kind: "ok", value: null });
  assert.deepEqual([seen[0]?.method, seen[0]?.url], ["DELETE", "https://computers.example/v1/git-hosts/bitbucket"]);

  const removed: Seen[] = [];
  const r = await removeGitHostMachine(source(200, { credential: gitlab }, removed), "gitlab", "w 1", "cred_gl", "cmp/mac");
  assert.deepEqual([removed[0]?.method, removed[0]?.url], ["DELETE", "https://computers.example/v1/workspaces/w%201/credentials/cred_gl/machines/cmp%2Fmac"]);
  assert.equal(r.kind === "ok" && r.value.id, "cred_gl");

  const restored: Seen[] = [];
  await restoreGitHostMachine(source(200, { credential: bitbucket }, restored), "bitbucket", "w", "cred_bb", "cmp_mac");
  assert.deepEqual([restored[0]?.method, restored[0]?.url], ["POST", "https://computers.example/v1/workspaces/w/credentials/cred_bb/machines/cmp_mac/restore"]);
  assert.deepEqual(await restoreGitHostMachine(source(200, { credential: gitlab }), "bitbucket", "w", "cred_gl", "cmp_mac"), { kind: "failed", status: 200, code: "bad_response" });
});
