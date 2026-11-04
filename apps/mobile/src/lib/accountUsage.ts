import { type AccountGroup, groupAccounts } from "@terminus/computers";
import type { AccountLimits, AiAccount } from "@terminus/protocol";
import { accountWorkspace, accountsOf, limitsSnapshotOf } from "./engine.ts";
import type { Host } from "./hosts.ts";

export type ProviderUsage = {
  groups: AccountGroup<AiAccount>[];
  limits: Record<string, AccountLimits | null>;
  cachedAt: Record<string, number | null>;
  /** `list_accounts.active` de cada máquina. `null` si no hay cuenta activa o la máquina quedó fuera del workspace. */
  activeByMachine: Record<string, string | null>;
};

/**
 * La cuenta activa de esta máquina, para la barra de uso.
 * Con id activo, solo el grupo que lo tiene en esa máquina: si no está, `null` (no se sustituye por otra).
 * Sin id, y con un solo grupo, ese grupo.
 */
export function activeUsage(usage: ProviderUsage, machine: string): AccountGroup<AiAccount> | null {
  const active = usage.activeByMachine[machine] ?? null;
  if (active) return usage.groups.find((group) => group.members.some((member) => member.machine === machine && member.id === active)) ?? null;
  return usage.groups.length === 1 ? usage.groups[0] : null;
}

/** La sesión y el consumo se leen de la misma máquina; las consultas se escalonan por proveedor. */
export async function providerUsage(hosts: Host[], provider: string, scopeOf: (host: Host) => string | null = (host) => accountWorkspace(host, null)): Promise<ProviderUsage> {
  const activeByMachine: Record<string, string | null> = {};
  const lists = await Promise.all(hosts.map(async (host) => {
    const inScope = Boolean(scopeOf(host) || host.linked == null);
    if (!inScope) {
      activeByMachine[host.id] = null;
      return { machine: host.id, on: host.power() === "on", accounts: [] as AiAccount[] };
    }
    const list = await accountsOf(host, scopeOf(host), provider).catch(() => null);
    activeByMachine[host.id] = list?.active ?? null;
    return { machine: host.id, on: host.power() === "on", accounts: list?.accounts ?? [] };
  }));
  const readings = new Map<string, Awaited<ReturnType<typeof limitsSnapshotOf>>>();
  for (const list of lists) {
    const host = hosts.find((host) => host.id === list.machine)!;
    for (const row of list.accounts) {
      const snapshot = row.authenticated_at ? await limitsSnapshotOf(host, scopeOf(host), provider, row.id) : { value: null, cachedAt: null };
      const reading = snapshot.value;
      readings.set(JSON.stringify([list.machine, row.id]), snapshot);
      const plan = reading?.mode === "read" ? reading.plan : reading?.mode === "waiting" ? reading.last?.plan : null;
      if (plan) Object.assign(row, { plan });
    }
  }
  const groups = groupAccounts(provider, lists);
  const limits: Record<string, AccountLimits | null> = {};
  const cachedAt: Record<string, number | null> = {};
  for (const group of groups) {
    const authenticated = group.members.filter((member) => lists.find((list) => list.machine === member.machine)?.accounts.find((row) => row.id === member.id)?.authenticated_at);
    const source = authenticated.find((member) => member.on) ?? authenticated[0] ?? group.usageFrom;
    group.usageFrom = source;
    group.row = lists.find((list) => list.machine === source.machine)!.accounts.find((row) => row.id === source.id)!;
    const host = hosts.find((host) => host.id === source.machine);
    const snapshot = host && group.row.authenticated_at ? readings.get(JSON.stringify([source.machine, source.id])) : null;
    limits[group.key] = snapshot?.value ?? null;
    cachedAt[group.key] = snapshot?.cachedAt ?? null;
  }
  return { groups, limits, cachedAt, activeByMachine };
}
