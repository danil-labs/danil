import { createRoot, createSignal, type JSX } from "solid-js";
import { escribirPref, leerPref } from "../../../session/src/prefs.ts";
import { t } from "../../../ui/src/lib/i18n.ts";

export type RailSectionId = string;
export type RailSectionSource = "core" | "plugin";
export type RailSectionKind = "section" | "button";

/**
 * Definición declarativa de una sección del riel izquierdo.
 *
 * Las secciones de núcleo (`agents`, `tasks`) las pinta `Sidebar.tsx` con sus
 * props de negocio; los plugins futuros registran aquí su sección con
 * `registerRailSection` aportando `render` (y opcionalmente `renderActions`),
 * o `kind: "button"` con `onActivate` (acceso directo en una sola fila),
 * y heredan orden, visibilidad, plegado, persistencia y presencia en el
 * organizador sin tocar la barra.
 */
export interface RailSectionDescriptor {
  readonly id: RailSectionId;
  readonly label: () => string;
  readonly defaultOrder: number;
  readonly defaultVisible?: boolean;
  readonly defaultCollapsed?: boolean;
  readonly hideable?: boolean;
  readonly source?: RailSectionSource;
  readonly kind?: RailSectionKind;
  readonly renderIcon?: () => JSX.Element;
  readonly onActivate?: () => void;
  readonly isActive?: () => boolean;
  readonly render?: () => JSX.Element;
  readonly renderActions?: () => JSX.Element;
}

/** Preferencia persistida del riel izquierdo. */
export interface RailLayoutState {
  /** Orden elegido por la persona. Conserva ids de plugins que aún no cargaron. */
  order: RailSectionId[];
  /** Sobreescrituras explícitas de visibilidad por id de sección. */
  visible: Record<RailSectionId, boolean>;
  /** Sobreescrituras explícitas de plegado por id de sección. */
  collapsed: Record<RailSectionId, boolean>;
}

/** Sección ya resuelta para pintar en el riel o en el organizador. */
export interface ResolvedRailSection {
  readonly id: RailSectionId;
  readonly descriptor: RailSectionDescriptor;
  readonly visible: boolean;
  readonly collapsed: boolean;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly canHide: boolean;
}

export const RAIL_LAYOUT_KEY = "sidebar.rail.layout";

export const CORE_RAIL_SECTION_IDS = {
  PROJECTS: "projects",
  AGENTS: "agents",
  TASKS: "tasks",
} as const;

export const DEFAULT_RAIL_LAYOUT: RailLayoutState = {
  order: [],
  visible: {},
  collapsed: {},
};

const CORE_RAIL_SECTIONS: readonly RailSectionDescriptor[] = [
  {
    id: CORE_RAIL_SECTION_IDS.PROJECTS,
    label: () => t("settings.general.section.projects"),
    defaultOrder: 8,
    defaultVisible: true,
    defaultCollapsed: true,
    hideable: true,
    source: "core",
  },
  {
    id: CORE_RAIL_SECTION_IDS.AGENTS,
    label: () => t("shell.agent_dock.team"),
    defaultOrder: 10,
    defaultVisible: true,
    defaultCollapsed: true,
    hideable: true,
    source: "core",
  },
  {
    id: CORE_RAIL_SECTION_IDS.TASKS,
    label: () => t("shell.sidebar.tasks"),
    defaultOrder: 20,
    defaultVisible: true,
    defaultCollapsed: false,
    hideable: true,
    source: "core",
  },
];

const CORE_ID_SET = new Set<string>(CORE_RAIL_SECTIONS.map((s) => s.id));

function sanitizeBooleanMap(raw: unknown): Record<RailSectionId, boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<RailSectionId, boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.length > 0 && typeof value === "boolean") out[key] = value;
  }
  return out;
}

/** Normaliza datos leídos de `localStorage` para tolerar corrupción o versiones viejas. */
export function sanitizeRailLayout(raw: unknown): RailLayoutState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { order: [], visible: {}, collapsed: {} };
  }
  const source = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const order: RailSectionId[] = [];
  if (Array.isArray(source.order)) {
    for (const entry of source.order) {
      if (typeof entry === "string" && entry.length > 0 && !seen.has(entry)) {
        seen.add(entry);
        order.push(entry);
      }
    }
  }
  return {
    order,
    visible: sanitizeBooleanMap(source.visible),
    collapsed: sanitizeBooleanMap(source.collapsed),
  };
}

function defaultSortedDescriptors(descriptors: readonly RailSectionDescriptor[]): RailSectionDescriptor[] {
  return descriptors
    .map((descriptor, index) => ({ descriptor, index }))
    .sort((a, b) => a.descriptor.defaultOrder - b.descriptor.defaultOrder || a.index - b.index)
    .map(({ descriptor }) => descriptor);
}

/**
 * Resuelve el orden, visibilidad y plegado efectivos de las secciones registradas.
 *
 * Las secciones que ya estaban en `layout.order` conservan exactamente la posición
 * elegida por la persona; cualquier plugin nuevo registrado después se adopta al
 * final siguiendo su `defaultOrder` sin perder el orden guardado.
 */
export function resolveRailSections(
  layout: RailLayoutState,
  descriptors: readonly RailSectionDescriptor[],
): ResolvedRailSection[] {
  const byId = new Map<RailSectionId, RailSectionDescriptor>();
  const orderedDefaults = defaultSortedDescriptors(descriptors);
  for (const descriptor of orderedDefaults) {
    if (!byId.has(descriptor.id)) byId.set(descriptor.id, descriptor);
  }

  const ordered: RailSectionDescriptor[] = [];
  const placed = new Set<RailSectionId>();

  for (const id of layout.order) {
    const descriptor = byId.get(id);
    if (descriptor && !placed.has(id)) {
      placed.add(id);
      ordered.push(descriptor);
    }
  }

  for (const descriptor of orderedDefaults) {
    if (!placed.has(descriptor.id)) {
      placed.add(descriptor.id);
      ordered.push(descriptor);
    }
  }

  const total = ordered.length;
  return ordered.map((descriptor, index) => {
    const canHide = descriptor.hideable !== false;
    const visible = canHide
      ? (layout.visible[descriptor.id] ?? descriptor.defaultVisible ?? true)
      : true;
    const collapsed = layout.collapsed[descriptor.id] ?? descriptor.defaultCollapsed ?? false;
    return {
      id: descriptor.id,
      descriptor,
      visible,
      collapsed,
      canMoveUp: index > 0,
      canMoveDown: index < total - 1,
      canHide,
    };
  });
}

/** Reordena las secciones registradas conservando ids de plugins aún no cargados. */
export function reorderRailLayout(
  layout: RailLayoutState,
  descriptors: readonly RailSectionDescriptor[],
  orderedIds: readonly RailSectionId[],
): RailLayoutState {
  const registered = new Set(descriptors.map((d) => d.id));
  const resolvedIds = resolveRailSections(layout, descriptors).map((s) => s.id);
  const nextRegistered: RailSectionId[] = [];
  const seen = new Set<RailSectionId>();

  for (const id of orderedIds) {
    if (registered.has(id) && !seen.has(id)) {
      seen.add(id);
      nextRegistered.push(id);
    }
  }
  for (const id of resolvedIds) {
    if (!seen.has(id)) {
      seen.add(id);
      nextRegistered.push(id);
    }
  }

  // Reemplaza los huecos ocupados por secciones registradas en su orden relativo,
  // conservando en su sitio los ids de plugins ausentes o diferidos.
  const merged: RailSectionId[] = [];
  let cursor = 0;
  for (const id of layout.order) {
    if (registered.has(id)) {
      if (cursor < nextRegistered.length) merged.push(nextRegistered[cursor++]);
    } else if (!seen.has(id)) {
      merged.push(id);
    }
  }
  while (cursor < nextRegistered.length) merged.push(nextRegistered[cursor++]);

  return { ...layout, order: merged };
}

export function moveRailSectionInLayout(
  layout: RailLayoutState,
  descriptors: readonly RailSectionDescriptor[],
  id: RailSectionId,
  direction: "up" | "down",
): RailLayoutState {
  const ids = resolveRailSections(layout, descriptors).map((s) => s.id);
  const index = ids.indexOf(id);
  if (index === -1) return layout;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ids.length) return layout;
  const swapped = [...ids];
  [swapped[index], swapped[target]] = [swapped[target], swapped[index]];
  return reorderRailLayout(layout, descriptors, swapped);
}

export function setRailSectionVisibleInLayout(
  layout: RailLayoutState,
  descriptors: readonly RailSectionDescriptor[],
  id: RailSectionId,
  visible: boolean,
): RailLayoutState {
  const descriptor = descriptors.find((d) => d.id === id);
  if (!descriptor) return layout;
  if (descriptor.hideable === false && !visible) return layout;
  return {
    ...layout,
    visible: { ...layout.visible, [id]: visible },
  };
}

export function setRailSectionCollapsedInLayout(
  layout: RailLayoutState,
  descriptors: readonly RailSectionDescriptor[],
  id: RailSectionId,
  collapsed: boolean,
): RailLayoutState {
  if (!descriptors.some((d) => d.id === id)) return layout;
  return {
    ...layout,
    collapsed: { ...layout.collapsed, [id]: collapsed },
  };
}

/** Indica si el orden o la visibilidad actuales difieren del arreglo por omisión. */
export function isRailLayoutCustomized(
  layout: RailLayoutState,
  descriptors: readonly RailSectionDescriptor[],
): boolean {
  const defaults = resolveRailSections(DEFAULT_RAIL_LAYOUT, descriptors);
  const current = resolveRailSections(layout, descriptors);
  if (defaults.length !== current.length) return true;
  return current.some(
    (section, index) =>
      section.id !== defaults[index]?.id || section.visible !== defaults[index]?.visible,
  );
}

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
