import { createRoot, createSignal } from "solid-js";
import { escribirPref, leerPref } from "../../../session/src/prefs.ts";
import {
  CORE_ID_SET,
  CORE_RAIL_SECTIONS,
  DEFAULT_RAIL_LAYOUT,
  RAIL_LAYOUT_KEY,
  moveRailSectionInLayout,
  reorderRailLayout,
  resolveRailSections,
  sanitizeRailLayout,
  setRailSectionCollapsedInLayout,
  setRailSectionVisibleInLayout,
  type RailLayoutState,
  type RailSectionDescriptor,
  type RailSectionId,
  type ResolvedRailSection,
} from "./rail-layout-model.ts";

// ── Registro extensible y estado reactivo único ──────────────────────────────

const [pluginSections, setPluginSections] = createRoot(() =>
  createSignal<RailSectionDescriptor[]>([]),
);

const [liveLayouts, setLiveLayouts] = createRoot(() =>
  createSignal<Record<string, RailLayoutState>>({}),
);

/**
 * Registra una sección de plugin en el riel izquierdo.
 * Devuelve una función para retirarla limpiamente al desmontarse o desactivarse.
 */
export function registerRailSection(descriptor: RailSectionDescriptor): () => void {
  if (!descriptor.id || CORE_ID_SET.has(descriptor.id)) {
    return () => {};
  }
  const normalized: RailSectionDescriptor = {
    ...descriptor,
    source: descriptor.source ?? "plugin",
  };
  setPluginSections((prev) => {
    const index = prev.findIndex((item) => item.id === normalized.id);
    if (index === -1) return [...prev, normalized];
    const next = [...prev];
    next[index] = normalized;
    return next;
  });
  return () => {
    setPluginSections((prev) => prev.filter((item) => item.id !== normalized.id));
  };
}

export function registeredRailSections(): RailSectionDescriptor[] {
  return [...CORE_RAIL_SECTIONS, ...pluginSections()];
}

export function loadRailLayout(key: string = RAIL_LAYOUT_KEY): RailLayoutState {
  return sanitizeRailLayout(leerPref<unknown>(key, null));
}

export function saveRailLayout(layout: RailLayoutState, key: string = RAIL_LAYOUT_KEY): void {
  escribirPref(key, sanitizeRailLayout(layout));
}

export function railLayout(key: string = RAIL_LAYOUT_KEY): RailLayoutState {
  return liveLayouts()[key] ?? loadRailLayout(key);
}

export function setRailLayout(next: RailLayoutState, key: string = RAIL_LAYOUT_KEY): void {
  const clean = sanitizeRailLayout(next);
  saveRailLayout(clean, key);
  setLiveLayouts((prev) => ({ ...prev, [key]: clean }));
}

export function resolvedRailSections(key: string = RAIL_LAYOUT_KEY): ResolvedRailSection[] {
  return resolveRailSections(railLayout(key), registeredRailSections());
}

export function setRailSectionVisible(
  id: RailSectionId,
  visible: boolean,
  key: string = RAIL_LAYOUT_KEY,
): void {
  const next = setRailSectionVisibleInLayout(railLayout(key), registeredRailSections(), id, visible);
  setRailLayout(next, key);
}

export function toggleRailSectionVisible(id: RailSectionId, key: string = RAIL_LAYOUT_KEY): void {
  const current = resolvedRailSections(key).find((s) => s.id === id);
  if (!current || !current.canHide) return;
  setRailSectionVisible(id, !current.visible, key);
}

export function setRailSectionCollapsed(
  id: RailSectionId,
  collapsed: boolean,
  key: string = RAIL_LAYOUT_KEY,
): void {
  const next = setRailSectionCollapsedInLayout(railLayout(key), registeredRailSections(), id, collapsed);
  setRailLayout(next, key);
}

export function toggleRailSectionCollapsed(id: RailSectionId, key: string = RAIL_LAYOUT_KEY): void {
  const current = resolvedRailSections(key).find((s) => s.id === id);
  if (!current) return;
  setRailSectionCollapsed(id, !current.collapsed, key);
}

export function moveRailSection(
  id: RailSectionId,
  direction: "up" | "down",
  key: string = RAIL_LAYOUT_KEY,
): void {
  const next = moveRailSectionInLayout(railLayout(key), registeredRailSections(), id, direction);
  setRailLayout(next, key);
}

export function reorderRailSections(
  orderedIds: readonly RailSectionId[],
  key: string = RAIL_LAYOUT_KEY,
): void {
  const next = reorderRailLayout(railLayout(key), registeredRailSections(), orderedIds);
  setRailLayout(next, key);
}

export function resetRailLayout(key: string = RAIL_LAYOUT_KEY): void {
  setRailLayout(DEFAULT_RAIL_LAYOUT, key);
}
