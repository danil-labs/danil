import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  type CredentialFetch,
  type CredentialSource,
  credentialMachines,
  credentialSlot,
  credentialsListingOf,
  deleteCredential,
  credentialHint,
  envSecretFolderValid,
  envSecretNameProblem,
  envSecretOf,
  sealRecipientsFor,
  isAgentCredential,
  listCredentials,
  putCredential,
  removeCredentialMachine,
  restoreCredentialMachine,
} from "../src/index.ts";

type Seen = { url: string; method?: string; headers?: Record<string, string>; body?: string };

function source(status: number, body: unknown, seen: Seen[] = []): CredentialSource {
  const fetch: CredentialFetch = async (url, init) => {
    seen.push({ url, method: init?.method, headers: init?.headers, body: init?.body });
    return { status, ok: status >= 200 && status < 300, json: async () => body };
  };
  return { endpoint: "https://computers.example", getToken: async () => "jwt", fetch };
}

const CREDENTIAL = {
  id: "cred_1",
  workspace_id: "w1",
  kind: "api_key",
  provider: "opencode",
  slot: "agentes/opencode:cuenta-1",
  label: "Trabajo",
  hint: "cdef",
  delivery: "sealed",
  status: "active",
  config: { agent: "opencode", account: "cuenta-1" },
  version: 3,
  created_at: "2026-10-23T10:00:00Z",
  updated_at: "2026-10-23T10:00:00Z",
  machines: [
    { computer_id: "cmp_vm", name: "vm-alberto", state: "pending", version: 2, created_at: null, last_seen_at: null },
    { computer_id: "cmp_old", name: "vm-vieja", state: "removed", version: 1, created_at: null, last_seen_at: null },
    { computer_id: "cmp_mac", name: "Mac", state: "active", version: 3, created_at: null, last_seen_at: null },
    { name: "sin id" },
  ],
};

test("lista las credenciales del workspace con sus máquinas y para quién sellar, con el JWT", async () => {
  const seen: Seen[] = [];
  const answer = await listCredentials(
    source(200, { credentials: [CREDENTIAL, { id: "x" }], recipients: [{ computer_id: "cmp_mac", name: "Mac", public_key: "AAAA", online: true }, { computer_id: "cmp_vm", public_key: null }] }, seen),
    "w 1",
  );
  assert.equal(seen[0]!.url, "https://computers.example/v1/credentials/workspaces/w%201/accounts");
  assert.equal(seen[0]!.method, "GET");
  assert.equal(seen[0]!.headers?.authorization, "Bearer jwt");
  assert.equal(answer.kind, "ok");
  if (answer.kind !== "ok") return;
  assert.equal(answer.value.credentials.length, 1, "una fila sin kind ni slot no entra");
  assert.equal(answer.value.credentials[0]!.machines.length, 3);
  assert.deepEqual(answer.value.recipients, [
    { computer_id: "cmp_mac", name: "Mac", public_key: "AAAA", online: true, service_features: null },
    { computer_id: "cmp_vm", name: null, public_key: null, online: true, service_features: null },
  ]);
  assert.equal(answer.value.local_only, undefined, "el Worker no sabe de claves locales");
  assert.deepEqual(credentialMachines(answer.value.credentials[0]!).map((m) => m.computer_id), ["cmp_mac", "cmp_vm", "cmp_old"]);
});

test("la lista del motor trae además las claves que solo están en esta máquina", () => {
  const listing = credentialsListingOf({
    credentials: [],
    recipients: [],
    local_only: [
      { slot: "referencias/zotero-key", kind: "zotero", provider: "zotero", label: "Zotero", hint: "a1b2" },
      { slot: "agentes/opencode-zen:a", kind: "api_key", provider: "opencode", label: "A", hint: "9999", upload_error: "credentials.error.offline" },
      { kind: "x" },
    ],
  });
  assert.deepEqual(listing.local_only, [
    { slot: "referencias/zotero-key", kind: "zotero", provider: "zotero", label: "Zotero", hint: "a1b2" },
    { slot: "agentes/opencode-zen:a", kind: "api_key", provider: "opencode", label: "A", hint: "9999", upload_error: "credentials.error.offline" },
  ]);
  assert.throws(() => credentialsListingOf({ nope: true }));
});

test("crea o rota con PUT y las copias selladas", async () => {
  const seen: Seen[] = [];
  const put = {
    kind: "zotero" as const,
    provider: "zotero",
    slot: credentialSlot.zotero(),
    label: "Zotero",
    hint: "a1b2",
    config: {},
    copies: [{ computer_id: "cmp_mac", sealed: "c2VhbGVk" }],
  };
  const answer = await putCredential(source(200, { credential: { ...CREDENTIAL, kind: "zotero", slot: put.slot } }, seen), "w1", put);
  assert.equal(seen[0]!.method, "PUT");
  assert.equal(seen[0]!.headers?.["content-type"], "application/json");
  assert.deepEqual(JSON.parse(seen[0]!.body!), { ...put, copies: [{ machine_id: "cmp_mac", sealed: "c2VhbGVk" }] });
  assert.equal(answer.kind === "ok" && answer.value.slot, "referencias/zotero-key");
});

test("quita y vuelve a poner en una máquina, y borra de la cuenta", async () => {
  const seen: Seen[] = [];
  const removed = await removeCredentialMachine(source(200, { credential: CREDENTIAL }, seen), "w1", "cred_1", "cmp_vm");
  const restored = await restoreCredentialMachine(source(200, { credential: CREDENTIAL }, seen), "w1", "cred_1", "cmp_vm");
  const deleted = await deleteCredential(source(200, { ok: true }, seen), "w1", "cred_1");
  assert.deepEqual(
    seen.map((s) => `${s.method} ${s.url.replace("https://computers.example", "")}`),
    [
      "DELETE /v1/credentials/workspaces/w1/accounts/cred_1/machines/cmp_vm",
      "POST /v1/credentials/workspaces/w1/accounts/cred_1/machines/cmp_vm/restore",
      "DELETE /v1/credentials/workspaces/w1/accounts/cred_1",
    ],
  );
  assert.equal(removed.kind, "ok");
  assert.equal(restored.kind, "ok");
  assert.deepEqual(deleted, { kind: "ok", value: null });
});

test("conserva el código del Worker en 403, 404 y los demás errores", async () => {
  assert.deepEqual(await listCredentials(source(403, { error: { code: "license_required" } }), "w1"), { kind: "license", code: "license_required" });
  assert.deepEqual(await listCredentials(source(404, { error: { code: "not_found" } }), "w1"), { kind: "missing", code: "not_found" });
  assert.deepEqual(await listCredentials(source(404, null), "w1"), { kind: "missing" });
  assert.deepEqual(await listCredentials(source(401, null), "w1"), { kind: "unauthorized" });
  assert.deepEqual(await listCredentials(source(409, { error: { code: "version_conflict" } }), "w1"), { kind: "error", status: 409, code: "version_conflict" });
  assert.deepEqual(await listCredentials(source(200, { nope: 1 }), "w1"), { kind: "error", status: 200 });
  const offline: CredentialSource = { endpoint: "x.example", getToken: async () => "t", fetch: async () => Promise.reject(new Error("net")) };
  assert.deepEqual(await listCredentials(offline, "w1"), { kind: "error", status: null });
});

test("los slots son los de la bóveda y una cuenta de agente reconoce su clave", () => {
  assert.equal(credentialSlot.apiKey("opencode", "a"), "agentes/opencode:a");
  assert.equal(credentialSlot.goUsageKey("opencode", "a"), "agentes/opencode:go-usage:a");
  assert.equal(credentialSlot.mcpSecret("linear", "env", "LINEAR_API_KEY"), "mcp/linear/env/LINEAR_API_KEY");
  assert.equal(isAgentCredential({ kind: "api_key", config: { agent: "opencode", account: "a" } }, "opencode", "a"), true);
  assert.equal(isAgentCredential({ kind: "api_key", config: { agent: "opencode", account: "b" } }, "opencode", "a"), false);
});

test("un kind que el cliente no conoce no tumba la lista y los filtros por kind lo dejan fuera", () => {
  const listing = credentialsListingOf({
    credentials: [CREDENTIAL, { ...CREDENTIAL, id: "cred_future", kind: "future_kind", slot: "futuro/x" }, { ...CREDENTIAL, id: "cred_env", kind: "env_secret", provider: "env", slot: "env/*/STRIPE_KEY", config: {} }],
    recipients: [],
    local_only: [{ slot: "env/web/DATABASE_URL", kind: "env_secret", provider: "env", label: null, hint: "5432" }],
  });
  assert.deepEqual(listing.credentials.map((c) => c.id), ["cred_1", "cred_future", "cred_env"]);
  assert.deepEqual(listing.credentials.filter((c) => (["api_key"] as string[]).includes(c.kind)).map((c) => c.id), ["cred_1"]);
  assert.deepEqual(listing.credentials.filter((c) => c.kind === "env_secret").map((c) => c.slot), ["env/*/STRIPE_KEY"]);
  assert.equal(listing.local_only?.[0]?.kind, "env_secret");
});

test("el slot de un secreto genérico va y vuelve; la carpeta es opcional", () => {
  assert.equal(credentialSlot.envSecret(null, "STRIPE_KEY"), "env/*/STRIPE_KEY");
  assert.equal(credentialSlot.envSecret("web", "DATABASE_URL"), "env/web/DATABASE_URL");
  assert.deepEqual(envSecretOf("env/*/STRIPE_KEY"), { folder: null, name: "STRIPE_KEY" });
  assert.deepEqual(envSecretOf("env/web/DATABASE_URL"), { folder: "web", name: "DATABASE_URL" });
  for (const bad of ["env/*/stripe", "env/STRIPE", "env/a/b/C", "mcp/s/env/TOKEN", "env/*/1A"]) assert.equal(envSecretOf(bad), null, bad);
});

test("el nombre sigue la gramática de variables y no pisa las reservadas", () => {
  for (const ok of ["STRIPE_KEY", "_X", "A1"]) assert.equal(envSecretNameProblem(ok), null, ok);
  assert.equal(envSecretNameProblem(""), "empty");
  for (const bad of ["stripe", "1A", "A-B", "A B"]) assert.equal(envSecretNameProblem(bad), "grammar", bad);
  for (const reserved of ["PATH", "HOME", "TERMINUS_TASK", "SELDON_X", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "CLAUDE_CONFIG_DIR", "CODEX_HOME", "OPENCODE_API_KEY", "LD_PRELOAD", "DYLD_INSERT_LIBRARIES", "GIT_DIR", "NODE_OPTIONS", "GH_TOKEN", "GITHUB_TOKEN", "COMSPEC", "TMP"])
    assert.equal(envSecretNameProblem(reserved), "reserved", reserved);
  assert.equal(envSecretNameProblem("GITHUB_APP_ID"), null, "solo GITHUB_TOKEN exacto, no el prefijo");
});

test("un secreto genérico solo da pista con 16 caracteres o más; las demás claves con 4", () => {
  assert.equal(credentialHint("env_secret", "short-value-15ch"), "15ch");
  assert.equal(credentialHint("env_secret", "short-value-15c"), null);
  assert.equal(credentialHint("mcp_secret", "abcd"), "abcd");
  assert.equal(credentialHint("mcp_secret", "abc"), null);
});

test("una máquina sin secrets_v1 sale «unsupported», nunca activa, y no recibe copia de un secreto genérico", () => {
  const listing = credentialsListingOf({
    credentials: [{ ...CREDENTIAL, kind: "env_secret", slot: "env/*/X_KEY", machines: [{ computer_id: "cmp_old", name: "vieja", state: "unsupported" }, { computer_id: "cmp_mac", name: "Mac", state: "active" }] }],
    recipients: [
      { computer_id: "cmp_mac", public_key: "AAAA", service_features: ["push_stream_v1", "secrets_v1"] },
      { computer_id: "cmp_old", public_key: "BBBB", service_features: ["push_stream_v1"] },
      { computer_id: "cmp_unknown", public_key: "CCCC" },
    ],
  });
  assert.deepEqual(credentialMachines(listing.credentials[0]!).map((m) => `${m.computer_id}:${m.state}`), ["cmp_mac:active", "cmp_old:unsupported"]);
  assert.deepEqual(sealRecipientsFor("env_secret", listing.recipients).map((r) => r.computer_id), ["cmp_mac"]);
  assert.equal(sealRecipientsFor("mcp_secret", listing.recipients).length, 3, "las demás credenciales se sellan para todas");
});

test("nombres y carpetas como el fixture del motor (seldon-host docs/fixtures/env-secret-names.json)", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/env-secret-names.json", import.meta.url), "utf8"));
  const reason = { empty: "invalid_name", grammar: "invalid_name", reserved: "reserved" };
  for (const name of fixture.accepted) assert.equal(envSecretNameProblem(name), null, name);
  for (const r of fixture.rejected) assert.equal(reason[envSecretNameProblem(r.name) ?? "none"], r.reason, r.name.slice(0, 40));
  for (const f of fixture.folders.accepted) assert.ok(envSecretFolderValid(f), f);
  for (const f of fixture.folders.rejected) assert.ok(!envSecretFolderValid(f), f);
  assert.equal(credentialHint("env_secret", "x".repeat(fixture.hint.min_value_chars - 1)), null);
  assert.equal(credentialHint("env_secret", "x".repeat(fixture.hint.min_value_chars))?.length, fixture.hint.max_chars);
});
