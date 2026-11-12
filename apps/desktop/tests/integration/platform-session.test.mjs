import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { platformSession, PlatformSessionError } from "../../src/web/platform-session.ts";

// Run explicitly with DANIL_PLATFORM_REPOS pointing to sibling edge/identity/workspaces clones.
const repos = process.env.DANIL_PLATFORM_REPOS;
if (!repos) throw new Error("DANIL_PLATFORM_REPOS is required; install the three repos with npm ci first");
const require = createRequire(join(resolve(repos), "identity/package.json"));
const { Miniflare, convertV4MiniflareOptions, Response: MFResponse } = require("miniflare");
const { exportJWK, generateKeyPair, SignJWT } = require("jose");
const { database } = await import(pathToFileURL(join(resolve(repos), "identity/test/database.ts")).href);
const hash = value => createHash("sha256").update(value).digest("base64url");

test("SPA cookie session against edge, identity and workspaces Workers with PostgreSQL 16", async t => {
  const dir = mkdtempSync(join(tmpdir(), "danil-platform-spa-"));
  let db;
  let runtime;
  try {
    const bundles = {};
    for (const name of ["edge", "identity", "workspaces"]) {
      const cwd = join(repos, name);
      execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "deploy", "--dry-run", "--outdir", join(dir, name)], { cwd, stdio: "pipe" });
      bundles[name] = readFileSync(join(dir, name, name === "edge" ? "index.js" : "worker.js"), "utf8");
    }
    db = await database("identity");
    for (const name of ["identity", "workspaces"]) execFileSync(process.execPath, ["scripts/migrate.mjs"], {
      cwd: join(repos, name), env: { ...process.env, MIGRATION_DATABASE_URL: db.connectionString }, stdio: "pipe",
    });
    await db.admin.query(`INSERT INTO identity.persons VALUES ('user_A','A','active',1);
      INSERT INTO identity.organizations VALUES ('org_A','Alpha','team','active',1);
      INSERT INTO identity.organization_members VALUES ('org_A','user_A','owner','active',1);
      INSERT INTO identity.access_projection VALUES
        ('user_A','sidA','org_A',11,'A','ctx11',1,ARRAY['identity.read','workspaces.read','workspaces.select'],'active',now(),now()+interval '30 seconds'),
        ('user_A','sidA','org_A',9007199254740993,'A','ctx12',1,ARRAY['identity.read','workspaces.read','workspaces.select'],'active',now(),now()+interval '30 seconds');
      INSERT INTO tenancy.accounts VALUES (11,'org_A','Alpha','active',1),(9007199254740993,'org_A','Beta','active',1),(21,'org_B','Other','active',1);
      INSERT INTO tenancy.workspace_memberships VALUES (11,'org_A','user_A','owner','active',1),(9007199254740993,'org_A','user_A','owner','active',1);
      INSERT INTO tenancy.access_projection SELECT * FROM identity.access_projection;
      INSERT INTO tenancy.client_grants VALUES
        ('user_A','sidA','org_A','web-test','identity',ARRAY['identity.read'],now()+interval '30 seconds'),
        ('user_A','sidA','org_A','web-test','workspaces',ARRAY['workspaces.read','workspaces.select'],now()+interval '30 seconds');
      BEGIN;
      SELECT set_config('request.jwt.claims',json_build_object('sub','user_A','sid','sidA','org','org_A','authz_ver',1,'exp',extract(epoch from now())+60)::text,true);
      INSERT INTO tenancy.session_workspaces(sub,sid,org,workspace,idempotency_key) VALUES ('user_A','sidA','org_A',11,'fixture-initial');
      COMMIT;`);
    const rsa = await generateKeyPair("RS256");
    const ec = await generateKeyPair("ES256", { extractable: true });
    const publicKeys = { keys: [{ ...await exportJWK(ec.publicKey), kid: "edge", alg: "ES256", use: "sig" }] };
    const workosKeys = { keys: [{ ...await exportJWK(rsa.publicKey), kid: "workos", alg: "RS256" }] };
    let challenge;
    let exchanges = 0;
    let revoked = false;
    const workos = async r => {
      const url = new URL(r.url);
      if (url.pathname === "/jwks") return MFResponse.json(workosKeys);
      if (url.pathname === "/user_management/authorize") {
        challenge = url.searchParams.get("code_challenge");
        return new MFResponse(null, { status: 302, headers: { location: `https://auth.test/${url.search}` } });
      }
      const body = await r.json();
      if (url.pathname === "/user_management/sessions/revoke") { revoked = true; return new MFResponse(null, { status: 204 }); }
      assert.equal(url.pathname, "/user_management/authenticate");
      assert.equal(body.grant_type, "authorization_code");
      assert.equal(hash(body.code_verifier), challenge);
      exchanges++;
      const token = await new SignJWT({ sid: "sidA", org_id: "org_A", client_id: "web-test" })
        .setProtectedHeader({ alg: "RS256", kid: "workos" }).setIssuer("https://workos.test").setAudience("https://api.danil.ai")
        .setSubject("user_A").setIssuedAt().setExpirationTime("5m").sign(rsa.privateKey);
      return MFResponse.json({ access_token: token, refresh_token: "synthetic-refresh", user: { id: "user_A" } });
    };
    const jwks = () => MFResponse.json({ ...publicKeys, issued_at: Math.floor(Date.now()/1000), expires_at: Math.floor(Date.now()/1000)+60, revoked_kids: [] });
    const config = { WORKOS_ISSUER: "https://workos.test", WORKOS_AUDIENCE: "https://api.danil.ai", WORKOS_JWKS_URL: "https://workos.test/jwks", WEB_CLIENT_ID: "web-test" };
    const service = (name, bindings, serviceBindings) => ({ name, modules: true, script: bundles[name], compatibilityDate: "2026-11-12", compatibilityFlags: ["nodejs_compat"],
      hyperdrives: { HYPERDRIVE: db.appUrl.replace("identity_service:", `${name}_service:`) },
      bindings: { SQL_TIMEOUT_MS: "2000", ...bindings }, serviceBindings: { JWKS_AUTHORITY: jwks, ...serviceBindings }, outboundService: workos });
    const { readdirSync } = await import("node:fs");
    runtime = new Miniflare(convertV4MiniflareOptions({ workers: [
      { name: "edge", modulesRoot: join(dir, "edge"), modules: [
        { type: "ESModule", path: join(dir, "edge/index.js"), contents: bundles.edge },
        ...readdirSync(join(dir, "edge")).filter(p => p.endsWith(".yaml")).map(p => ({ type: "Text", path: join(dir, "edge", p), contents: readFileSync(join(dir, "edge", p), "utf8") })),
      ], compatibilityDate: "2026-11-12", bindings: { ...config, DESK_CLIENT_ID: "desk-test", EDGE_PRIVATE_JWK: JSON.stringify(await exportJWK(ec.privateKey)), EDGE_KID: "edge", EDGE_PUBLIC_JWKS: JSON.stringify(publicKeys),
        WORKERS_ORIGIN: "https://workers.test", ACCESS_CLIENT_ID: "synthetic", ACCESS_CLIENT_SECRET: "synthetic", UPSTREAM_TIMEOUT_MS: "2000", SSE_IDLE_TIMEOUT_MS: "60000" },
        durableObjects: { LIMITS: { className: "WorkspaceLimits", useSQLite: true } },
        serviceBindings: { IDENTITY: { name: "identity", entrypoint: "WebSessions" }, WORKSPACES: { name: "workspaces", entrypoint: "EdgeWorkspaces" },
          COMPUTE: () => new MFResponse(null, { status: 500 }), CREDENTIALS: () => new MFResponse(null, { status: 500 }), BILLING: () => new MFResponse(null, { status: 500 }) }, outboundService: workos },
      service("identity", { ...config, AUTHKIT_ORIGIN: "https://auth.test", WORKOS_API_ORIGIN: "https://workos.test", WORKOS_API_KEY: "synthetic", WEB_RETURN_URLS: '["https://app.danil.ai/"]',
        SESSION_KEYS: JSON.stringify({ active: "test", keys: { test: randomBytes(32).toString("base64url") } }) }, {
        WORKSPACES_AUTHZ: { name: "workspaces", entrypoint: "AuthorizationAuthority" }, WEB_WORKSPACES: { name: "workspaces", entrypoint: "EdgeWorkspaces" } }),
      service("workspaces", {}, { IDENTITY_AUTHZ: { name: "identity", entrypoint: "AuthorizationProjection" } }),
    ] }));
    await runtime.ready;
    assert.equal((await (await runtime.getWorker("workspaces")).scheduled()).outcome, "ok");
    let cookie = "";
    const requests = [];
    const browserFetch = async (input, init) => {
      const r = new Request(input, init);
      assert.equal(r.credentials, "include");
      assert.equal(r.headers.has("authorization"), false);
      const headers = new Headers(r.headers);
      headers.set("cookie", cookie);
      headers.set("origin", "https://app.danil.ai");
      requests.push(r.url);
      return runtime.dispatchFetch(r.url, { method: r.method, headers: Object.fromEntries(headers), body: r.method === "POST" ? await r.text() : undefined, redirect: "manual" });
    };
    const api = platformSession({ origin: "https://api.danil.ai", timeoutMs: 5000 }, browserFetch);
    await t.test("PKCE login/callback issues cookie; callback replay fails", async () => {
      const login = await runtime.dispatchFetch(api.loginUrl("https://app.danil.ai/"), { headers: { "cf-connecting-ip": "192.0.2.1" }, redirect: "manual" });
      assert.equal(login.status, 302, await login.clone().text());
      const target = new URL(login.headers.get("location"));
      const callback = `https://api.danil.ai/v1/identity/callback?code=synthetic&state=${target.searchParams.get("state")}`;
      const init = { headers: { cookie: login.headers.get("set-cookie").split(";")[0] }, redirect: "manual" };
      const response = await runtime.dispatchFetch(callback, init);
      assert.equal(response.status, 302, await response.clone().text());
      assert.match(response.headers.get("set-cookie"), /__Host-danil_session=.*Secure; HttpOnly; Path=\/; SameSite=Strict/);
      cookie = response.headers.get("set-cookie").split(";")[0];
      assert.equal((await runtime.dispatchFetch(callback, init)).status, 401);
      assert.equal(exchanges, 1);
    });
    await t.test("profile, exact BIGINT workspaces, selection and retry reach real services", async () => {
      assert.equal((await api.me()).id, "user_A");
      assert.deepEqual((await api.workspaces()).map(w => w.id), ["11", "9007199254740993"]);
      const selected = await api.select("9007199254740993", "operation-1");
      assert.equal(selected.workspace, "9007199254740993");
      assert.deepEqual(await api.select("9007199254740993", "operation-1"), selected);
      assert.equal((await api.me()).name, "A");
      const context = await db.admin.query("SELECT workspace::text,selection_ver FROM tenancy.session_workspaces");
      assert.equal(context.rows[0].workspace, "9007199254740993");
      assert.equal(context.rows[0].selection_ver, 2);
      assert.equal((await db.admin.query("SELECT * FROM tenancy.selection_receipts")).rowCount, 1);
    });
    await t.test("missing CSRF and another organization's workspace are denied", async () => {
      const response = await browserFetch("https://api.danil.ai/v1/workspaces/select", { credentials: "include", method: "POST", headers: { "content-type": "application/json", "idempotency-key": "missing-csrf" }, body: '{"workspace":"11"}' });
      assert.equal(response.status, 403);
      await assert.rejects(api.select("21", "forbidden"), e => e instanceof PlatformSessionError && e.status === 403);
      assert.equal((await runtime.dispatchFetch("https://api.danil.ai/v1/identity/me")).status, 401);
      assert.ok(requests.every(url => new URL(url).pathname.startsWith("/v1/")));
    });
    await t.test("logout revokes the cookie session, with no legacy exchange", async () => {
      await api.logout();
      assert.equal(revoked, true);
      await assert.rejects(api.me(), e => e instanceof PlatformSessionError && e.status === 401);
      assert.equal(exchanges, 1);
    });
  } finally {
    await runtime?.dispose();
    await db?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
