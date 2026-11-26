import type { LastWorkspace } from "../../../session/src/last-workspace.ts";
import { requestedWorkspaceFromSearch } from "../../../session/src/last-workspace.ts";
import type { SessionRailGroup } from "./session-groups.ts";

export function organizationStartTarget(groups: readonly SessionRailGroup[], workspace: string, context: string | null, defaultContext: string | null) {
  const selected = groups.find((group) => group.context_id === (context ?? defaultContext));
  if (selected?.available?.some((row) => row.id === workspace) && selected.added?.has(workspace)) return { id: workspace, context: selected.context_id };
  for (const group of selected ? [selected, ...groups.filter((row) => row !== selected)] : groups) {
    const row = group.available?.find((item) => group.added?.has(item.id));
    if (row) return { id: row.id, context: group.context_id };
  }
  return null;
}

type FamilyLike = { family: string; sub?: string };

function groupMatchesAccount(group: SessionRailGroup, families: readonly FamilyLike[], account: string): boolean {
  const family = families.find((f) => f.family === group.family);
  if (family?.sub) return family.sub === account;
  if (group.person) return group.person === account;
  return group.email === account;
}

function isGroupSettled(group: SessionRailGroup): boolean {
  return Boolean(group.empty_reason) || (group.available !== null && group.added !== null) || group.settled === true;
}

/** W6: el workspace de la URL y su dueño (`account` = sub del correo, `org`); el contexto se resuelve de nuevo, nunca se guarda. */
export function requestedStartTarget(groups: readonly SessionRailGroup[], families: readonly FamilyLike[], search: string) {
  const wanted = requestedWorkspaceFromSearch(search);
  if (!wanted) return null;
  const family = families.find((f) => f.sub === wanted.account)?.family;
  const group = family ? groups.find((g) => g.org === wanted.org && g.family === family) : undefined;
  // Solo un workspace del catálogo de ese contexto que la persona agregó: la URL no abre otra cosa.
  return group?.available?.some((row) => row.id === wanted.workspace) && group.added?.has(wanted.workspace)
    ? { id: wanted.workspace, context: group.context_id }
    : null;
}

export type StartupDecision =
  | { kind: "wait" }
  | { kind: "open"; id: string; context: string }
  | { kind: "none" };

/**
 * Elige qué workspace abrir al arrancar sin quedarse bloqueado por otras organizaciones lentas,
 * vencidas o sin sembrar. Prioridad: URL explícita (W6) → último workspace recordado → selección
 * por omisión de la organización.
 */
export function resolveStartupWorkspace(input: {
  groups: readonly SessionRailGroup[];
  families: readonly FamilyLike[];
  urlSearch: string;
  remembered: LastWorkspace | null;
  open: string | null;
  activeContext: string | null;
  defaultContext: string | null;
  nativeWindow: boolean;
  workspaceLoading: boolean;
}): StartupDecision {
  const { groups, families, urlSearch, remembered, open, activeContext, defaultContext, nativeWindow, workspaceLoading } = input;
  if (!groups.length) return { kind: "wait" };
  if (nativeWindow && !open && workspaceLoading) return { kind: "wait" };

  const urlTarget = requestedWorkspaceFromSearch(urlSearch);
  const candidates: { target: LastWorkspace; strictSub: boolean }[] = [];
  if (urlTarget) candidates.push({ target: urlTarget, strictSub: true });
  if (remembered) candidates.push({ target: remembered, strictSub: !nativeWindow });

  for (const { target, strictSub } of candidates) {
    const group = groups.find((g) => {
      if (g.org !== target.org) return false;
      if (strictSub) {
        const family = families.find((f) => f.family === g.family);
        return family?.sub === target.account;
      }
      return groupMatchesAccount(g, families, target.account);
    });
    if (!group) continue;
    if (group.available?.some((row) => row.id === target.workspace) && group.added?.has(target.workspace)) {
      return { kind: "open", id: target.workspace, context: group.context_id };
    }
    if (!isGroupSettled(group)) return { kind: "wait" };
  }

  // Sin destino recordado válido: si la organización por omisión ya tiene un workspace agregado
  // (y no hay otro abierto que validar), ábrelo ya sin esperar al resto de organizaciones.
  if (!open) {
    const preferred = groups.find((g) => g.context_id === (activeContext ?? defaultContext));
    const immediate = preferred?.available?.find((item) => preferred.added?.has(item.id));
    if (preferred && immediate) return { kind: "open", id: immediate.id, context: preferred.context_id };
  }

  if (!groups.every(isGroupSettled)) return { kind: "wait" };

  const fallback = open
    ? (groups.some((g) => g.available?.some((w) => w.id === open))
        ? organizationStartTarget(groups, open, activeContext, defaultContext)
        : null)
    : organizationStartTarget(groups, "", null, defaultContext);
  return fallback ? { kind: "open", id: fallback.id, context: fallback.context } : { kind: "none" };
}
