import assert from "node:assert/strict";
import test from "node:test";

import { activeTrigger, applySuggestion } from "../../src/lib/mentions.ts";
import {
  type CliCommand,
  cliCommands,
  matchingSkills,
  type Skill,
  slashPick,
  slashRows,
  slashSuggestions,
} from "../../src/lib/skills.ts";

// Escribir un comando y mandarlo tiene que mandar ese comando. Los nombres y
// las descripciones son los reales que produjeron la sustitución silenciosa.

const skills: Skill[] = [
  {
    name: "mcp-builder",
    description:
      "Guide for creating high-quality MCP (Model Context Protocol) servers.",
  },
  { name: "statusline-setup", description: "Configure the status line setting." },
  { name: "code-review", description: "Review the current diff." },
];

const names = (rows: { name: string }[]) => rows.map((r) => r.name);

test("una skill se propone por su nombre y nunca por su descripción", () => {
  assert.deepEqual(matchingSkills(skills, "model"), []);
  assert.deepEqual(matchingSkills(skills, "context"), []);
  assert.deepEqual(matchingSkills(skills, "protocol"), []);
});

// `/status` casa con `statusline-setup` por el nombre: el filtro solo no
// alcanza, y quien impide escribir la skill en lugar del comando es el orden.
test("el comando exacto del CLI encabeza a la skill que solo lo contiene", () => {
  const d = activeTrigger("/status", "/status".length);
  assert.equal(d?.kind, "/");
  assert.equal(matchingSkills(skills, d?.query ?? "").length, 1);
  const grupos = slashSuggestions(skills, [{ name: "status", description: null }], d?.query ?? "");
  const filas = slashRows(grupos);
  assert.equal(filas[slashPick(grupos, d?.query ?? "")].name, "status");
  assert.equal(applySuggestion("/status", d!, filas[0].name).text, "/status ");
});

// Claude lista sus skills proyectadas dentro de sus propios comandos: sin
// quitarlas, media lista sale dos veces y la segunda sin descripción.
test("un comando del CLI que ya es skill no se repite", () => {
  const delCli: CliCommand[] = [
    { name: "mcp-builder", description: null },
    { name: "context", description: null },
    { name: "MODEL", description: "cambia el modelo" },
  ];
  assert.deepEqual(
    cliCommands(skills, delCli).map((c) => c.name),
    ["context", "MODEL"],
  );
});

test("la barra da el grupo del agente y después el de skills, cada uno por exacto, prefijo y contiene", () => {
  const withArt: Skill[] = [{ name: "algorithmic-art", description: "" }, { name: "gobierno-x", description: "" }];
  const fromCli: CliCommand[] = [
    { name: "logout", description: null },
    { name: "goal", description: "fija una meta" },
    { name: "gobierno-x", description: null },
  ];
  const grupos = slashSuggestions(withArt, fromCli, "go");
  assert.deepEqual(grupos.map((g) => g.kind), ["agent", "skills"]);
  assert.deepEqual(names(grupos[0].rows), ["goal", "logout"]);
  assert.deepEqual(names(grupos[1].rows), ["gobierno-x", "algorithmic-art"]);
  assert.equal(grupos[0].rows[0].description, "fija una meta");
});

test("un grupo sin filas no aparece", () => {
  const soloSkills = slashSuggestions(skills, [{ name: "context", description: null }], "review");
  assert.deepEqual(soloSkills.map((g) => g.kind), ["skills"]);
  const soloComandos = slashSuggestions(skills, [{ name: "context", description: null }], "cont");
  assert.deepEqual(soloComandos.map((g) => g.kind), ["agent"]);
  assert.deepEqual(slashSuggestions(skills, [], "zzz"), []);
  assert.deepEqual(slashSuggestions(skills, [], "").map((g) => g.kind), ["skills"]);
});

test("el resaltado recorre los dos grupos en el orden en que se ven", () => {
  const grupos = slashSuggestions(skills, [{ name: "cost", description: null }, { name: "context", description: null }], "co");
  assert.deepEqual(
    slashRows(grupos).map((r) => [r.kind, r.name]),
    [["agent", "cost"], ["agent", "context"], ["skills", "code-review"]],
  );
  assert.equal(slashPick(grupos, "co"), 0);
});

// El grupo del agente va primero aunque la skill sea la que se escribió entera:
// sin mover el resaltado, Tab cambiaría `/code-review` por el comando de arriba.
test("el resaltado empieza en el nombre exacto aunque esté en el segundo grupo", () => {
  const grupos = slashSuggestions(skills, [{ name: "code-review-all", description: null }], "code-review");
  const filas = slashRows(grupos);
  assert.deepEqual(names(filas), ["code-review-all", "code-review"]);
  assert.equal(filas[slashPick(grupos, "code-review")].name, "code-review");
});

// Task references must survive text edits without resolving their labels again.
import { editMentions, highlightSpans, insertReference, placeLabel, referenceId, searchPlaces, searchTasks, taskLabel, trimMentions, type PlaceCandidate, type TaskCandidate } from "../../src/lib/taskMentions.ts";

const task: TaskCandidate = {
  target: { kind: "task", projectId: "project", sessionId: "task" },
  title: "Login", projectName: "App", alias: "vega-260914", branch: "fix/login",
  available: true, archived: false, updatedAt: 10,
};

test("selecting a task preserves its ID and Unicode cursor offsets", () => {
  const before = "🦊 revisa @veg";
  const d = activeTrigger(before, before.length)!;
  const result = insertReference({ text: before }, d, task.target, taskLabel(task));
  assert.equal(result.text, "🦊 revisa @fix/login ");
  assert.deepEqual(result.task_mentions?.[0].target, task.target);
  const ref = result.task_mentions![0];
  assert.equal(result.text.slice(ref.start, ref.end), ref.text);
  const trimmed = trimMentions({ text: `  ${result.text}`, task_mentions: [{ ...ref, start: ref.start + 2, end: ref.end + 2 }] });
  assert.equal(trimmed.task_mentions?.[0].start, ref.start);
});

test("the composer highlights a known leading command and task mentions, and nothing else", () => {
  const commands = new Set(["goal", "code-review"]);
  const mention = { target: task.target, start: 11, end: 21, text: "@fix/login" };
  assert.deepEqual(highlightSpans("/goal mira @fix/login", [mention], commands).map(s => [s.text, s.kind]),
    [["/goal", "command"], [" mira ", null], ["@fix/login", "mention"], ["", null]]);
  assert.deepEqual(highlightSpans("/gol mira", [], commands).map(s => s.kind), [null]);
  assert.deepEqual(highlightSpans("mira /goal", [], commands).map(s => s.kind), [null]);
});

test("a task without worktree is written by its title without quotes or spaces, and typing after it keeps the mention", () => {
  const bare = { ...task, alias: "", branch: "", title: "Cómo lo resuelven" };
  const draft = insertReference({ text: "@" }, activeTrigger("@", 1)!, bare.target, taskLabel(bare));
  assert.equal(draft.text, "@Cómo-lo-resuelven ");
  const next = `${draft.text}checa la sesión`;
  assert.equal(activeTrigger(next, next.length), null);
  assert.equal(editMentions(draft, next).length, 1);
});

test("editing boundaries moves references but editing the label invalidates them", () => {
  const draft = insertReference({ text: "@L" }, activeTrigger("@L", 2)!, task.target, taskLabel(task));
  assert.equal(editMentions(draft, `Antes ${draft.text}`)[0].start, 6);
  assert.equal(editMentions(draft, "@fix/login y más")[0].end, 10);
  assert.deepEqual(editMentions(draft, "@Logout "), []);
  assert.deepEqual(editMentions(draft, `x${draft.text}`), []);
});

test("task search distinguishes duplicate names, alias, project and current session", () => {
  const other = { ...task, target: { ...task.target, projectId: "elsewhere", sessionId: "other" } };
  assert.deepEqual(searchTasks([other, task], "login", "project").map(t => t.target.sessionId), ["task", "other"]);
  assert.equal(searchTasks([task], "vega", "project")[0].target.sessionId, "task");
  assert.equal(searchTasks([task], "", "project", "task").length, 0);
  assert.notEqual(referenceId(task.target), referenceId(other.target));
});

test("task suggestions exclude archived sessions for empty and matching queries", () => {
  const archived = { ...task, archived: true, target: { ...task.target, sessionId: "archived" } };
  const withoutWorktree = { ...task, available: false };
  for (const query of ["", "login", "vega", "fix/login"]) {
    assert.deepEqual(searchTasks([archived, withoutWorktree], query, "project"), [withoutWorktree]);
  }
});

test("deleting the first of two equal labels preserves the second target", () => {
  const first = { target: task.target, start: 0, end: 6, text: "@Login" };
  const second = { ...first, target: { ...task.target, sessionId: "second" }, start: 7, end: 13 };
  const before = { text: "@Login @Login ", task_mentions: [first, second] };
  const refs = editMentions(before, "@Login ", { start: 0, end: 7 });
  assert.equal(refs.length, 1);
  assert.deepEqual(refs[0].target, second.target);
  assert.equal(refs[0].start, 0);
  assert.equal(editMentions(before, "@Login ").length, 0);
});

test("replacing a mention with identical plain text drops its association", () => {
  const before = { text: "@Login ", task_mentions: [{ target: task.target, start: 0, end: 6, text: "@Login" }] };
  assert.equal(editMentions(before, before.text, { start: 0, end: 6 }).length, 0);
});

test("project mentions are written as one token and keep their identity", () => {
  const folder: PlaceCandidate = { target: { kind: "folder", projectId: "scoring" }, name: "Revamp de scoring", detail: "", updatedAt: 2 };
  assert.equal(placeLabel(folder), "@Revamp-de-scoring");
  const draft = insertReference({ text: "revisa @rev" }, activeTrigger("revisa @rev", 11)!, folder.target, placeLabel(folder));
  assert.equal(draft.text, "revisa @Revamp-de-scoring ");
  assert.deepEqual(draft.task_mentions?.[0].target, folder.target);
  assert.notEqual(referenceId(folder.target), referenceId({ kind: "task", projectId: "", sessionId: "scoring" }));
  assert.deepEqual(searchPlaces([folder], "revamp-de").map(p => p.name), ["Revamp de scoring"]);
  assert.deepEqual(searchPlaces([folder], "").map(p => p.name), ["Revamp de scoring"]);
});

// La barra abre también en medio del texto, solo con skills, y nunca dentro de
// una mención, una URL o una ruta.
test("a slash after a space opens the skills menu and choosing keeps the rest of the text", () => {
  const text = "revisa esto con /code y dime";
  const d = activeTrigger(text, 21)!;
  assert.deepEqual([d.kind, d.from, d.to, d.query, d.inline], ["/", 16, 21, "code", true]);
  assert.equal(applySuggestion(text, d, "code-review").text, "revisa esto con /code-review y dime");
  assert.equal(activeTrigger("/sta", 4)?.inline, false);
});

test("a slash inside a mention, a URL or a word is not a trigger", () => {
  assert.equal(activeTrigger("mira @src/a/b", 13)?.kind, "@");
  assert.equal(activeTrigger("abre https://x/y", 16), null);
  assert.equal(activeTrigger("a/b", 3), null);
});

test("the composer paints a known skill in the middle of the text, but not a CLI command", () => {
  const commands = new Set(["goal", "code-review"]);
  const skills = new Set(["code-review"]);
  assert.deepEqual(highlightSpans("mira /code-review y /goal", [], commands, [], skills).map(s => [s.text, s.kind]),
    [["mira ", null], ["/code-review", "command"], [" y /goal", null]]);
  assert.deepEqual(highlightSpans("abre https://x/code-review", [], commands, [], skills).map(s => s.kind), [null]);
});
