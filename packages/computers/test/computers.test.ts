import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type SocketLike,
  RelaySession,
  SUBPROTOCOL,
  apiUrl,
  cachedAt,
  canAct,
  defaultComputer,
  groupWorkspaces,
  machineCompatibility,
  machineContracts,
  isManaged,
  systemOf,
  wakes,
  listComputers,
  listSharedComputers,
  listWorkspacesWithDeleted,
  powerOf,
  purgeWorkspace,
  removeComputer,
  renameComputer,
  restoreWorkspace,
  sessionProbe,
  sessionUrl,
  startComputer,
  startSharedComputer,
} from "../src/index.ts";

class FakeSocket implements SocketLike {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  url: string;
  protocols?: string[];
  constructor(url: string, protocols?: string[]) {
    this.url = url;
    this.protocols = protocols;
    FakeSocket.all.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  receive(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  close(code = 1000, reason = "") {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function session() {
  FakeSocket.all = [];
  const relay = new RelaySession(
    { endpoint: "https://computers.example", computerId: "cmp_a", getToken: () => "jwt" },
    (url, protocols) => new FakeSocket(url, protocols),
  );
  relay.start();
  return relay;
}

test("las URLs del plano de control aceptan host, https o wss", () => {
  assert.equal(apiUrl("computers.danil.ai", "/v1/computers"), "https://computers.danil.ai/v1/computers");
  assert.equal(apiUrl("http://127.0.0.1:8787/", "/v1/computers"), "http://127.0.0.1:8787/v1/computers");
  assert.equal(sessionUrl("https://computers.danil.ai", "cmp_x"), "wss://computers.danil.ai/v1/computers/cmp_x/session");
  assert.equal(sessionUrl("http://127.0.0.1:8787", "cmp_x"), "ws://127.0.0.1:8787/v1/computers/cmp_x/session");
});

test("el JWT va en los subprotocolos, nunca en la URL", async () => {
  const relay = session();
  await tick();
  const socket = FakeSocket.all[0];
  assert.deepEqual(socket.protocols, [SUBPROTOCOL, "bearer.jwt"]);
  assert.ok(!socket.url.includes("jwt"));
  relay.close();
});

test("una llamada pendiente se reenvía con el mismo id al reconectar, y `cached` llega aparte", async () => {
  const relay = session();
  await tick();
  const first = FakeSocket.all[0];
  const pending = relay.call("id-1", "list_projects", "w", null, {});
  first.open();
  assert.equal(first.sent.at(-1)?.id, "id-1");
  first.close(1006);
  await new Promise((r) => setTimeout(r, 600));
  const second = FakeSocket.all[1];
  second.open();
  assert.equal(second.sent.filter((m) => m.type === "call").at(-1)?.id, "id-1");
  second.receive({ type: "result", id: "id-1", value: [1], cached: { updated_at: "2026-10-19T10:00:00Z" } });
  const result = await pending;
  assert.deepEqual(result.value, [1]);
  assert.equal(cachedAt(result.cached), Date.parse("2026-10-19T10:00:00Z"));
  relay.close();
});

test("un error del relay rechaza con su código", async () => {
  const relay = session();
  await tick();
  const socket = FakeSocket.all[0];
  socket.open();
  const pending = relay.call("id-2", "load_session", "w", null, {});
  socket.receive({ type: "result", id: "id-2", error: { code: "machine_off" } });
  await assert.rejects(pending, (e: { code: string }) => e.code === "machine_off");
  relay.close();
});

test("el estado del relay se publica y 4001 no reconecta", async () => {
  const relay = session();
  await tick();
  const socket = FakeSocket.all[0];
  const states: string[] = [];
  relay.onState((s) => states.push(s));
  socket.open();
  socket.receive({ type: "state", state: "offline" });
  socket.receive({ type: "state", state: "starting" });
  assert.deepEqual(states, ["offline", "starting"]);
  socket.close(4001);
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(FakeSocket.all.length, 1);
});

test("solo una VM administrada se despierta; apagado es neutro", () => {
  assert.equal(powerOf("online"), "on");
  assert.equal(powerOf("stopped"), "off");
  assert.equal(powerOf("provisioning"), "off");
  assert.equal(powerOf("version_mismatch"), "outdated");
  assert.equal(isManaged({ provider: "aws-ec2" }), true);
  // La regla de la web: sin proveedor es una VM de antes; `kind` y `wakeable` mandan.
  assert.equal(wakes({ provider: null }), true);
  assert.equal(wakes({ provider: null, kind: "physical" }), false);
  assert.equal(wakes({ provider: "aws-ec2", wakeable: false }), false);
  assert.equal(canAct({ provider: "aws-ec2" }, "offline"), "wakes");
  assert.equal(canAct({ kind: "physical" }, "offline"), "asleep");
  assert.equal(canAct({ kind: "physical" }, "online"), "now");
  assert.equal(canAct({ provider: "aws-ec2" }, "outdated"), "outdated");
  const mac = { computer_id: "cmp_mac", provider: null, kind: "physical" };
  const vm = { computer_id: "cmp_vm", provider: "aws-ec2" };
  assert.equal(defaultComputer([mac, vm]), vm);
  assert.equal(defaultComputer([mac]), mac);
  assert.equal(systemOf("linux"), "linux");
  assert.equal(systemOf(" Darwin "), "macos");
  assert.equal(systemOf("win32"), "windows");
  assert.equal(systemOf("freebsd"), null);
  assert.equal(systemOf(null), null);
});

test("la API dice licencia, no tuya y error sin confundirlos", async () => {
  const answer = (status: number, body: unknown = null) => async () => ({ status, ok: status < 300, json: async () => body });
  assert.equal((await listComputers("x.example", "t", answer(403, { error: "license_required" }))).kind, "license");
  assert.equal((await listComputers("x.example", "t", answer(403, { error: { code: "unknown_user" } }))).kind, "no_account");
  assert.equal((await listComputers("x.example", "t", answer(403, { error: "unknown_user" }))).kind, "no_account");
  assert.equal((await listComputers("x.example", "t", answer(403))).kind, "error");
  assert.equal((await listComputers("x.example", "t", answer(401))).kind, "unauthorized");
  assert.equal((await startComputer("x.example", "t", "cmp", answer(404))).kind, "missing");
  const ok = await listComputers("x.example", "t", answer(200, [{ computer_id: "cmp_a", state: "online" }, { bad: 1 }]));
  assert.deepEqual(ok.kind === "ok" ? ok.value.map((c) => c.computer_id) : null, ["cmp_a"]);
  let seen: Record<string, string> | undefined;
  await listComputers("x.example", "tok", async (_url, init) => {
    seen = init?.headers;
    return { status: 200, ok: true, json: async () => [] };
  });
  assert.equal(seen?.authorization, "Bearer tok");
  assert.equal((await listComputers("x.example", "t", answer(403, { error: "access_denied" }))).code, "access_denied");
});

test("las máquinas compartidas se leen y se encienden aparte de las de la persona", async () => {
  const answer = (status: number, body: unknown = null) => async () => ({ status, ok: status < 300, json: async () => body });
  const verify = {
    computer_id: "cmp_verify",
    name: "vm-verify",
    organization_id: "org_danil",
    purpose: "resource",
    access: "service",
    can_stop: false,
    power: "stopped",
  };
  const listed = await listSharedComputers("x.example", "t", answer(200, { computers: [verify, { computer_id: "cmp_mia", purpose: "tasks" }, { name: "no" }] }));
  assert.deepEqual(listed.kind === "ok" ? listed.value : null, [verify]);
  const empty = await listSharedComputers("x.example", "t", answer(200, { computers: [] }));
  assert.deepEqual(empty.kind === "ok" ? empty.value : null, []);
  assert.equal((await listSharedComputers("x.example", "t", answer(200, {}))).kind, "error");
  const calls: { url: string; method?: string }[] = [];
  const started = await startSharedComputer("x.example", "tok", "cmp_verify", async (url, init) => {
    calls.push({ url, method: init?.method });
    return { status: 200, ok: true, json: async () => ({ ...verify, power: "starting" }) };
  });
  assert.equal(started.kind === "ok" ? started.value.power : null, "starting");
  assert.deepEqual(calls, [{ url: "https://x.example/v1/shared-computers/cmp_verify/start", method: "POST" }]);
  assert.equal((await startSharedComputer("x.example", "t", "cmp_verify", answer(403, { error: "license_required" }))).kind, "license");
  const denied = await startSharedComputer("x.example", "t", "cmp_verify", answer(403, { error: "access_denied" }));
  assert.equal(denied.kind === "error" ? denied.code : null, "access_denied");
  assert.equal((await startSharedComputer("x.example", "t", "cmp_verify", answer(409, { error: "computer_stopping" }))).code, "computer_stopping");
  assert.equal((await listSharedComputers("x.example", "t", answer(401))).kind, "unauthorized");
});

test("access_required distingue sólo el 403 exacto de licencia y permisos", async () => {
  const answer = (status: number, error: unknown) => async () => ({ status, ok: false, json: async () => ({ error }) });
  for (const shape of ["access_required", { code: "access_required" }]) {
    assert.deepEqual(await listComputers("x.example", "t", answer(403, shape)), { kind: "error", status: 403, code: "access_required" });
  }
  assert.deepEqual(await listComputers("x.example", "t", answer(403, { code: "permission_denied" })), { kind: "error", status: 403, code: "permission_denied" }, "other codes pass through but are not access_required");
  assert.deepEqual(await listComputers("x.example", "t", answer(403, { code: "license_required" })), { kind: "license" });
  assert.deepEqual(await listComputers("x.example", "t", answer(500, { code: "access_required" })), { kind: "error", status: 500, code: "access_required" });
});

test("los workspaces se juntan por id igual, nunca por nombre ni remoto", () => {
  const groups = groupWorkspaces([
    { machine: "vm", rows: [{ id: "a", name: "Producto", provider: "github", remote: "org/app" }, { id: "b", name: "Notas" }] },
    { machine: "mac", rows: [{ id: "a", name: "Otro nombre" }, { id: "x", name: "Producto", provider: "github", remote: "org/app" }, { id: "y", name: "notas" }] },
  ]);
  assert.deepEqual(
    groups.map((g) => [g.key, g.row.name, [...g.members]]),
    [["a", "Producto", [["vm", "a"], ["mac", "a"]]], ["b", "Notas", [["vm", "b"]]], ["x", "Producto", [["mac", "x"]]], ["y", "notas", [["mac", "y"]]]],
  );
});

test("el contrato: igual es ok, distinto es desactualizado, sin dato no se sabe", () => {
  assert.equal(machineCompatibility("ABC", "abc"), "ok");
  assert.equal(machineCompatibility("abc", "def"), "outdated");
  assert.equal(machineCompatibility(null, "abc"), "unknown");
  const base = "d4541d178c64a065c1a4a0c693817eb84ad17052fd605815295fa1696955ef8f";
  const extended = "3972c281dba1b61f9ad06fc82fbf059af3dbc55770b0a1bcb59ce786ec0a56f1";
  const credentials = "f33064bff6afb3708517c13a90f327af5333cbd82b15a589a2373c80d79e6d51";
  assert.equal(machineCompatibility(extended, base), "ok");
  assert.equal(machineCompatibility(base, credentials), "ok");
  const activity = "93b1c32f25c4fb5fd722079a5593f8316125d91e8ecf12e64c3d7e1f7aebae98";
  assert.equal(machineCompatibility(activity, base), "ok");
  assert.equal(machineCompatibility(base, activity), "ok");
  assert.deepEqual(machineContracts(base), [base, extended, credentials, activity]);
  assert.deepEqual(machineContracts("unknown"), ["unknown"]);
  assert.deepEqual(machineContracts(null), []);
});

test("llevar trabajo: exportar, importar y cancelar despiertan; las partes, la llave y el estado ni esperan en pending; nada se copia al espejo", async () => {
  const { INTENT_COMMANDS, MIRROR_COMMANDS } = await import("../src/index.ts");
  assert.ok(INTENT_COMMANDS.has("work_import"));
  assert.ok(INTENT_COMMANDS.has("work_cancel"));
  // computers#16: armar el bundle pasa de los 60 s de una lectura; sus argumentos son metadatos.
  assert.ok(INTENT_COMMANDS.has("work_export"));
  for (const command of ["work_read_part", "work_write_part", "work_key", "work_status"]) {
    assert.ok(!INTENT_COMMANDS.has(command), `${command} no puede guardarse en pending:`);
  }
  for (const command of ["work_read_part", "work_write_part", "work_export", "work_key"]) {
    assert.ok(!MIRROR_COMMANDS.has(command), `${command} no puede quedar en el espejo`);
  }
});

const jwt = (exp: number, n = 1) => `h.${Buffer.from(JSON.stringify({ exp: Math.floor(exp / 1000), n })).toString("base64url")}.s`;

test("la sesión manda los contratos que habla en la URL, y solo los bien formados", () => {
  assert.equal(sessionUrl("https://c.example", "cmp_x", ["abc123", "mal formado", "abc123", "def.4"]), "wss://c.example/v1/computers/cmp_x/session?contracts=abc123,def.4");
  assert.equal(sessionUrl("https://c.example", "cmp_x", []), "wss://c.example/v1/computers/cmp_x/session");
});

test("antes de que venza el token se renueva con `auth` sin reconectar; 4005 reabre con uno nuevo", async () => {
  FakeSocket.all = [];
  let n = 0;
  const tokens: string[] = [];
  const relay = new RelaySession(
    {
      endpoint: "https://c.example",
      computerId: "cmp_a",
      contracts: ["abc123"],
      getToken: () => {
        const t = jwt(Date.now() + 46_000, ++n);
        tokens.push(t);
        return t;
      },
    },
    (url, protocols) => new FakeSocket(url, protocols),
  );
  relay.start();
  await tick();
  const socket = FakeSocket.all[0];
  assert.ok(socket.url.endsWith("?contracts=abc123"));
  socket.open();
  await new Promise((r) => setTimeout(r, 1_100));
  const auth = socket.sent.filter((m) => m.type === "auth");
  assert.equal(auth.length, 1, "a fresh token goes over the open socket");
  assert.equal(auth[0].token, tokens[1]);
  assert.equal(FakeSocket.all.length, 1, "without reconnecting");
  socket.receive({ type: "auth", expires_at: new Date(Date.now() + 600_000).toISOString() });
  socket.close(4005);
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(FakeSocket.all.length, 2, "an expired session opens again");
  assert.deepEqual(FakeSocket.all[1].protocols, [SUBPROTOCOL, `bearer.${tokens.at(-1)}`], "with a new token");
  relay.close();
});

test("cada `hello` del motor llega como `engine` con su contrato", async () => {
  const relay = session();
  await tick();
  const socket = FakeSocket.all[0];
  const seen: (string | null)[] = [];
  relay.onEngine((e) => seen.push(e.contract));
  socket.open();
  socket.receive({ type: "engine", contract: "old", host_version: "0.2.82" });
  socket.receive({ type: "engine", contract: "new", host_version: "0.2.86" });
  assert.deepEqual(seen, ["old", "new"]);
  assert.deepEqual(relay.engine(), { contract: "new", host_version: "0.2.86" });
  relay.close();
});

test("lápidas: la lista con borrados, restaurar, purgar y el 409 con su código", async () => {
  const asked: [string, string | undefined][] = [];
  const reply = (status: number, body: unknown) => async (url: string, init?: { method?: string }) => {
    asked.push([url, init?.method]);
    return { status, ok: status < 300, json: async () => body };
  };
  const both = await listWorkspacesWithDeleted("https://c.example", "t", reply(200, { workspaces: [{ id: "w", name: "W", projects: [], computers: ["c"] }], deleted: [{ id: "w9", name: "Viejo", projects: [], computers: [], deleted_at: "2026-10-22T10:00:00Z" }] }));
  assert.equal(both.kind, "ok");
  if (both.kind === "ok") assert.deepEqual([both.value.workspaces.map((w) => w.id), both.value.deleted.map((w) => [w.id, w.deleted_at])], [["w"], [["w9", "2026-10-22T10:00:00Z"]]]);
  assert.equal(asked[0][0], "https://c.example/v1/workspaces?include_deleted=1");
  const restored = await restoreWorkspace("https://c.example", "t", "w9", reply(200, { id: "w9", name: "Viejo", projects: [], computers: [] }));
  assert.equal(restored.kind === "ok" && restored.value?.id, "w9");
  assert.equal((await purgeWorkspace("https://c.example", "t", "w9", reply(204, null))).kind, "ok");
  assert.deepEqual(asked.slice(1), [["https://c.example/v1/workspaces/w9/restore", "POST"], ["https://c.example/v1/workspaces/w9/purge", "POST"]]);
  assert.deepEqual(await purgeWorkspace("https://c.example", "t", "w", reply(409, { error: "workspace_not_deleted" })), { kind: "error", status: 409, code: "workspace_not_deleted" });
});

test("sin licencia la sesión se detiene con nombre, sin reintentar en bucle, hasta «Reintentar»", async () => {
  const relay = session();
  await tick();
  const socket = FakeSocket.all[0];
  const seen: (string | null)[] = [];
  relay.onBlocked((b) => seen.push(b));
  socket.open();
  const pending = relay.call("id-l", "list_projects", "w", null, {});
  socket.close(4003, "license_required");
  await assert.rejects(pending, (e: { code: string }) => e.code === "license_required", "what was in flight says why");
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(FakeSocket.all.length, 1, "it does not reconnect on its own");
  assert.equal(relay.blocked(), "license_required");
  await assert.rejects(relay.call("id-m", "list_projects", "w", null, {}), (e: { code: string }) => e.code === "license_required", "a new call fails at once");
  relay.retry();
  await tick();
  assert.equal(FakeSocket.all.length, 2, "«Reintentar» opens it again");
  assert.equal(relay.blocked(), null);
  assert.deepEqual(seen, ["license_required", null]);
  relay.close();
});

test("un upgrade que no abre pregunta por qué: con licencia faltante se detiene; si no lo sabe, reintenta", async () => {
  FakeSocket.all = [];
  let answer: "license_required" | null = "license_required";
  const relay = new RelaySession(
    { endpoint: "https://c.example", computerId: "cmp_a", getToken: () => "jwt", probe: async () => answer },
    (url, protocols) => new FakeSocket(url, protocols),
  );
  relay.start();
  await tick();
  FakeSocket.all[0].close(1006);
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(relay.blocked(), "license_required");
  assert.equal(FakeSocket.all.length, 1);
  answer = null;
  relay.retry();
  await tick();
  FakeSocket.all[1].close(1006);
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(relay.blocked(), null);
  assert.equal(FakeSocket.all.length, 3, "an unknown failure reconnects as before");
  relay.close();
});

test("la sonda de la sesión dice license_required con el 403 del relay", async () => {
  const reply = (status: number) => async () => ({ status, ok: false, json: async () => ({ error: status === 403 ? "license_required" : "websocket_required" }) });
  assert.equal(await sessionProbe("https://c.example", "t", "cmp_a", reply(403)), "license_required");
  assert.equal(await sessionProbe("https://c.example", "t", "cmp_a", reply(426)), null);
});

test("renombrar una computadora: PATCH con el nombre, y el error con su código", async () => {
  const asked: Array<{ url: string; method?: string; body?: string; type?: string }> = [];
  const reply = (status: number, body: unknown) => async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    asked.push({ url, method: init?.method, body: init?.body, type: init?.headers?.["content-type"] });
    return { status, ok: status < 300, json: async () => body };
  };
  const ok = await renameComputer("https://c.example", "t", "cmp_a", "Mac del estudio", reply(200, { computer_id: "cmp_a", name: "Mac del estudio" }));
  assert.deepEqual(ok, { kind: "ok", value: { computer_id: "cmp_a", name: "Mac del estudio" } });
  assert.deepEqual(asked[0], { url: "https://c.example/v1/computers/cmp_a", method: "PATCH", body: JSON.stringify({ name: "Mac del estudio" }), type: "application/json" });
  assert.deepEqual(await renameComputer("https://c.example", "t", "cmp_a", "", reply(400, { error: { code: "invalid_name" } })), { kind: "error", status: 400, code: "invalid_name" });
  assert.deepEqual(await renameComputer("https://c.example", "t", "cmp_b", "X", reply(404, { error: { code: "not_found" } })), { kind: "missing" });
});

test("quitar una computadora es DELETE sin cuerpo y distingue la VM administrada", async () => {
  const asked: { url: string; method?: string; body?: string }[] = [];
  const reply = (status: number, body: unknown) => async (url: string, init?: { method?: string; body?: string }) => {
    asked.push({ url, method: init?.method, body: init?.body });
    return { status, ok: status < 300, json: async () => body };
  };
  assert.deepEqual(await removeComputer("https://c.example", "t", "cmp_a", reply(200, { computer_id: "cmp_a", deleted: true })), { kind: "ok", value: { computer_id: "cmp_a" } });
  assert.deepEqual(asked[0], { url: "https://c.example/v1/computers/cmp_a", method: "DELETE", body: undefined });
  assert.deepEqual(await removeComputer("https://c.example", "t", "cmp_b", reply(409, { error: { code: "not_self_computer" } })), { kind: "error", status: 409, code: "not_self_computer" });
  assert.deepEqual(await removeComputer("https://c.example", "t", "cmp_c", reply(404, { error: { code: "not_found" } })), { kind: "missing" });
});

test("un bloque MCP con valores escritos no sale al socket; uno con marcadores sale revisado", async () => {
  const relay = session();
  await tick();
  const socket = FakeSocket.all[0];
  socket.open();
  const plain = JSON.stringify({ mcpServers: { acme: { command: "npx", env: { ACME_TOKEN: "abc123" } } } });
  await assert.rejects(relay.call("m-1", "add_mcp_servers", "w", null, { bloque: plain }), (e: { code: string }) => e.code === "mcp_values_over_relay");
  await assert.rejects(relay.call("m-2", "set_memory_provider", "w", null, { id: "m", block: plain, readWrite: true }), (e: { code: string }) => e.code === "mcp_values_over_relay");
  await assert.rejects(relay.call("m-3", "add_mcp_servers", "w", null, { bloque: "{ ACME_TOKEN: abc" }), (e: { code: string }) => e.code === "mcp_block_invalid");
  assert.equal(socket.sent.filter((m) => m.type === "call").length, 0, "nada llegó al socket");
  // Con la clave repetida `JSON.parse` se queda con la última: viaja eso, no el texto original.
  const repeated = '{"acme":{"command":"npx","env":{"T":"${secret:env/*/T}"},"args":[],"env":{"T":"${secret:env/*/T}"}}}';
  const pending = relay.call("m-4", "add_mcp_servers", "w", null, { bloque: repeated });
  const sent = socket.sent.find((m) => m.id === "m-4") as { args: { bloque: string } };
  assert.equal(sent.args.bloque, JSON.stringify(JSON.parse(repeated)));
  socket.receive({ type: "result", id: "m-4", value: 1 });
  assert.equal((await pending).value, 1);
  relay.close();
});

test('ticket context close code does not revoke a bearer session', async t => {
  let unauthorized = false;
  let socket: FakeSocket;
  const relay = new RelaySession({ endpoint: 'https://computers.example', computerId: 'cmp_a',
    getToken: () => 'jwt', onUnauthorized: () => { unauthorized = true; },
  }, (url, protocols) => (socket = new FakeSocket(url, protocols)));
  t.after(() => relay.close());
  relay.start();
  await tick();
  socket!.open();
  socket!.close(4008);
  assert.equal(unauthorized, false);
});
