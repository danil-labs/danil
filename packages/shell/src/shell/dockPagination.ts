import type { DockAgent } from "./dockLayout";

export const DOCK_PAGE_SIZE = 5;

/** Página acotada al catálogo actual, incluso si desaparece su última fila. */
export function pageDock<T extends DockAgent>(ordered: readonly T[], requested: number) {
  const pages = Math.max(1, Math.ceil(ordered.length / DOCK_PAGE_SIZE));
  const page = Math.max(0, Math.min(pages - 1, Math.trunc(requested)));
  const start = page * DOCK_PAGE_SIZE;
  const end = start + DOCK_PAGE_SIZE;
  return {
    page,
    pages,
    shown: ordered.slice(start, end),
    workingBefore: ordered.slice(0, start).some(agent => agent.status === "working"),
    workingAfter: ordered.slice(end).some(agent => agent.status === "working"),
  };
}
