import type { SessionRailGroup } from "./session-groups.ts";

export type OrgPreference = { version: 1; orgs: { org_id: string; pinned: boolean }[] };
export type OrgTile = { key: string; id: string; name: string; logo: string | null; context: SessionRailGroup };
export type RailOrganization = { id: string; name: string; contexts: SessionRailGroup[]; tiles: OrgTile[]; pinned: boolean };
export function parseOrgPreference(value: unknown): OrgPreference {
  const raw = value as { version?: unknown; orgs?: unknown } | null;
  if (raw?.version !== 1 || !Array.isArray(raw.orgs)) return { version: 1, orgs: [] };
  const seen = new Set<string>();
  return { version: 1, orgs: raw.orgs.flatMap((row) => {
    const org = row as { org_id?: unknown; pinned?: unknown } | null;
    if (typeof org?.org_id !== "string" || !org.org_id || org.org_id.length > 256 || seen.has(org.org_id) || typeof org.pinned !== "boolean") return [];
    seen.add(org.org_id); return [{ org_id: org.org_id, pinned: org.pinned }];
  }) };
}
export function orderedOrganizations(groups: readonly SessionRailGroup[], rows: readonly { id: string; name: string; logo: string | null }[], preference: OrgPreference): RailOrganization[] {
  const organizations = new Map<string, RailOrganization>();
  for (const group of groups) {
    const org = organizations.get(group.org) ?? { id: group.org, name: group.org_name ?? group.org, contexts: [], tiles: [], pinned: preference.orgs.find((r) => r.org_id === group.org)?.pinned ?? false };
    org.contexts.push(group);
    for (const workspace of group.available ?? []) {
      const row = rows.find((w) => w.id === workspace.id);
      if (row && !org.tiles.some((w) => w.id === row.id && w.context.context_id === group.context_id)) org.tiles.push({ ...row, key: JSON.stringify([group.context_id, row.id]), context: group });
    }
    organizations.set(group.org, org);
  }
  const result = [...organizations.values()].filter((org) => org.tiles.length);
  const rank = (id: string) => { const i = preference.orgs.findIndex((r) => r.org_id === id); return i < 0 ? preference.orgs.length : i; };
  return result.sort((a, b) => rank(a.id) - rank(b.id));
}
export function changeOrgPreference(preference: OrgPreference, ids: readonly string[], org: string, action: "pin" | "up" | "down"): OrgPreference {
  const rows = [...preference.orgs, ...ids.filter((id) => !preference.orgs.some((r) => r.org_id === id)).map((id) => ({ org_id: id, pinned: false }))].map((r) => ({ ...r }));
  const index = rows.findIndex((r) => r.org_id === org);
  if (index < 0) return { version: 1, orgs: rows };
  if (action === "pin") rows[index].pinned = !rows[index].pinned;
  else {
    const slots = rows.flatMap((row, i) => ids.includes(row.org_id) ? [i] : []);
    const current = slots.indexOf(index);
    const next = current + (action === "up" ? -1 : 1);
    if (current >= 0 && next >= 0 && next < slots.length) [rows[index], rows[slots[next]]] = [rows[slots[next]], rows[index]];
  }
  return { version: 1, orgs: rows };
}
export function stackedOrganizations(groups: readonly RailOrganization[], height: number, openOrg: string | null, used: Readonly<Record<string, number>>): ReadonlySet<string> {
  const stack = new Set<string>();
  if (height <= 0) return stack;
  let needed = groups.reduce((n, g) => n + g.tiles.length * 44 - 4, 0) + Math.max(0, groups.length - 1) * 12;
  const candidates = groups.map((g, i) => ({ g, i })).filter(({ g }) => !g.pinned && g.id !== openOrg && g.tiles.length > 1).sort((a, b) => (used[a.g.id] ?? 0) - (used[b.g.id] ?? 0) || b.i - a.i);
  for (const { g } of candidates) { if (needed <= height) break; stack.add(g.id); needed -= (g.tiles.length - 1) * 44; }
  return stack;
}
