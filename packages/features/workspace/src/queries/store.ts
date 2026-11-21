import { createSignal, untrack } from "solid-js";

/** Engine workspace IDs, never the tenancy accounts returned by HTTP /v1/workspaces. */
type StartupContext = {
  active: string | null;
  workspaces: { id: string; context_root: string | null; default_permission_mode: string | null }[];
};
type ContextSource = { id: string; root: boolean; missing: boolean };
type MaterialToken = Readonly<{ generation: number; material: number }>;
type Transition = MaterialToken & Readonly<{ previous: string | null; workspace: string | null }>;

/** Owns context validity; conversation and view resets remain with their owners. */
export function createWorkspaceStore() {
  const [active, setActive] = createSignal<string | null>(null);
  const [mode, setMode] = createSignal<string | null>(null);
  const [root, setRoot] = createSignal<string | null>(null);
  const [confirmed, setConfirmed] = createSignal(false);
  // Deliberately nonreactive: validity checks must not subscribe unrelated readers.
  let generation = 0;
  let material = 0;
  let disposed = false;
  const current = (token: MaterialToken) => !disposed && token.generation === generation;
  const currentMaterial = (token: MaterialToken) => current(token) && token.material === material;

  function beginTransition(startup: StartupContext): Transition {
    if (disposed) return { previous: untrack(active), workspace: startup.active, generation, material };
    const selected = startup.workspaces.find(workspace => workspace.id === startup.active);
    const previous = untrack(active);
    setRoot(selected?.context_root ?? null);
    setConfirmed(false);
    material++;
    setMode(selected?.default_permission_mode ?? null);
    generation++;
    return { previous, workspace: startup.active, generation, material };
  }
  function activate(token: Transition) {
    if (!current(token)) return false;
    setActive(token.workspace);
    return true;
  }
  function beginMaterial(): MaterialToken {
    if (disposed) return { generation, material };
    material++;
    // Preserve the empty-workspace path: it invalidates work but does not read.
    if (untrack(active)) setConfirmed(false);
    return { generation, material };
  }
  function confirmContext(token: MaterialToken, candidate: string | null, listed: ContextSource[]) {
    if (!currentMaterial(token)) return "obsolete" as const;
    const selected = candidate ?? listed.find(source => source.root)?.id ?? null;
    if (selected && !listed.some(source => source.id === selected && !source.missing)) return "unavailable" as const;
    setRoot(selected);
    setConfirmed(true);
    return "accepted" as const;
  }
  function modeChanged(workspace: string | null, value: string | null, requestedGeneration = generation) {
    if (!disposed && requestedGeneration === generation && workspace === untrack(active)) setMode(value);
  }
  return {
    active, mode, root, confirmed,
    generation: () => generation,
    beginTransition, activate, beginMaterial, current, currentMaterial, confirmContext, modeChanged,
    dispose: () => { disposed = true; generation++; material++; },
  };
}
