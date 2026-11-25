import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemo, createRoot } from "solid-js";
import "../helpers/catalog.ts";
import {
  CORE_RAIL_SECTION_IDS,
  DEFAULT_RAIL_LAYOUT,
  isRailLayoutCustomized,
  loadRailLayout,
  moveRailSection,
  moveRailSectionInLayout,
  registerRailSection,
  registeredRailSections,
  reorderRailLayout,
  resetRailLayout,
  resolveRailSections,
  resolvedRailSections,
  sanitizeRailLayout,
  saveRailLayout,
  setRailLayout,
  setRailSectionCollapsedInLayout,
  setRailSectionVisibleInLayout,
  toggleRailSectionCollapsed,
  toggleRailSectionVisible,
  type RailSectionDescriptor,
} from "../../../../packages/shell/src/shell/rail-layout.ts";

const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  },
});

const section = (
  id: string,
  defaultOrder: number,
  extra: Partial<RailSectionDescriptor> = {},
): RailSectionDescriptor => ({
  id,
  label: () => id,
  defaultOrder,
  ...extra,
});

test("default resolution places agents before tasks, both visible and expanded", () => {
  const core = [section("tasks", 20), section("agents", 10)];
  const resolved = resolveRailSections(DEFAULT_RAIL_LAYOUT, core);
  assert.deepEqual(
    resolved.map((s) => ({
      id: s.id,
      visible: s.visible,
      collapsed: s.collapsed,
      up: s.canMoveUp,
      down: s.canMoveDown,
    })),
    [
      { id: "agents", visible: true, collapsed: false, up: false, down: true },
      { id: "tasks", visible: true, collapsed: false, up: true, down: false },
    ],
  );
  assert.equal(isRailLayoutCustomized(DEFAULT_RAIL_LAYOUT, core), false);
});

test("sanitizeRailLayout drops malformed entries and deduplicates order", () => {
  assert.deepEqual(sanitizeRailLayout(null), DEFAULT_RAIL_LAYOUT);
  assert.deepEqual(sanitizeRailLayout("broken"), DEFAULT_RAIL_LAYOUT);
  assert.deepEqual(sanitizeRailLayout([]), DEFAULT_RAIL_LAYOUT);
  assert.deepEqual(
    sanitizeRailLayout({
      order: ["tasks", "", 42, "tasks", "agents"],
      visible: { agents: false, bad: "yes", "": true },
      collapsed: { tasks: true, invalid: 1 },
    }),
    {
      order: ["tasks", "agents"],
      visible: { agents: false },
      collapsed: { tasks: true },
    },
  );
});

test("moving, hiding and collapsing update state cleanly and respect boundaries and hideable", () => {
  const descriptors = [
    section("agents", 10),
    section("tasks", 20, { hideable: false }),
    section("plugin:docs", 30),
  ];

  // Boundary no-ops
  assert.equal(moveRailSectionInLayout(DEFAULT_RAIL_LAYOUT, descriptors, "agents", "up"), DEFAULT_RAIL_LAYOUT);
  assert.equal(moveRailSectionInLayout(DEFAULT_RAIL_LAYOUT, descriptors, "plugin:docs", "down"), DEFAULT_RAIL_LAYOUT);

  // Move tasks up above agents
  let state = moveRailSectionInLayout(DEFAULT_RAIL_LAYOUT, descriptors, "tasks", "up");
  assert.deepEqual(resolveRailSections(state, descriptors).map((s) => s.id), ["tasks", "agents", "plugin:docs"]);
  assert.equal(isRailLayoutCustomized(state, descriptors), true);

  // Hide agents, attempt to hide non-hideable tasks
  state = setRailSectionVisibleInLayout(state, descriptors, "agents", false);
  state = setRailSectionVisibleInLayout(state, descriptors, "tasks", false);
  const resolved = resolveRailSections(state, descriptors);
  assert.equal(resolved.find((s) => s.id === "agents")?.visible, false);
  assert.equal(resolved.find((s) => s.id === "tasks")?.visible, true);

  // Collapse tasks
  state = setRailSectionCollapsedInLayout(state, descriptors, "tasks", true);
  assert.equal(resolveRailSections(state, descriptors).find((s) => s.id === "tasks")?.collapsed, true);
});

test("newly registered plugins are adopted automatically without losing user order or flags", () => {
  const initial = [section("agents", 10), section("tasks", 20)];
  let state = moveRailSectionInLayout(DEFAULT_RAIL_LAYOUT, initial, "tasks", "up");
  state = setRailSectionVisibleInLayout(state, initial, "agents", false);
  state = setRailSectionCollapsedInLayout(state, initial, "tasks", true);

  // Two future plugins register later with different defaultOrder and defaults
  const withPlugins = [
    ...initial,
    section("plugin:calendar", 40, { defaultCollapsed: true }),
    section("plugin:notes", 30, { defaultVisible: false }),
  ];
  const resolved = resolveRailSections(state, withPlugins);
  assert.deepEqual(
    resolved.map((s) => [s.id, s.visible, s.collapsed]),
    [
      ["tasks", true, true],
      ["agents", false, false],
      ["plugin:notes", false, false],
      ["plugin:calendar", true, true],
    ],
  );

  // Explicit override turns an opt-in plugin on and expands a default-collapsed plugin
  state = setRailSectionVisibleInLayout(state, withPlugins, "plugin:notes", true);
  state = setRailSectionCollapsedInLayout(state, withPlugins, "plugin:calendar", false);
  assert.deepEqual(
    resolveRailSections(state, withPlugins).map((s) => [s.id, s.visible, s.collapsed]),
    [
      ["tasks", true, true],
      ["agents", false, false],
      ["plugin:notes", true, false],
      ["plugin:calendar", true, false],
    ],
  );
});

test("lazy-loaded plugins keep their saved slot even when other sections are reordered before load", () => {
  const all = [section("agents", 10), section("plugin:inbox", 30), section("tasks", 20)];
  const saved = reorderRailLayout(DEFAULT_RAIL_LAYOUT, all, ["tasks", "plugin:inbox", "agents"]);

  // Next boot: plugin hasn't registered yet, only core sections exist
  const coreOnly = [section("agents", 10), section("tasks", 20)];
  assert.deepEqual(resolveRailSections(saved, coreOnly).map((s) => s.id), ["tasks", "agents"]);

  // User swaps tasks and agents while plugin is absent
  const reorderedWhileAbsent = moveRailSectionInLayout(saved, coreOnly, "agents", "up");
  assert.deepEqual(reorderedWhileAbsent.order, ["agents", "plugin:inbox", "tasks"]);

  // Plugin finishes loading and snaps back into its saved middle slot
  assert.deepEqual(
    resolveRailSections(reorderedWhileAbsent, all).map((s) => s.id),
    ["agents", "plugin:inbox", "tasks"],
  );
});

test("reactive registry and store persist changes and notify memos immediately", () => {
  store.clear();
  const key = "sidebar.rail.layout.test-reactive";
  saveRailLayout(DEFAULT_RAIL_LAYOUT, key);

  const disposePlugin = registerRailSection({
    id: "plugin:bookmarks",
    label: () => "Marcadores",
    defaultOrder: 30,
    source: "plugin",
  });
  // Core IDs cannot be hijacked by plugins
  const noop = registerRailSection({
    id: CORE_RAIL_SECTION_IDS.TASKS,
    label: () => "Hijacked",
    defaultOrder: 1,
  });

  try {
    const summary = createRoot(() =>
      createMemo(() =>
        resolvedRailSections(key).map((s) => `${s.id}:${s.visible ? "v" : "h"}:${s.collapsed ? "c" : "e"}`),
      ),
    );

    assert.deepEqual(summary(), ["agents:v:e", "tasks:v:e", "plugin:bookmarks:v:e"]);

    moveRailSection("plugin:bookmarks", "up", key);
    toggleRailSectionVisible("agents", key);
    toggleRailSectionCollapsed("tasks", key);

    assert.deepEqual(summary(), ["agents:h:e", "plugin:bookmarks:v:e", "tasks:v:c"]);

    // Persisted cleanly to localStorage
    const persisted = loadRailLayout(key);
    assert.deepEqual(persisted.order, ["agents", "plugin:bookmarks", "tasks"]);
    assert.equal(persisted.visible.agents, false);
    assert.equal(persisted.collapsed.tasks, true);

    // Corrupting storage falls back safely on fresh read
    store.set(`harness.layout.${key}`, "{not-json");
    assert.deepEqual(loadRailLayout(key), DEFAULT_RAIL_LAYOUT);

    // Reset restores defaults
    resetRailLayout(key);
    assert.deepEqual(summary(), ["agents:v:e", "tasks:v:e", "plugin:bookmarks:v:e"]);
  } finally {
    noop();
    disposePlugin();
    setRailLayout(DEFAULT_RAIL_LAYOUT, key);
  }

  assert.deepEqual(
    registeredRailSections().map((s) => s.id),
    [CORE_RAIL_SECTION_IDS.AGENTS, CORE_RAIL_SECTION_IDS.TASKS],
  );
});

test("button-kind rail plugins integrate with ordering and visibility in the organizer", () => {
  store.clear();
  const key = "sidebar.rail.layout.test-button-plugin";
  saveRailLayout(DEFAULT_RAIL_LAYOUT, key);

  let activated = 0;
  const dispose = registerRailSection({
    id: "plugin:messaging",
    label: () => "Mensajería",
    defaultOrder: 5,
    defaultVisible: true,
    hideable: true,
    source: "plugin",
    kind: "button",
    onActivate: () => { activated += 1; },
  });

  try {
    const initial = resolvedRailSections(key);
    assert.deepEqual(initial.map((s) => s.id), ["plugin:messaging", "agents", "tasks"]);
    assert.equal(initial[0]?.descriptor.kind, "button");
    initial[0]?.descriptor.onActivate?.();
    assert.equal(activated, 1);

    moveRailSection("plugin:messaging", "down", key);
    toggleRailSectionVisible("plugin:messaging", key);
    const updated = resolvedRailSections(key);
    assert.deepEqual(updated.map((s) => s.id), ["agents", "plugin:messaging", "tasks"]);
    assert.equal(updated[1]?.visible, false);
  } finally {
    dispose();
    setRailLayout(DEFAULT_RAIL_LAYOUT, key);
  }
});
