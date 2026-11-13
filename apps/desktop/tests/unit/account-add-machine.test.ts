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
import { addBlockedByExternal } from "../../src/features/settings/account-auth.ts";
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
