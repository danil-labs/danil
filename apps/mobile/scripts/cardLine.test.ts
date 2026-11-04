/**
 * La línea 2 de la tarjeta del teléfono (`src/lib/cardLine.ts`) y qué git pide
 * (`src/lib/taskGit.ts`).
 *
 *   node --test apps/mobile/scripts/cardLine.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { cardPull, type TaskGit, taskCard } from "@terminus/tasks";
import { secondLine } from "../src/lib/cardLine.ts";
import { effectiveGit, gitBookKey, gitAsks, gitAsksKey, staleGit, withGitAnswer } from "../src/lib/taskGit.ts";

const scope = { host: "vm", workspace: "w", folder: "p" };
const row = { id: "t1", title: "Tarea", esperando: false, folder: "p1", agent: "Ada", provider: "claude", machine: "vm", machine_on: true, last_message: "¿Sigo?" };
const card = (extra: Record<string, unknown> = {}) => taskCard({ ...row, ...extra }, { live: [], approving: [] });
const git = (extra: Partial<TaskGit> = {}, checks?: "failure"): TaskGit => ({
  head: "abc",
  shared_with: null,
  pull: { number: 7, state: "open", head_sha: "abc", checks },
  pull_known: true,
  stale: false,
  ...extra,
});

test("proveedor · carpeta · máquina · PR, en ese orden", () => {
  assert.deepEqual(secondLine(card(), cardPull(git())), ["provider", "folder", "machine", "pull"]);
});

test("el slot del proveedor permanece incluso ante datos antiguos sin marca", () => {
  assert.deepEqual(secondLine(card({ provider: null }), null), ["provider", "folder", "machine"]);
  assert.deepEqual(secondLine(card({ provider: "desconocido" }), null), ["provider", "folder", "machine"]);
  assert.equal(secondLine(card({ provider: "antigravity" }), null)[0], "provider");
  assert.equal(secondLine(card({ provider: "opencode-zen" }), null)[0], "provider");
});

test("si te necesita conserva metadatos, sin mostrar el último mensaje", () => {
  assert.deepEqual(secondLine(card({ esperando: true }), cardPull(git())), ["provider", "folder", "machine", "pull"]);
});

test("si falló, la línea normal: no el último mensaje", () => {
  assert.deepEqual(secondLine(card({ outcome: "failed" }), null), ["provider", "folder", "machine"]);
});

test("PR con checks fallidos: número en rojo; con git viejo, gris", () => {
  const failing = cardPull(git({}, "failure"));
  assert.equal(failing?.numberTone, "failure");
  assert.deepEqual(secondLine(card(), failing).at(-1), "pull");
  const stale = cardPull(git({ stale: true }, "failure"));
  assert.equal(stale?.numberTone, "muted");
  assert.equal(stale?.tone, "muted");
});

test("git: una llamada por máquina, workspace y carpeta con sus tareas visibles", () => {
  const asks = gitAsks([
    { host: "mac", workspace: "w", folder: "p1", id: "a" },
    { host: "mac", workspace: "w", folder: "p1", id: "b" },
    { host: "vm", workspace: "w2", folder: "p1", id: "c" },
    { host: "mac", workspace: "w", folder: "", id: "d" },
    { host: "mac", workspace: "w", folder: "p1", id: "a" },
  ]);
  assert.deepEqual(asks, [
    { host: "mac", workspace: "w", project: "p1", priority: ["a", "b"] },
    { host: "vm", workspace: "w2", project: "p1", priority: ["c"] },
  ]);
  assert.equal(gitAsksKey(asks), gitAsksKey([...asks].reverse()));
});

test("git leído: por máquina, workspace, carpeta e id; lo que no se pudo releer queda viejo, no se borra", () => {
  const one = withGitAnswer({}, scope, { a: git(), junk: 3 });
  assert.deepEqual(Object.keys(one), [gitBookKey(scope, "a")]);
  assert.equal(withGitAnswer(one, scope, { a: git() }), one, "lo mismo no cambia el libro");
  const unknown = withGitAnswer(one, scope, { a: { ...git(), kind: "unknown", pull: null } });
  assert.equal(unknown[gitBookKey(scope, "a")].stale, true);
  assert.equal(unknown[gitBookKey(scope, "a")].pull?.number, 7);
  const off = staleGit(one, scope, ["a", "zz"]);
  assert.equal(off[gitBookKey(scope, "a")].stale, true);
  assert.equal(cardPull(off[gitBookKey(scope, "a")])?.tone, "muted");
  assert.equal(staleGit(off, scope, ["a"]), off);
});

test("una rama compartida se resuelve dentro de la máquina y workspace elegidos", () => {
  const child = { host: "mac", workspace: "w", folder: "p", id: "child", parent: "parent", subagent: "a" };
  const parent = { host: "mac", workspace: "w", folder: "p", id: "parent" };
  const own = git({ shared_with: "parent", pull: null });
  const merged = git({ pull: { number: 8, state: "merged", head_sha: "abc" } });
  const book = withGitAnswer({}, { ...scope, host: "mac" }, { child: own, parent: merged });
  assert.equal(effectiveGit(book, child, [child, parent]).pull?.state, "merged");
  assert.equal(effectiveGit(book, child, [child, { ...parent, host: "vm" }]).pull, null);
  assert.equal(effectiveGit(book, child, [child, { ...parent, workspace: "other" }]).pull, null);
  assert.equal(effectiveGit(book, child, [child, { ...parent, folder: "other" }]).pull, null);
  assert.equal(effectiveGit({}, child, [child]).stale, true);
});

test("work grouping and repeated view toggles preserve the Git request identity", async () => {
  const { applySidebarView, DEFAULT_SIDEBAR_VIEW, workStateOf } = await import("@terminus/tasks");
  const candidates = [
    { id: "a", host: "mac", workspace: "w", folder: "p", esperando: false },
    { id: "b", host: "mac", workspace: "w", folder: "p", esperando: false },
  ];
  let book = withGitAnswer({}, { host: "mac", workspace: "w", folder: "p" }, {
    a: git({ kind: "branch", pull: { number: 1, state: "open", head_sha: "abc" } }),
    b: git({ kind: "kn", kn: "draft" }),
  });
  const key = gitAsksKey(gitAsks(candidates));
  for (const group of ["folder", "status", "none", "machine", "status"] as const) {
    const groups = applySidebarView(candidates, { ...DEFAULT_SIDEBAR_VIEW, group }, {
      live: [], approving: [], workStateOf: task => workStateOf(effectiveGit(book, task, candidates)),
    });
    assert.equal(gitAsksKey(gitAsks(groups.flatMap(group => group.tasks))), key);
    assert.equal(gitAsksKey(gitAsks(candidates)), key);
    book = withGitAnswer(book, { host: "mac", workspace: "w", folder: "p" }, { a: git({ kind: "kn", kn: "saved" }) });
  }
});

test("Git observations from another workspace or folder cannot overwrite the same task id", () => {
  const a = { host: "mac", workspace: "w", folder: "p", id: "a" };
  const other = { ...a, workspace: "other" };
  const third = { ...a, folder: "other" };
  let book = withGitAnswer({}, a, { a: git({ kind: "kn", kn: "saved" }) });
  book = withGitAnswer(book, other, { a: git({ kind: "kn", kn: "draft" }) });
  book = withGitAnswer(book, third, { a: git({ kind: "branch" }) });
  assert.equal(effectiveGit(book, a, [a, other, third]).kn, "saved");
  assert.equal(effectiveGit(book, other, [a, other, third]).kn, "draft");
  assert.equal(effectiveGit(book, third, [a, other, third]).kind, "branch");
  book = staleGit(book, other, ["a"]);
  assert.equal(effectiveGit(book, other, [other]).stale, true);
  assert.equal(effectiveGit(book, a, [a]).stale, false);
});
