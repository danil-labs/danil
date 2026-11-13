import type { AccountComputersSource } from "../../lib/platform.ts";

/** El registro de la misma cuenta decide cuáles computadoras pertenecen al workspace. */
export function workspaceComputersSource(source: AccountComputersSource, workspace: string): AccountComputersSource {
  let turn = 0;
  let allowed = new Set<string>();
  return {
    ...source,
    list: async () => {
      const mine = ++turn;
      allowed = new Set();
      if (!source.workspaces) return { kind: "error", status: null };
      const registry = await source.workspaces();
      if (mine !== turn) return { kind: "error", status: null };
      if (registry.kind !== "ok") return registry;
      const row = registry.value.find((w) => w.id === workspace);
      if (!row) return { kind: "missing" };
      const computers = await source.list();
      if (mine !== turn) return { kind: "error", status: null };
      if (computers.kind !== "ok") return computers;
      const members = new Set(row.computers);
      const value = computers.value.filter((c) => members.has(c.computer_id));
      allowed = new Set(value.map((c) => c.computer_id));
      return { kind: "ok", value };
    },
    rename: (id, name) => allowed.has(id) ? source.rename(id, name) : Promise.resolve({ kind: "missing" }),
    remove: source.remove
      ? (id) => (allowed.has(id) ? source.remove!(id) : Promise.resolve({ kind: "missing" }))
      : undefined,
  };
}
