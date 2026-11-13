/**
 * El «+» de una cuenta de IA en un workspace que vive en otra máquina (la VM de
 * la organización): se crea y se conecta allá, encendida o apagada, en el
 * escritorio y en la web. Con la máquina apagada el «+» no queda bloqueado por
 * no saber todavía los proveedores: agregar es lo que la enciende.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { INTENT_COMMANDS, type MachineState } from "@terminus/computers";
import { Fleet, type Link, type MachineInfo } from "@terminus/fleet";
import "../helpers/catalog.ts";
import { createRouter } from "../../src/features/machines/router.ts";
import { cloudInfo, cloudLink } from "../../src/features/machines/cloud-machines.ts";
import { accountKeyUrl, addAccount, addBlockedByExternal, providersFor } from "../../src/features/settings/account-auth.ts";
import { errorCode } from "../../src/lib/errorCode.ts";
type Args = Record<string, unknown>;
function fakeLink(answers: Record<string, unknown>, initial: MachineState) {
  let state = initial; const calls: { command: string; args: Args; workspace: string | null }[] = [];
  const ls = new Set<(s: MachineState) => void>();
  const set = (s: MachineState) => { state = s; for (const l of ls) l(s); };
  const link: Link & { calls: typeof calls } = { calls, state: () => state,
    call(_i, command, workspace, _f, args) { calls.push({ command, workspace, args: args as Args });
      return new Promise((res, rej) => {
        if (state !== "online") { if (!INTENT_COMMANDS.has(command)) return rej({ code: "machine_off" }); set("starting"); return void setTimeout(() => { set("online"); res({ value: answers[command] ?? null, cached: null }); }, 10); }
        if (answers[command] === undefined) return rej({ code: "command" }); res({ value: answers[command], cached: null }); }); },
    onState: (l) => { ls.add(l); return () => void ls.delete(l); }, onEvents: () => () => {}, subscribe() {}, start() {}, close() {} };
  return link;
}
const ORG = { id: "orgws", name: "Danil Workspace" };
const ENDPOINT: MachineInfo = { id: "cmp_vm", name: "Nube IA", wakes: true, linked: new Set([ORG.id]), organization: { id: "org_01", workspaces: [ORG] } };
const VM: MachineInfo = { id: "cmp_vm", name: "Danil VM", wakes: true };
for (const [label, info] of [["org endpoint", ENDPOINT], ["vm", VM]] as const) for (const st of ["online", "offline"] as const) {
  test(`desktop: + in a workspace that lives on the ${label} (${st}) adds there`, async () => {
    const vm = fakeLink({ add_account: { id: "a1" }, login_account: null, list_accounts: { accounts: [], active: null } }, st);
    const native: string[] = [];
    const fleet = new Fleet({ self: "cmp_home", connect: () => vm, wake: async () => true, deadlines: { read: 40, action: 200, intent: 400 } });
    const router = createRouter({ self: "cmp_home", fleet, native: async (c) => { native.push(c); if (c === "list_workspaces") return { workspaces: [{ id: "w", name: "W" }], active: "w" }; if (c === "add_account") return { id: "LOCAL" }; return null; } });
    fleet.setMachines([info]);
    fleet.setRegistry([{ id: "w", name: "W", projects: [], computers: ["cmp_home"] }, ...(info === VM ? [{ id: ORG.id, name: ORG.name, projects: [], computers: ["cmp_vm"] }] : [])] as never);
    await router.handle("list_workspaces");
    await router.handle("set_active_workspace", { id: ORG.id });
    const a = await router.handle("add_account", { provider: "claude", label: "" }) as { id: string };
    await router.handle("login_account", { provider: "claude", id: a.id, mode: "tuberia" });
    assert.deepEqual(vm.calls.map((c) => [c.command, c.workspace]), [["add_account", ORG.id], ["login_account", ORG.id]], `native: ${native}`);
    router.close();
  });
  test(`web: + with the ${label} (${st}) adds there`, async () => {
    const vm = fakeLink({ add_account: { id: "a1" }, login_account: null }, st);
    const fleet = new Fleet({ self: null, connect: () => vm, wake: async () => true, deadlines: { read: 40, action: 200, intent: 400 } });
    const router = createRouter({ self: null, fleet, native: null, registry: async () => [{ id: ORG.id, name: ORG.name, computers: ["cmp_vm"], projects: [], settings: null, created_at: "2026-10-01T00:00:00Z" }] as never });
    fleet.setMachines([info]);
    await router.handle("list_workspaces");
    const a = await router.handle("add_account", { provider: "claude", label: "" }) as { id: string };
    await router.handle("login_account", { provider: "claude", id: a.id, mode: "tuberia" });
    assert.deepEqual(vm.calls.map((c) => c.command).filter((c) => c.includes("account")), ["add_account", "login_account"]);
    router.close();
  });
}

test("the + is not blocked while the providers of an off machine are unknown", () => {
  assert.equal(addBlockedByExternal(undefined), false, "unknown (machine off): adding wakes it");
  assert.equal(addBlockedByExternal({ available: false, external_install_url: "https://x" }), true);
  assert.equal(addBlockedByExternal({ available: true, external_install_url: "https://x" }), false);
  assert.equal(addBlockedByExternal({ available: false, external_install_url: null }), false);
});

/**
 * La máquina de la organización por `/v1/machines` (MVP): su canal con ticket no
 * la enciende con un intent; apagada no hay canal y una llamada esperaría su plazo
 * entero. El «+» la enciende primero por el plano de control, como un mensaje, y
 * después corre el flujo: crear, saber sus proveedores, conectar.
 */
function ticketRelay(answers: Record<string, unknown>) {
  let state: MachineState = "unknown";
  const calls: string[] = [];
  const ls = new Set<(s: MachineState) => void>();
  const relay = {
    calls,
    open() { state = "online"; for (const l of ls) l(state); },
    state: () => state,
    call(_i: string, command: string, _w: string | null, _f: string | null, _a: unknown, timeout?: number) {
      calls.push(command);
      return new Promise((res, rej) => {
        if (state !== "online") return void setTimeout(() => rej({ code: "io", detail: "timeout" }), timeout);
        if (answers[command] === undefined) return rej({ code: "command" });
        res({ value: answers[command], cached: null });
      });
    },
    onState: (l: (s: MachineState) => void) => { ls.add(l); return () => void ls.delete(l); },
    onEvents: () => () => {}, onEngine: () => () => {}, blocked: () => null, onBlocked: () => () => {}, retry() {},
    onDeferred: () => () => {}, deferred: () => ({ actions: [], done: [] }), subscribe() {}, start() {}, close() {},
  };
  return relay;
}
const CLOUD: MachineInfo = { id: "cmp_vm", name: "Danil", wakes: true };
/** Los cuatro agentes del MVP; OpenCode 2 entra por el navegador, no por la clave (`accountKeyUrl`). */
const AGENTS = [
  { id: "claude", api_key: null },
  { id: "codex", api_key: null },
  { id: "antigravity", api_key: null },
  { id: "opencode", api_key: "https://opencode.ai/auth" },
];
for (const where of ["desktop", "web"] as const) for (const start of ["stopped", "online"] as const) for (const agent of AGENTS) {
  test(`${where}: + for ${agent.id} with the /v1/machines machine ${start} starts it if needed, then adds, learns its providers and logs in`, async () => {
    const relay = ticketRelay({ add_account: { id: "a1" }, list_providers: AGENTS.map((a) => ({ ...a, available: true })), login_account: null });
    let row: MachineState = start;
    const woken: string[] = [];
    if (start === "online") relay.open();
    const fleet = new Fleet({ self: where === "desktop" ? "cmp_home" : null, connect: () => cloudLink(relay as never, () => row), deadlines: { read: 40, action: 200, intent: 400 },
      wake: async (id) => { woken.push(id); row = "starting"; setTimeout(() => relay.open(), 10); return true; } });
    const router = createRouter(where === "desktop"
      ? { self: "cmp_home", fleet, native: async (c) => (c === "list_workspaces" ? { workspaces: [{ id: "w", name: "W" }], active: "w" } : null) }
      : { self: null, fleet, native: null, registry: async () => [{ id: ORG.id, name: ORG.name, computers: ["cmp_vm"], projects: [], settings: null, created_at: "2026-10-01T00:00:00Z" }] as never });
    fleet.setMachines([cloudInfo(CLOUD)]);
    fleet.setRegistry([{ id: "w", name: "W", projects: [], computers: ["cmp_home"] }, { id: ORG.id, name: ORG.name, projects: [], computers: ["cmp_vm"] }] as never);
    await router.handle("list_workspaces");
    if (where === "desktop") await router.handle("set_active_workspace", { id: ORG.id });
    assert.equal(fleet.power("cmp_vm"), start === "stopped" ? "off" : "on", "the row says stopped while there is no channel");
    const call = (command: string, args?: Record<string, unknown>, options?: { headers: Record<string, string> }) => router.handle(command, args, options);
    const added = await addAccount(call as never, agent.id, null);
    const { account, providers } = added;
    assert.ok(providers, "providers read once it is on");
    const opt = providers.find((p) => p.id === agent.id);
    // OpenCode 2 trae su clave de Go en la tabla y aun así entra por el navegador (regresión de #426).
    if (agent.id === "opencode") assert.equal(accountKeyUrl(opt), null);
    await router.handle("login_account", { provider: agent.id, id: account.id, mode: "tuberia" });
    assert.deepEqual(woken, start === "stopped" ? ["cmp_vm"] : [], "started once, by the control plane, only when it was off");
    assert.deepEqual(relay.calls.filter((c) => c !== "list_workspaces"), ["add_account", "list_providers", "login_account"]);
    router.close();
  });
}

test("a created account is never lost: if its providers do not arrive, Connect resumes the same one without adding another", async () => {
  const seen: string[] = [];
  let providersUp = false;
  const call = async (command: string) => {
    seen.push(command);
    if (command === "add_account") return { id: "a1" };
    if (command === "list_providers" && providersUp) return [{ id: "claude", available: true }];
    throw { what: "x", detail: "machine_timeout" };
  };
  const added = await addAccount(call as never, "claude", null);
  assert.equal(added.account.id, "a1", "the account the machine created is kept");
  assert.equal(added.providers, null, "no login without its providers");
  assert.equal(errorCode((added as { failure: unknown }).failure), "machine_timeout", "and the person is told why");
  providersUp = true;
  assert.deepEqual((await providersFor(call as never, null)).map((p) => p.id), ["claude"]);
  assert.deepEqual(seen, ["add_account", "list_providers", "list_providers"], "one account, never a second add_account");
  const known = [{ id: "claude", available: true }] as never;
  assert.equal((await addAccount(async () => ({ id: "a2" }), "claude", known)).providers, known, "known providers are not asked again");
});
