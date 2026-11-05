/**
 * En la web, GitLab y Bitbucket de la persona los contesta el Worker con la
 * sesión de la página (`web/git-host-account.ts`): rutas sin workspace, vuelta
 * a esta misma página y fallos con la forma y la frase de los del motor.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import "../helpers/catalog.ts";
import { gitHostReturnToOf, webGitHostAccount } from "../../src/web/git-host-account.ts";
import { githubAccountFailure, gitHostAccountFailureOf, gitHostNotHere, gitHostSilent } from "../../src/features/settings/github-account/failures.ts";

type Seen = { url: string; method?: string; headers?: Record<string, string>; body?: string };

function setup(reply: (seen: Seen) => { status: number; body: unknown }, href = "https://app.danil.ai/terminus/?gitlab=connected#ajustes") {
  const seen: Seen[] = [];
  let unauthorized = 0;
  const source = webGitHostAccount({
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
  return { source, seen, unauthorized: () => unauthorized };
}

const credential = { id: "cred_gl", kind: "gitlab", status: "active", version: 1, config: { gitlab_user_id: 77, login: "aceballos" }, machines: [] };

test("GitLab va a /v1/git-hosts/gitlab con el JWT y vuelve a esta página", async () => {
  const { source, seen } = setup((s) =>
    s.url.endsWith("/authorize")
      ? { status: 200, body: { url: "https://gitlab.com/oauth/authorize?state=s", expires_at: null } }
      : s.url.endsWith("/areas")
        ? { status: 200, body: { areas: [{ key: "raelay", name: "Raelay Labs", kind: "group", url: "https://gitlab.com/groups/raelay" }], manage_url: null } }
        : s.url.includes("/credentials/")
          ? { status: 200, body: { credential: { ...credential, machines: [{ computer_id: "cmp_vm", state: "removed" }] } } }
          : { status: 200, body: { connected: true, credential, manage_url: null } },
  );
  const status = await source.status("gitlab");
  assert.equal(status.credential?.config.login, "aceballos");
  assert.equal(seen[0]?.url, "https://computers.example/v1/git-hosts/gitlab");
  assert.equal(seen[0]?.headers?.authorization, "Bearer jwt");

  assert.deepEqual(await source.authorize("gitlab"), { url: "https://gitlab.com/oauth/authorize?state=s", opened: false });
  assert.deepEqual(JSON.parse(seen[1]?.body ?? "null"), { return_to: "https://app.danil.ai/terminus/" }, "sin la marca de la vuelta anterior");

  assert.deepEqual((await source.areas("gitlab")).areas.map((a) => [a.key, a.kind]), [["raelay", "group"]]);

  const removed = await source.machine("gitlab", "fqgx1w8m", "cred_gl", "cmp_vm", false);
  assert.equal(seen[3]?.method, "DELETE");
  assert.equal(seen[3]?.url, "https://computers.example/v1/workspaces/fqgx1w8m/credentials/cred_gl/machines/cmp_vm");
  assert.equal(removed?.machines[0]?.state, "removed");

  await source.disconnect("gitlab");
  assert.deepEqual([seen[4]?.method, seen[4]?.url], ["DELETE", "https://computers.example/v1/git-hosts/gitlab"]);
});

test("los fallos del Worker llegan con su código de proveedor y su frase; un 401 renueva la sesión", async () => {
  const codes: Record<string, { status: number; body: unknown }> = {
    "/bitbucket": { status: 503, body: { error: { code: "bitbucket_disabled" } } },
    "/areas": { status: 409, body: { error: { code: "bitbucket_reauthorize" } } },
    "/authorize": { status: 401, body: null },
  };
  const { source, unauthorized } = setup((s) => codes[Object.keys(codes).find((k) => s.url.endsWith(k)) ?? ""] ?? { status: 500, body: null });
  await assert.rejects(source.status("bitbucket"), (e: { what: unknown; detail: string }) => {
    assert.equal(e.detail, "credentials.error.bitbucket_disabled");
    assert.equal(e.what, "Tu cuenta de Danil todavía no puede guardar Bitbucket.");
    assert.ok(gitHostNotHere("bitbucket", e) && gitHostSilent("bitbucket", e), "a Worker without Bitbucket keeps the local card, silently");
    return true;
  });
  await assert.rejects(source.areas("bitbucket"), { detail: "credentials.error.bitbucket_reauthorize" });
  await assert.rejects(source.authorize("bitbucket"), { detail: "credentials.error.unauthorized" });
  assert.equal(unauthorized(), 1);
  const broken = setup(() => ({ status: 500, body: null })).source;
  await assert.rejects(broken.disconnect("bitbucket"), { detail: "credentials.error.http_500", what: "No se pudo completar con tu Bitbucket. Inténtalo otra vez." });
});

test("los códigos de vuelta y de subida tienen frase: cancelado, deshabilitado, refresh inválido", () => {
  const what = (provider: string, name: string, code: string) => (gitHostAccountFailureOf(provider, name, { detail: `credentials.error.${code}` }) as { what: unknown }).what;
  assert.equal(what("gitlab", "GitLab", "gitlab_cancelled"), "Cancelaste la conexión con GitLab. Vuelve a empezar cuando quieras.");
  assert.equal(what("bitbucket", "Bitbucket", "bitbucket_cancelled"), "Cancelaste la conexión con Bitbucket. Vuelve a empezar cuando quieras.");
  assert.equal(what("gitlab", "GitLab", "gitlab_refresh_invalid"), "La conexión de GitLab de esta máquina ya no vale. Vuelve a conectar.");
  assert.equal(what("gitlab", "GitLab", "gitlab_disabled"), "Tu cuenta de Danil todavía no puede guardar GitLab.");
  assert.equal(what("gitlab", "GitLab", "license_required"), "Para conectar tu GitLab necesitas Danil activo en tu cuenta. Pide acceso a quien administra tu organización.");
  // El código de otro proveedor no se traduce como propio.
  assert.deepEqual(gitHostAccountFailureOf("gitlab", "GitLab", { detail: "credentials.error.bitbucket_cancelled" }), { detail: "credentials.error.bitbucket_cancelled" });
  assert.equal(githubAccountFailure("github_cancelled").what, "Cancelaste la conexión con GitHub. Vuelve a empezar cuando quieras.");
  assert.equal(gitHostNotHere("gitlab", { detail: "credentials.error.gitlab_unavailable" }), false, "an actual service failure is still reported");
});

test("return_to es la página actual sin la marca de GitLab o Bitbucket ni el ancla", () => {
  assert.equal(gitHostReturnToOf("https://app.danil.ai/terminus/w/x?x=1&bitbucket=error&code=bitbucket_cancelled#a"), "https://app.danil.ai/terminus/w/x?x=1");
  assert.equal(gitHostReturnToOf("https://app.danil.ai/terminus/"), "https://app.danil.ai/terminus/");
});
