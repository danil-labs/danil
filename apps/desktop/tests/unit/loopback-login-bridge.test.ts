/**
 * Remote loopback OAuth login bridge (T13v):
 * - Desk handles remote `loopback-login` events via `loopback_login_pending` ->
 *   native listener -> `loopback_login_deliver`.
 * - Deduplicates concurrent events by `login_id`.
 * - Falls back silently on `port_unavailable` or any error.
 * - Cancels active native listeners on `done` / `cancel_login`.
 * - Never invokes the native listener on Web (`canListen: false`) or local machine logins.
 * - Router tags remote `loopback-login` events with `machine`, keeps `loopback_login_pending`
 *   and `loopback_login_deliver` in `PASSIVE` (never wakes offline VMs), and pins native
 *   `loopback_login_listen`/`loopback_login_cancel` to `OF_THIS_WINDOW`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { Fleet, PASSIVE, type Link, type MachineInfo } from "@terminus/fleet";
import "../helpers/catalog.ts";
import { createLoopbackLoginBridge, type LoopbackLoginEvent, type LoopbackLoginPending } from "../../../../packages/engine-client/src/loopbackLogin.ts";
import { OF_THIS_WINDOW } from "../../../../packages/features/machines/src/model/router-commands.ts";
import { createRouter } from "../../../../packages/features/machines/src/queries/router.ts";

function sampleEvent(overrides: Partial<LoopbackLoginEvent> = {}): LoopbackLoginEvent {
  return {
    login_id: "login_1",
    origin: { kind: "account", provider: "antigravity", account: "m:cmp_vm:acct_1" },
    port: 51121,
    path: "/oauth-callback",
    expires_at: 1_900_000_000,
    machine: "cmp_vm",
    ...overrides,
  };
}

function samplePending(overrides: Partial<LoopbackLoginPending> = {}): LoopbackLoginPending {
  return {
    login_id: "login_1",
    origin: { kind: "account", provider: "antigravity", account: "m:cmp_vm:acct_1" },
    port: 51121,
    path: "/oauth-callback",
    state: "opaque_state_abc",
    expires_at: 1_900_000_000,
    ...overrides,
  };
}

test("remote loopback-login fetches pending, listens natively, and delivers target to the same machine and context", async () => {
  const pendingCalls: unknown[] = [];
  const listenCalls: unknown[] = [];
  const deliverCalls: { args: { login_id: string; target: string }; options: unknown }[] = [];

  const bridge = createLoopbackLoginBridge({
    canListen: () => true,
    pending: async (options) => {
      pendingCalls.push(options);
      return [samplePending()];
    },
    listen: async (params) => {
      listenCalls.push(params);
      return "/oauth-callback?code=xyz&state=opaque_state_abc";
    },
    cancel: async () => {},
    deliver: async (args, options) => {
      deliverCalls.push({ args, options });
    },
  });

  await bridge.handleEvent(sampleEvent({ context: "ctx_org_1" }));

  assert.deepEqual(pendingCalls, [{ headers: { "x-terminus-machine": "cmp_vm", "x-danil-context": "ctx_org_1" } }]);
  assert.deepEqual(listenCalls, [{
    loginId: "login_1",
    port: 51121,
    path: "/oauth-callback",
    state: "opaque_state_abc",
    expiresAt: 1_900_000_000,
  }]);
  assert.deepEqual(deliverCalls, [{
    args: { login_id: "login_1", target: "/oauth-callback?code=xyz&state=opaque_state_abc" },
    options: { headers: { "x-terminus-machine": "cmp_vm", "x-danil-context": "ctx_org_1" } },
  }]);
  assert.equal(bridge.activeCount(), 0);
});

test("duplicate loopback-login event with same login_id is deduplicated while in flight", async () => {
  let resolveListen!: (value: string) => void;
  let pendingCount = 0;
  let listenCount = 0;

  const bridge = createLoopbackLoginBridge({
    canListen: () => true,
    pending: async () => {
      pendingCount += 1;
      return [samplePending()];
    },
    listen: () => {
      listenCount += 1;
      return new Promise<string>((resolve) => { resolveListen = resolve; });
    },
    cancel: async () => {},
    deliver: async () => {},
  });

  const first = bridge.handleEvent(sampleEvent());
  const second = bridge.handleEvent(sampleEvent());
  await second;
  assert.equal(bridge.activeCount(), 1);
  assert.equal(pendingCount, 1);

  resolveListen("/oauth-callback?code=ok&state=opaque_state_abc");
  await first;
  assert.equal(listenCount, 1);
  assert.equal(bridge.activeCount(), 0);
});

test("port_unavailable falls back silently without throwing or calling deliver", async () => {
  let delivered = false;
  const bridge = createLoopbackLoginBridge({
    canListen: () => true,
    pending: async () => [samplePending()],
    listen: async () => { throw { code: "port_unavailable" }; },
    cancel: async () => {},
    deliver: async () => { delivered = true; },
  });

  await assert.doesNotReject(() => bridge.handleEvent(sampleEvent()));
  assert.equal(delivered, false);
  assert.equal(bridge.activeCount(), 0);
});

test("cancelling by account cancels native listener and skips delivery", async () => {
  let resolveListen!: (value: string) => void;
  const cancelled: string[] = [];
  let delivered = false;

  const bridge = createLoopbackLoginBridge({
    canListen: () => true,
    pending: async () => [samplePending()],
    listen: () => new Promise<string>((resolve) => { resolveListen = resolve; }),
    cancel: async (loginId) => { cancelled.push(loginId); },
    deliver: async () => { delivered = true; },
  });

  const run = bridge.handleEvent(sampleEvent());
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(bridge.activeCount(), 1);

  bridge.cancelForAccount("m:cmp_vm:acct_1");
  assert.deepEqual(cancelled, ["login_1"]);
  assert.equal(bridge.activeCount(), 0);

  resolveListen("/oauth-callback?code=late&state=opaque_state_abc");
  await run;
  assert.equal(delivered, false);
});

test("never invokes native listener or pending on Web (canListen false) or local machine", async () => {
  let calls = 0;
  const webBridge = createLoopbackLoginBridge({
    canListen: () => false,
    pending: async () => { calls += 1; return [samplePending()]; },
    listen: async () => { calls += 1; return "/oauth-callback?code=1&state=s"; },
    cancel: async () => {},
    deliver: async () => { calls += 1; },
  });
  await webBridge.handleEvent(sampleEvent());
  assert.equal(calls, 0);

  const deskBridge = createLoopbackLoginBridge({
    canListen: () => true,
    pending: async () => { calls += 1; return [samplePending()]; },
    listen: async () => { calls += 1; return "/oauth-callback?code=1&state=s"; },
    cancel: async () => {},
    deliver: async () => { calls += 1; },
  });
  await deskBridge.handleEvent(sampleEvent({ machine: undefined }));
  await deskBridge.handleEvent(sampleEvent({ machine: "local" }));
  assert.equal(calls, 0);
});

test("router tags remote loopback-login events, routes pending/deliver without waking offline VMs, and keeps listen/cancel local", async () => {
  assert.equal(PASSIVE.has("loopback_login_pending"), true);
  assert.equal(PASSIVE.has("loopback_login_deliver"), true);
  assert.equal(OF_THIS_WINDOW.test("loopback_login_listen"), true);
  assert.equal(OF_THIS_WINDOW.test("loopback_login_cancel"), true);

  let emitRemote!: (events: { name: string; payload: unknown }[]) => void;
  const vmCalls: { command: string; args: unknown }[] = [];
  let vmState: "online" | "offline" = "online";
  const vmLink: Link = {
    state: () => vmState,
    call(_id, command, _ws, _folder, args) {
      vmCalls.push({ command, args });
      if (command === "loopback_login_pending") {
        return Promise.resolve({ value: [samplePending({ origin: { kind: "account", provider: "antigravity", account: "acct_1" } })], cached: null });
      }
      if (command === "loopback_login_deliver") return Promise.resolve({ value: null, cached: null });
      return Promise.resolve({ value: null, cached: null });
    },
    onState: () => () => {},
    onEvents: (listener) => { emitRemote = (evs) => listener({ events: evs, cursor: 1, gap: false }); return () => {}; },
    subscribe() {},
    start() {},
    close() {},
  };

  const delivered: { name: string; payload: unknown }[] = [];
  let router!: ReturnType<typeof createRouter>;
  const fleet = new Fleet({
    self: "cmp_mac",
    connect: () => vmLink,
    wake: async () => { throw new Error("must not wake VM for passive loopback commands"); },
    onEvents: (machine, list) => router.events(machine, list),
    deadlines: { read: 40, action: 200, intent: 400 },
  });
  const vm: MachineInfo = { id: "cmp_vm", name: "Nube IA", wakes: true };
  fleet.setMachines([vm]);
  router = createRouter({
    self: "cmp_mac",
    fleet,
    native: async (command) => {
      if (command === "list_workspaces") return { workspaces: [{ id: "w", name: "W" }], active: "w" };
      return null;
    },
    deliver: (events) => delivered.push(...events),
  });
  fleet.subscribeEvents();

  try {
    emitRemote([{
      name: "loopback-login",
      payload: {
        login_id: "login_1",
        origin: { kind: "account", provider: "antigravity", account: "acct_1" },
        port: 51121,
        path: "/oauth-callback",
        expires_at: 1_900_000_000,
      },
    }]);
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].name, "loopback-login");
    const ev = delivered[0].payload as LoopbackLoginEvent;
    assert.equal(ev.machine, "cmp_vm");
    assert.equal(ev.origin.kind === "account" ? ev.origin.account : null, "cmp_vm~acct_1");

    const pending = await router.handle("loopback_login_pending", {}, { headers: { "x-terminus-machine": "cmp_vm" } }) as LoopbackLoginPending[];
    assert.equal(pending.length, 1);
    assert.equal(pending[0].state, "opaque_state_abc");

    await router.handle("loopback_login_deliver", { login_id: "login_1", target: "/oauth-callback?code=c&state=opaque_state_abc" }, { headers: { "x-terminus-machine": "cmp_vm" } });
    assert.deepEqual(vmCalls.map((c) => c.command), ["loopback_login_pending", "loopback_login_deliver"]);

    vmState = "offline";
    await assert.rejects(() => router.handle("loopback_login_pending", {}, { headers: { "x-terminus-machine": "cmp_vm" } }));
  } finally {
    router.close();
    fleet.close();
  }
});
