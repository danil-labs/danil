export function sessionSeedInputs(group: { workspaces?: "all" | "later" } | undefined, available: readonly { id: string }[] | null, shown: ReadonlySet<string>, hidden: ReadonlySet<string>) {
  return group?.workspaces === "all" ? { shown: new Set((available ?? []).map((w) => w.id)), hidden: new Set<string>() } : { shown, hidden };
}

export type SessionSyncInput = { context_id: string; person: string | null; workspaces?: "all" | "later"; available: readonly { id: string }[] | null };

export function sessionSyncKey(groups: readonly SessionSyncInput[]): string {
  return JSON.stringify(groups.map((g) => [g.context_id, g.person, g.workspaces, g.available?.map((w) => w.id) ?? null]));
}
