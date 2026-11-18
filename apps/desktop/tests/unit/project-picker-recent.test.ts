import assert from "node:assert/strict";
import test from "node:test";
import { activeTaskCounts, activityByProject, byRecent, hiddenIn, pickerSections, picksIn, recentProjects, rememberPick, setHidden, storedPicks, taskCountOf } from "../../src/features/projects/recent.ts";
import { lastActivity } from "../../../../packages/tasks/src/view.ts";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 17);
const project = (id: string, name: string, created_at: number, updated_at = created_at) => ({ id, name, created_at, updated_at });
const ids = (rows: { id: string }[]) => rows.map((p) => p.id);

test("a project with recent tasks goes first; one without tasks falls back to its creation", () => {
  const rows = [project("old", "Old", NOW - 30 * DAY), project("busy", "Busy", NOW - 90 * DAY), project("new", "New", NOW - DAY)];
  assert.deepEqual(ids(byRecent(rows, { busy: NOW }, {})), ["busy", "new", "old"]);
});

test("updated_at of the project record does not count as activity", () => {
  const rows = [project("a", "A", NOW - 10 * DAY, NOW), project("b", "B", NOW - 5 * DAY, NOW - 5 * DAY)];
  assert.deepEqual(ids(byRecent(rows, {}, {})), ["b", "a"]);
});

test("the last pick counts like activity, and the maximum of the three dates wins", () => {
  const rows = [project("a", "A", NOW - 10 * DAY), project("b", "B", NOW - 20 * DAY), project("c", "C", NOW - 3 * DAY)];
  assert.deepEqual(ids(byRecent(rows, { a: NOW - 15 * DAY }, { b: NOW - DAY })), ["b", "c", "a"]);
});

test("ties are stable and deterministic: by name, then by id", () => {
  const rows = [project("z", "beta", NOW), project("y", "Alpha", NOW), project("x", "alpha", NOW), project("w", "Gamma", NOW)];
  assert.deepEqual(ids(byRecent(rows, {}, {})), ["x", "y", "z", "w"]);
  assert.deepEqual(ids(byRecent([...rows].reverse(), {}, {})), ["x", "y", "z", "w"]);
});

test("creation in seconds and activity in ms compare on the same scale", () => {
  const rows = [project("secs", "Secs", Math.floor((NOW - DAY) / 1000)), project("ms", "Ms", NOW - 2 * DAY)];
  assert.deepEqual(ids(byRecent(rows, {}, {})), ["secs", "ms"]);
});

test("without tasks or pref nothing fails and the newest come first", () => {
  const rows = [project("a", "A", NOW - 3 * DAY), project("b", "B", NOW - DAY), project("c", "C", 0)];
  const { visible, rest } = recentProjects(rows, {}, {}, "");
  assert.deepEqual(ids(visible), ["b", "a", "c"]);
  assert.deepEqual(rest, []);
});

test("with fewer than 8 projects there is no rest", () => {
  const rows = Array.from({ length: 5 }, (_, i) => project(`p${i}`, `P${i}`, NOW - i * DAY));
  const { visible, rest } = recentProjects(rows, {}, {}, "");
  assert.equal(visible.length, 5);
  assert.equal(rest.length, 0);
});

test("the current project stays visible even outside the cut", () => {
  const rows = Array.from({ length: 12 }, (_, i) => project(`p${i}`, `P${i}`, NOW - i * DAY));
  const { visible, rest } = recentProjects(rows, {}, {}, "p11");
  assert.deepEqual(ids(visible), ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p11"]);
  assert.deepEqual(ids(rest), ["p8", "p9", "p10"]);
  assert.equal(recentProjects(rows, {}, {}, "p2").visible.length, 8);
});

test("pref ids that no longer exist are ignored, and saving drops them", () => {
  const rows = [project("a", "A", NOW - 2 * DAY), project("b", "B", NOW - DAY)];
  assert.deepEqual(ids(recentProjects(rows, {}, { gone: NOW, a: NOW }, "gone").visible), ["a", "b"]);
  assert.deepEqual(rememberPick({ gone: NOW, a: NOW - DAY, b: Number.NaN }, "b", NOW, ["a", "b"]), { a: NOW - DAY, b: NOW });
  assert.deepEqual(rememberPick({ a: 1 }, "", NOW, ["a"]), { a: 1 });
});

test("activity per project is that of its latest live task", () => {
  const task = (last_turn_at: number | null, updated_at: number) => ({ id: String(updated_at), esperando: false, last_turn_at, updated_at, created_at: 0 });
  const activity = activityByProject({ "": [task(NOW, NOW)], a: [task(null, NOW - DAY), task(NOW - 2 * DAY, NOW)], b: [] }, lastActivity);
  assert.deepEqual(activity, { a: NOW - DAY });
});

test("31 projects with live tasks only in «Danil App»: it is among the 8 and 23 are folded", () => {
  const rows = Array.from({ length: 30 }, (_, i) => project(`old${i}`, `Old ${i}`, NOW - (400 - i) * DAY));
  rows.splice(17, 0, project("danil-app", "Danil App", NOW - 500 * DAY));
  const { visible, rest } = recentProjects(rows, { "danil-app": NOW }, {}, "");
  assert.equal(visible.length, 8);
  assert.equal(visible[0].id, "danil-app");
  assert.equal(rest.length, 23);
});

test("a hidden project leaves the 8 recent, the next one takes its place, and it goes after the rest", () => {
  const rows = Array.from({ length: 10 }, (_, i) => project(`p${i}`, `P${i}`, NOW - i * DAY));
  const { visible, rest, hidden } = pickerSections(rows, { p0: NOW }, {}, new Set(["p0", "p9"]), "");
  assert.deepEqual(ids(visible), ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"]);
  assert.deepEqual(ids(rest), []);
  assert.deepEqual(ids(hidden), ["p0", "p9"], "hidden, in recent order, at the end");
});

test("the current project is seen even if hidden, and it is not listed twice", () => {
  const rows = Array.from({ length: 12 }, (_, i) => project(`p${i}`, `P${i}`, NOW - i * DAY));
  const { visible, rest, hidden } = pickerSections(rows, {}, {}, new Set(["p11", "p0"]), "p11");
  assert.ok(ids(visible).includes("p11"));
  assert.ok(!ids(visible).includes("p0"));
  assert.deepEqual(ids(hidden), ["p0"]);
  assert.equal(visible.length + rest.length + hidden.length, 12);
});

test("a hidden id that no longer exists changes nothing, and saving drops it", () => {
  const rows = [project("a", "A", NOW - DAY), project("b", "B", NOW)];
  const { visible, hidden } = pickerSections(rows, {}, {}, new Set(["gone"]), "");
  assert.deepEqual(ids(visible), ["b", "a"]);
  assert.deepEqual(hidden, []);
  assert.deepEqual(setHidden({ w: ["gone", "a"] }, "w", "b", true, ["a", "b"]), { w: ["a", "b"] });
});

test("hiding in one workspace does not touch another with the same project id", () => {
  const saved = { other: ["p1"] };
  const next = setHidden(saved, "w", "p1", true, ["p1"]);
  assert.deepEqual(next, { other: ["p1"], w: ["p1"] });
  assert.deepEqual([...hiddenIn(next, "other")], ["p1"]);
  const shown = setHidden(next, "w", "p1", false, ["p1"]);
  assert.deepEqual(shown, { other: ["p1"] }, "showing removes the empty workspace entry and keeps the other");
  assert.deepEqual([...hiddenIn(shown, "w")], []);
  assert.deepEqual(saved, { other: ["p1"] }, "the saved value is not mutated");
});

test("a malformed or missing pref hides nothing", () => {
  assert.equal(hiddenIn(null, "w").size, 0);
  assert.equal(hiddenIn({ w: "p1" } as never, "w").size, 0);
  assert.deepEqual([...hiddenIn({ w: ["p1", 3, ""] } as never, "w")], ["p1"]);
  assert.equal(hiddenIn({ w: ["p1"] }, null).size, 0);
});

test("the task count is of active tasks only; a project without a read list has no number", () => {
  const row = (archived?: boolean | null) => ({ archived });
  const counts = activeTaskCounts({ "": [row()], a: [row(), row(false), row(null), row(true)], b: [row(true)], c: [] });
  assert.deepEqual(counts, { a: 3, b: 0, c: 0 });
  assert.equal("d" in counts, false, "unknown, not zero");
});

test("the picker row and Settings → Projects read the same active count: archived out, unknown is no number", () => {
  const counts = activeTaskCounts({ app: [{ archived: false }, { archived: true }, {}], archived: [{ archived: true }] });
  const engine = (id: string) => ({ id, sessions: 363 });
  assert.equal(taskCountOf(engine("app"), counts), 2, "the engine's 363 includes archived tasks");
  assert.equal(taskCountOf(engine("archived"), counts), 0);
  assert.equal(taskCountOf(engine("off-machine"), counts), null, "no list read: no number, not 0 nor 363");
  assert.equal(taskCountOf(engine("app"), undefined), 363, "without counts, the engine's number as before");
});

test("a stored pref of another shape counts as no picks and does not break the picker", () => {
  for (const stored of [null, 0, "x", [], [{ a: 1 }], { w: null }, { w: "x" }, { w: [1] }]) {
    assert.deepEqual(picksIn(stored, "w"), {});
  }
  assert.deepEqual(picksIn({ w: { a: 1 }, v: { a: 2 } }, "w"), { a: 1 });
  assert.deepEqual(picksIn({ w: { a: 1 } }, "v"), {});
  assert.deepEqual(storedPicks("abc"), {});
  assert.deepEqual(storedPicks({ w: { a: 1 } }), { w: { a: 1 } });
});
