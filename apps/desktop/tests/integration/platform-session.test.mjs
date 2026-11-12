import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { workspaceSelection } from "../../src/web/workspace-selection.ts";
import { platformInbox } from "../../src/web/platform-inbox.ts";
import { createMessaging } from "../../../../packages/attention/src/messaging.ts";
import { realMessagingServer } from "../helpers/real-messaging-server.mjs";
import { messagingContractServer } from "../helpers/messaging-contract-server.mjs";
import { platformSession, PlatformSessionError } from "../../src/web/platform-session.ts";

// Run explicitly with DANIL_PLATFORM_REPOS pointing to sibling edge/identity/workspaces clones.
const repos = process.env.DANIL_PLATFORM_REPOS;
if (!repos) throw new Error("DANIL_PLATFORM_REPOS is required; install the three repos with npm ci first");
const require = createRequire(join(resolve(repos), "identity/package.json"));
const { Miniflare, convertV4MiniflareOptions, Response: MFResponse } = require("miniflare");
const { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, jwtVerify } = require("jose");
const { database } = await import(pathToFileURL(join(resolve(repos), "identity/test/database.ts")).href);
const real = Boolean(process.env.DANIL_WORKERS_REPO);
const hash = value => createHash("sha256").update(value).digest("base64url");

test("SPA cookie session against edge, identity and workspaces Workers with PostgreSQL 16", async t => {
  const dir = mkdtempSync(join(tmpdir(), "danil-platform-spa-"));
  let db;
  let runtime;
  let messaging;
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
        ('user_A','sidA','org_A',11,'A','ctx11',1,ARRAY['identity.read','workspaces.read','workspaces.select','messaging.read','messaging.send'],'active',now(),now()+interval '30 seconds'),
        ('user_A','sidA','org_A',9007199254740993,'A','ctx12',1,ARRAY['identity.read','workspaces.read','workspaces.select','messaging.read','messaging.send'],'active',now(),now()+interval '30 seconds');
      INSERT INTO tenancy.accounts VALUES (11,'org_A','Alpha','active',1),(9007199254740993,'org_A','Beta','active',1),(21,'org_B','Other','active',1);
      INSERT INTO tenancy.workspace_memberships VALUES (11,'org_A','user_A','owner','active',1),(9007199254740993,'org_A','user_A','owner','active',1);
      INSERT INTO tenancy.access_projection SELECT * FROM identity.access_projection;
      INSERT INTO tenancy.client_grants VALUES
        ('user_A','sidA','org_A','web-test','workers',ARRAY['messaging.read','messaging.send'],now()+interval '30 seconds'),
        ('user_A','sidA','org_A','web-test','identity',ARRAY['identity.read'],now()+interval '30 seconds'),
        ('user_A','sidA','org_A','web-test','workspaces',ARRAY['workspaces.read','workspaces.select'],now()+interval '30 seconds');
      BEGIN;
      SELECT set_config('request.jwt.claims',json_build_object('sub','user_A','sid','sidA','org','org_A','authz_ver',1,'exp',extract(epoch from now())+60)::text,true);
      INSERT INTO tenancy.session_workspaces(sub,sid,org,workspace,idempotency_key) VALUES ('user_A','sidA','org_A',11,'fixture-initial');
      COMMIT;`);
    const rsa = await generateKeyPair("RS256");
    const ec = await generateKeyPair("ES256", { extractable: true });
    const publicKeys = { keys: [{ ...await exportJWK(ec.publicKey), kid: "edge", alg: "ES256", use: "sig" }] };
    messaging = real ? await realMessagingServer({ db, dir, accessKeys: { keys: [{ ...await exportJWK(rsa.publicKey), kid: 'access', alg: 'RS256', use: 'sig' }] },
      accessAssertion: issuer => new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'access' }).setIssuer(issuer).setAudience('inbox-local-access').setIssuedAt().setExpirationTime('5m').sign(rsa.privateKey),
    }) : await messagingContractServer({ publicKeys: createLocalJWKSet(publicKeys), jwtVerify });
    const workosKeys = { keys: [{ ...await exportJWK(rsa.publicKey), kid: "workos", alg: "RS256" }] };
    let challenge;
    let exchanges = 0;
    let revoked = false;
    const workos = async r => {
      const url = new URL(r.url);
      if (url.hostname === 'workers.test') {
        if (real) { const response = await messaging.forward(r); return new MFResponse(response.body, { status: response.status, headers: response.headers }); }
        const response = await fetch(`${messaging.origin}${url.pathname}${url.search}`, { method: r.method, headers: Object.fromEntries(r.headers), body: r.method === 'POST' ? await r.text() : undefined });
        return new MFResponse(await response.arrayBuffer(), { status: response.status, headers: Object.fromEntries(response.headers) });
      }
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
    const config = { WORKOS_ISSUER: "https://workos.test", WORKOS_AUDIENCE: "https://api.danil.ai", WORKOS_JWKS_URL: "https://workos.test/jwks", WEB_CLIENT_ID: "web-test", ALLOWED_WEB_ORIGINS: "https://app.danil.ai,https://alfa-app.danil.ai" };
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
      service("identity", { ...config, AUTHKIT_ORIGIN: "https://auth.test", WORKOS_API_ORIGIN: "https://workos.test", WORKOS_API_KEY: "synthetic", WEB_RETURN_URLS: '["https://alfa-app.danil.ai/"]',
        SESSION_KEYS: JSON.stringify({ active: "test", keys: { test: randomBytes(32).toString("base64url") } }) }, {
        WORKSPACES_AUTHZ: { name: "workspaces", entrypoint: "AuthorizationAuthority" }, WEB_WORKSPACES: { name: "workspaces", entrypoint: "EdgeWorkspaces" } }),
      service("workspaces", {}, { IDENTITY_AUTHZ: { name: "identity", entrypoint: "AuthorizationProjection" } }),
    ] }));
    messaging.attach?.(runtime);
    if (real) await messaging.ready();
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
      headers.set("origin", "https://alfa-app.danil.ai");
      headers.set("x-request-id", "req_spa_test");
      requests.push(r.url);
      return runtime.dispatchFetch(r.url, { method: r.method, headers: Object.fromEntries(headers), body: r.method === "POST" ? await r.text() : undefined, signal: r.signal, redirect: "manual" });
    };
    const api = platformSession({ origin: "https://api.danil.ai", timeoutMs: 5000 }, browserFetch);
    await t.test("PKCE login/callback issues cookie; callback replay fails", async () => {
      const login = await runtime.dispatchFetch(api.loginUrl("https://alfa-app.danil.ai/"), { headers: { "cf-connecting-ip": "192.0.2.1" }, redirect: "manual" });
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
    await t.test("lost A response, reconciliation, B and new A use distinct durable operations", async () => {
      let lost = true;
      const writes = [];
      const selected = workspaceSelection({
        active: api.active,
        async select(id, key) {
          writes.push({ id, key });
          const response = await api.select(id, key);
          if (lost) { lost = false; throw new Error("lost after server commit"); }
          return response;
        },
      });
      await assert.rejects(selected.choose("9007199254740993"));
      await selected.choose("11");
      assert.equal(await api.active(), "11");
      await selected.choose("9007199254740993");
      assert.equal(selected.active(), await api.active());
      assert.equal(selected.active(), "9007199254740993");
      const keys = writes.filter(row => row.id === "9007199254740993").map(row => row.key);
      assert.equal(keys[0], keys[1]);
      assert.notEqual(keys[0], keys.at(-1));
    });
    await t.test("missing CSRF and another organization's workspace are denied", async () => {
      const response = await browserFetch("https://api.danil.ai/v1/workspaces/select", { credentials: "include", method: "POST", headers: { "content-type": "application/json", "idempotency-key": "missing-csrf" }, body: '{"workspace":"11"}' });
      assert.equal(response.status, 403);
      await assert.rejects(api.select("21", "forbidden"), e => e instanceof PlatformSessionError && e.status === 403);
      assert.equal((await runtime.dispatchFetch("https://api.danil.ai/v1/identity/me")).status, 401);
      assert.ok(requests.every(url => new URL(url).pathname.startsWith("/v1/")));
    });
    if (real) {
      const inbox = platformInbox({ origin: 'https://api.danil.ai', timeoutMs: 5000 }, browserFetch);
      await messaging.syncProjection();
      let conversation;
      await t.test('real workers: opaque conversation/message cursors and response attribution', async () => {
        const page = await inbox.conversations();
        assert.equal(page.data.length,30); assert.equal(page.page.has_more,true);
        assert.ok(page.data.every(row => row.contact.name.startsWith('Contact 9007199254740993/')));
        const next = await inbox.conversations(page.page.next_cursor);
        assert.equal(next.data.length,2); assert.equal(next.page.has_more,false);
        assert.equal(new Set([...page.data,...next.data].map(row => row.id)).size,32);
        conversation = page.data[0].id;
        const messages = await inbox.messages(conversation);
        assert.equal(messages.data.length,30); assert.equal(messages.data[0].author.person_id,'user_A');
        assert.equal(messages.data[0].author.name,'Historic operator');
        const older = await inbox.messages(conversation,messages.page.next_cursor);
        assert.equal(older.data.length,3); assert.equal(older.page.has_more,false);
      });
      await t.test('real workers: private channel, request binding, one-use JWT and revoked projection fail closed', async () => {
        const saved = messaging.lastEnvelope;
        const replay = await fetch(saved.url,{method:saved.method,headers:saved.headers,signal:AbortSignal.timeout(5000)});
        assert.equal(replay.status,401); assert.equal((await replay.json()).code,'internal_token_replayed');
        const headers = {...saved.headers}; delete headers['cf-access-jwt-assertion'];
        const noAccess = await fetch(saved.url,{headers,signal:AbortSignal.timeout(5000)});
        assert.equal(noAccess.status,401); assert.equal((await noAccess.json()).code,'private_channel_required');
        const changed = await fetch(saved.url.replace('limit=30','limit=31'),{headers:saved.headers,signal:AbortSignal.timeout(5000)});
        assert.equal(changed.status,401); assert.equal((await changed.json()).code,'request_mismatch');
        await db.admin.query("UPDATE public.workspace_access_projection SET state='suspended' WHERE workspace='9007199254740993'");
        await assert.rejects(inbox.conversations(),e=>e.status===403 && e.code==='workspace_inactive');
        await db.admin.query("UPDATE public.workspace_access_projection SET state='active' WHERE workspace='9007199254740993'");
        assert.deepEqual((await db.admin.query("SELECT rolbypassrls,rolsuper FROM pg_roles WHERE rolname='authenticated'")).rows,[{rolbypassrls:false,rolsuper:false}]);
      });
      await t.test('real workers: accepted reply persists JWT attribution and same-key retry writes once', async () => {
        const key = '7c917305-5975-49d4-9859-46f719a94dd6';
        const accepted = await inbox.reply(conversation,'hola',key);
        assert.equal(accepted.status,'queued'); assert.equal(accepted.conversation_id,conversation);
        assert.deepEqual(await inbox.reply(conversation,'hola',key),accepted);
        await assert.rejects(inbox.reply(conversation,'changed',key), e => e.status === 409 && e.code === 'idempotency_conflict');
        const saved = (await db.admin.query('SELECT account_id::text,sender_person_id,sender_name_snapshot FROM public.outgoing_messages')).rows;
        assert.deepEqual(saved,[{account_id:'9007199254740993',sender_person_id:'user_A',sender_name_snapshot:'A'}]);
      });
      await t.test('real workers: read-only guest reads but cannot respond; denied request creates no outgoing row', async () => {
        await db.admin.query("UPDATE tenancy.client_grants SET scopes=ARRAY['messaging.read'] WHERE audience='workers'; UPDATE tenancy.workspace_memberships SET role='guest' WHERE sub='user_A'");
        assert.equal((await inbox.conversations()).data.length,30);
        await assert.rejects(inbox.reply(conversation,'denied','viewer-denied'),e => e.status===403 && e.code==='insufficient_scope');
        assert.equal((await db.admin.query('SELECT count(*)::int AS n FROM public.outgoing_messages')).rows[0].n,1);
        await db.admin.query("UPDATE tenancy.client_grants SET scopes=ARRAY['messaging.read','messaging.send'] WHERE audience='workers'; UPDATE tenancy.workspace_memberships SET role='owner' WHERE sub='user_A'");
      });
      await t.test('real workers: another workspace in the same organization and another organization stay isolated', async () => {
        for (const workspace of ['11','21']) {
          const foreign = messaging.ids('cnv',[messaging.conversations[workspace][0]])[0];
          await assert.rejects(inbox.messages(foreign),e => e.status===404 && e.code==='not_found');
          await assert.rejects(inbox.reply(foreign,'cross-tenant',`cross-${workspace}`),e => e.status===404 && e.code==='not_found');
        }
        await api.select('11','switch-inbox-workspace'); await messaging.syncProjection();
        assert.ok((await inbox.conversations()).data.every(row => row.contact.name.startsWith('Contact 11/')));
        await assert.rejects(inbox.messages(conversation),e => e.status===404);
        assert.equal((await db.admin.query('SELECT count(*)::int AS n FROM public.outgoing_messages')).rows[0].n,1);
        t.diagnostic(`Applied ${messaging.applied.length} real SQL files; workers ${messaging.env.GIT_SHA}; outgoing sender=user_A, name=A`);
      });
      await t.test('real workers: the exact same UUID deduplicates v1 and legacy in either order', async () => {
        const uuid = '00000000-0000-4000-8000-000000000001';
        await db.admin.query("INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ($1,'operator@harness.test','{}')",[uuid]);
        const user = (await db.admin.query("SELECT private.resolve_person('supabase',$1,'operator@harness.test',true,'A') AS id",[uuid])).rows[0].id;
        await db.admin.query("INSERT INTO public.user_logins(provider,subject,user_id,email) VALUES ('workos','user_A',$1,'operator@harness.test') ON CONFLICT DO NOTHING",[user]);
        await db.admin.query("INSERT INTO public.account_users(account_id,user_id,role) VALUES (9007199254740993,$1,'owner') ON CONFLICT DO NOTHING",[user]);
        const token = await new SignJWT({ role:'authenticated', active_account_id:'9007199254740993' }).setProtectedHeader({alg:'HS256'}).setSubject(uuid).setAudience('authenticated').setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(messaging.env.SUPABASE_JWT_SECRET));
        const row = (await db.admin.query('SELECT conversation_id::text FROM public.outgoing_messages LIMIT 1')).rows[0];
        const legacy = createMessaging({getToken:async()=>token,unauthorized:async()=>false}, (input,init)=>fetch(String(input).replace('/api/messaging/reply','/messaging/reply'),init),messaging.origin);
        const result = await legacy.reply(Number(row.conversation_id),'hola','7c917305-5975-49d4-9859-46f719a94dd6');
        const saved = (await db.admin.query('SELECT id::text,idempotency_key,client_message_id FROM public.outgoing_messages ORDER BY id')).rows;
        t.diagnostic(JSON.stringify({legacy:result,outgoing:saved}));
        assert.equal(saved.length,1,'rollback must not enqueue a second reply for the same operation');
        assert.equal(result.duplicate,true);
        const key = '7c917305-5975-49d4-9859-46f719a94dd6';
        assert.equal(saved[0].client_message_id,key);
        assert.equal(saved[0].idempotency_key,`agent_reply:${row.conversation_id}:cmid:${key}`);
        await api.select('9007199254740993','rollback-return-workspace'); await messaging.syncProjection();
        const publicId = messaging.ids('cnv',[Number(row.conversation_id)])[0];
        const same = await inbox.reply(publicId,'hola',key);
        assert.equal(same.id,messaging.ids('ms',[Number(saved[0].id)])[0]);
        const reverseKey = '4A5283B1-872E-4C36-91B3-1F4E1933A2D1';
        assert.equal((await legacy.reply(Number(row.conversation_id),'reverse',reverseKey)).duplicate,false);
        const receipt = await inbox.reply(publicId,'reverse',reverseKey);
        assert.deepEqual(await inbox.reply(publicId,'reverse',reverseKey),receipt);
        assert.equal((await legacy.reply(Number(row.conversation_id),'reverse',reverseKey)).duplicate,true);
        const reverse = (await db.admin.query('SELECT id::text,idempotency_key,client_message_id FROM public.outgoing_messages WHERE client_message_id=$1',[reverseKey])).rows;
        assert.equal(reverse.length,1); assert.equal(reverse[0].client_message_id,reverseKey);
        assert.equal(reverse[0].idempotency_key,`agent_reply:${row.conversation_id}:cmid:${reverseKey}`);
        assert.equal(receipt.id,messaging.ids('ms',[Number(reverse[0].id)])[0]);
        assert.equal((await db.admin.query('SELECT count(*)::int AS n FROM public.outgoing_messages')).rows[0].n,2);
        t.diagnostic(JSON.stringify({reverse:reverse[0],receipt:receipt.id}));
      });
    } else await t.test("inbox traverses edge and identity to an HTTP server validated against PR OpenAPI", async () => {
      const inbox = platformInbox({ origin: "https://api.danil.ai", timeoutMs: 5000 }, browserFetch);
      const listed = await inbox.conversations();
      assert.equal(listed.data[0].id, "cnv_opaque");
      assert.equal((await inbox.conversations(listed.page.next_cursor)).page.has_more, false);
      const messages = await inbox.messages("cnv_opaque");
      assert.equal(messages.data[0].id, "msg_latest");
      assert.equal((await inbox.messages("cnv_opaque", messages.page.next_cursor)).data[0].id, "msg_older");
      const key = "7c917305-5975-49d4-9859-46f719a94dd6";
      const accepted = await inbox.reply("cnv_opaque", "hola", key);
      assert.deepEqual(await inbox.reply("cnv_opaque", "hola", key), accepted);
      await assert.rejects(inbox.reply("cnv_opaque", "changed", key), e => e.status === 409 && e.code === "idempotency_conflict");
      assert.equal(messaging.writes(), 1);
      messaging.deny(true);
      await assert.rejects(inbox.reply("cnv_opaque", "denied", "viewer"), e => e.status === 403 && e.code === "insufficient_scope");
      messaging.deny(false); messaging.limit(true);
      await assert.rejects(inbox.conversations(), e => e.status === 429 && e.retryAfter === "7" && e.requestId === "req_spa_test");
      messaging.limit(false);
      const legacy = createMessaging({ getToken: async () => "legacy-synthetic", unauthorized: async () => false }, fetch, `${messaging.origin}/legacy`);
      assert.equal((await legacy.reply(12, "hola", key)).duplicate, true);
      assert.equal(messaging.writes(), 1);
      assert.deepEqual(messaging.failures, []);
      assert.equal(messaging.calls.filter(r => r.method === "POST" && r.key === key).length, 4);
    });
    await t.test("logout revokes the cookie session, with no legacy exchange", async () => {
      await api.logout();
      assert.equal(revoked, true);
      await assert.rejects(api.me(), e => e instanceof PlatformSessionError && e.status === 401);
      assert.equal(exchanges, 1);
    });
  } finally {
    await runtime?.dispose();
    await messaging?.close();
    await db?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
