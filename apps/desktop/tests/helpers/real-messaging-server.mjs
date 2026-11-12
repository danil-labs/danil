import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:https';
import { createServer as createTcpServer } from 'node:net';
import { once } from 'node:events';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export async function prepareMessagingDatabase(db) {
  const migrations = join(resolve(process.env.DANIL_MESSAGING_SCHEMA_REPO), 'supabase/migrations');
  await db.admin.query(`CREATE ROLE postgres LOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE ROLE supabase_auth_admin NOLOGIN; CREATE ROLE supabase_storage_admin NOLOGIN;
    CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb, email_confirmed_at timestamptz, confirmed_at timestamptz, updated_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (auth.jwt()->>'sub')::uuid$$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT auth.jwt()->>'role'$$;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    GRANT USAGE ON SCHEMA auth, storage, extensions TO anon, authenticated, service_role;
    CREATE TABLE public._inbox_e2e_migrations(name text PRIMARY KEY);`);
  for (const name of readdirSync(migrations).filter(name => name.endsWith('.sql') && name >= '20261022000000_baseline.sql').sort()) {
    let sql = readFileSync(join(migrations, name), 'utf8');
    // The dump is PG17; this GUC has no equivalent in the requested PG16 cluster.
    sql = sql.replace(/^SET LOCAL transaction_timeout = 0;\r?\n/m, '');
    try {
      await db.admin.query('BEGIN');
      await db.admin.query(sql);
      await db.admin.query('COMMIT');
      await db.admin.query('INSERT INTO public._inbox_e2e_migrations VALUES ($1)', [name]);
    } catch (cause) {
      await db.admin.query('ROLLBACK');
      throw new Error(`Applying ${name}: ${cause.message}; SQL near ${sql.slice(Math.max(0, Number(cause.position ?? 1)-160), Number(cause.position ?? 1)+160)}`, { cause });
    }
  }
  await db.admin.query(`CREATE ROLE inbox_workers LOGIN BYPASSRLS IN ROLE authenticated, service_role;
    GRANT USAGE ON SCHEMA public TO service_role,authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;`);
  return (await db.admin.query('SELECT name FROM public._inbox_e2e_migrations ORDER BY name')).rows.map(r => r.name);
}

export async function realMessagingServer({ db, dir, accessKeys, accessAssertion }) {
  const repo = resolve(process.env.DANIL_WORKERS_REPO);
  const python = process.env.DANIL_WORKERS_PYTHON;
  const applied = await prepareMessagingDatabase(db);
  const conversations = {};
  for (const account of ['11','9007199254740993','21']) {
    await db.admin.query('INSERT INTO public.accounts(id,name) OVERRIDING SYSTEM VALUE VALUES ($1,$2)', [account, `Inbox ${account}`]);
    const channel = (await db.admin.query("INSERT INTO public.channels(account_id,name,provider,ai_active) VALUES ($1,'Local','web',false) RETURNING id", [account])).rows[0].id;
    conversations[account] = [];
    for (let i=0;i<32;i++) {
      const contact = (await db.admin.query('INSERT INTO public.contacts DEFAULT VALUES RETURNING id')).rows[0].id;
      const ca = (await db.admin.query('INSERT INTO public.contact_accounts(account_id,contact_id,name) VALUES ($1,$2,$3) RETURNING id',[account,contact,`Contact ${account}/${i}`])).rows[0].id;
      const cid = (await db.admin.query("INSERT INTO public.conversations(account_id,contact_id,contact_account_id,channel_id,active_provider,ai_assistance,last_message_at) VALUES ($1,$2,$3,$4,'web',false,now()-$5*interval '1 second') RETURNING id",[account,contact,ca,channel,i])).rows[0].id;
      conversations[account].push(Number(cid));
      await db.admin.query("INSERT INTO public.messages(conversation_id,direction,sender_type,provider,content) SELECT $1,'inbound','contact','web','History '||i FROM generate_series(1,32) i",[cid]);
      await db.admin.query("INSERT INTO public.messages(conversation_id,direction,sender_type,provider,content,sender_person_id,sender_name_snapshot) VALUES ($1,'outbound','human-agent','web','Attributed history','user_A','Historic operator')",[cid]);
    }
  }
  const key = join(dir, 'local-key.pem'), cert = join(dir, 'local-cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'pipe' });
  let runtime;
  const authority = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, async (req, res) => {
    try {
      const data = req.url === '/cdn-cgi/access/certs' ? accessKeys : await (await runtime.dispatchFetch('https://api.danil.ai/.well-known/jwks.json')).json();
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(data));
    } catch (cause) { res.writeHead(503); res.end(String(cause)); }
  });
  await new Promise(resolve => authority.listen(0, '127.0.0.1', resolve));
  const authorityPort = authority.address().port;
  const portServer = createTcpServer();
  await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
  const port = portServer.address().port;
  await new Promise(resolve => portServer.close(resolve));
  const env = { PATH: process.env.PATH, LANG: 'C.UTF-8', PYTHONDONTWRITEBYTECODE: '1', PYTHONPATH: repo,
    DATABASE_URL: db.connectionString.replace('migrator@', 'inbox_workers@'),
    EDGE_JWKS_URL: `https://127.0.0.1:${authorityPort}/.well-known/jwks.json`,
    EDGE_ACCESS_TEAM_DOMAIN: `127.0.0.1:${authorityPort}`, EDGE_ACCESS_AUD: 'inbox-local-access',
    SSL_CERT_FILE: cert, PUBLIC_ID_KEY: 'inbox-e2e-public-id-key-local-only-32bytes', SUPABASE_JWT_SECRET: 'inbox-e2e-legacy-jwt-key-local-only',
    AWS_EC2_METADATA_DISABLED: 'true', GIT_SHA: execFileSync('git', ['rev-parse','HEAD'], { cwd: repo, encoding: 'utf8' }).trim() };
  const processWorker = spawn(python, ['-m', 'uvicorn', 'src.entrypoints.api:app', '--host','127.0.0.1','--port',String(port)], { cwd: repo, env, stdio: ['ignore','pipe','pipe'] });
  let log = '';
  processWorker.stdout.on('data', chunk => { log += chunk; });
  processWorker.stderr.on('data', chunk => { log += chunk; });
  const calls = [];
  const server = { origin: `http://127.0.0.1:${port}`, applied, calls, env, conversations,
    async syncProjection() {
      await db.admin.query(`INSERT INTO public.workspace_access_projection(workspace,org,authz_ver,state,valid_until)
        SELECT p.workspace::text,p.org,g.authz_ver,p.state,p.valid_until FROM tenancy.access_projection p
        JOIN tenancy.authz_generations g USING(sub,sid,org) WHERE p.sub='user_A'
        ON CONFLICT(workspace) DO UPDATE SET authz_ver=excluded.authz_ver,valid_until=excluded.valid_until`);
    },
    attach(value) { runtime = value; },
    async forward(request) {
      const target = new URL(request.url);
      const headers = Object.fromEntries(request.headers);
      headers['cf-access-jwt-assertion'] = await accessAssertion(`https://127.0.0.1:${authorityPort}`);
      server.lastEnvelope = { url: `${server.origin}${target.pathname}${target.search}`, method: request.method, headers, body: ['POST','PATCH','PUT','DELETE'].includes(request.method) ? await request.text() : undefined };
      const response = await fetch(server.lastEnvelope.url, { method: server.lastEnvelope.method, headers, body: server.lastEnvelope.body, signal: AbortSignal.timeout(5000) });
      const body = await response.arrayBuffer();
      calls.push({ method: request.method, path: target.pathname, status: response.status, body: body.byteLength ? JSON.parse(Buffer.from(body).toString()) : null });
      if (server.afterResponse) {
        const changed = await server.afterResponse(new Response(body, { status: response.status, headers: response.headers }), request);
        return { status: changed.status, headers: Object.fromEntries(changed.headers), body: await changed.arrayBuffer() };
      }
      return { status: response.status, headers: Object.fromEntries(response.headers), body };
    },
    ids(kind, values) {
      return JSON.parse(execFileSync(python, ['-c', `import json; from src.core.v1 import encode_id; print(json.dumps([encode_id('${kind}', value) for value in ${JSON.stringify(values)}]))`], { cwd: repo, env, encoding: 'utf8' }));
    },
    async ready() {
      const deadline = Date.now()+20000;
      while (Date.now()<deadline) {
        if (processWorker.exitCode !== null) throw new Error(`workers exited ${processWorker.exitCode}: ${log}`);
        try { const response = await fetch(`${server.origin}/health`, { signal: AbortSignal.timeout(500) }); if (response.ok) { assert.equal((await response.json()).git_sha, env.GIT_SHA); return; } } catch { /* Await process readiness with a deadline. */ }
        await new Promise(resolve => setTimeout(resolve,50));
      }
      throw new Error(`workers did not start: ${log}`);
    },
    async close() {
      processWorker.kill('SIGTERM'); if (processWorker.exitCode === null) await once(processWorker,'exit');
      await new Promise(resolve => authority.close(resolve));
      writeFileSync(process.env.DANIL_WORKERS_LOG ?? '/tmp/alpha-entry-inbox-v1-real-workers.log', log);
    },
  };
  return server;
}
