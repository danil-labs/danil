/**
 * Los pasos de un turno en el chat del teléfono (`src/lib/steps.ts`): los avances,
 * las herramientas y la respuesta en su orden, como la ventana.
 *
 *   node --test apps/mobile/scripts/steps.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Turn } from "@terminus/protocol";
import { coalesced } from "../src/lib/engine.ts";
import { type LivePiece, type WorkLine, applyLive, bareCommand, elapsed, hitOf, lineMatches, linesOfLive, linesOfTurn, liveAfterRead, runClock, runningStep, savesLive, stepOf, workFocus, workRuns } from "../src/lib/steps.ts";

test("con el orden registrado: avance, pasos y la respuesta al final", () => {
  const turn: Turn = {
    id: "t1",
    role: "agent",
    text: "Listo, ya pasa.",
    tools: [
      { name: "Read", target: "/repo/src/a.ts" },
      { name: "Read", target: "/repo/src/b.ts" },
      { name: "Bash", target: '/bin/zsh -lc "cd /repo && npm test"', ok: false },
      { name: "Write", target: "/repo/.preguntas.json" },
    ],
    pieces: [{ text: "Miro el código." }, { tool: 0 }, { tool: 1 }, { tool: 2 }, { tool: 3 }, { text: "Listo, ya pasa." }],
  };
  const lines = linesOfTurn(turn, "t1", []);
  assert.deepEqual(
    lines.map((l) => l.kind),
    ["progress", "steps", "message"],
  );
  const steps = lines[1];
  assert.ok(steps.kind === "steps");
  assert.deepEqual(steps.rows.map((r) => [r.kind, r.steps.length]), [["read", 2], ["run", 1]], "las lecturas seguidas son una fila y la pregunta no es paso");
  assert.equal(steps.rows[1].steps[0].ok, false);
  assert.ok(lines[2].kind === "message" && lines[2].text === "Listo, ya pasa.");
});

test("sin orden registrado, los pasos van delante del texto; un `!` trae su salida", () => {
  const lines = linesOfTurn({ role: "agent", text: "Hecho", tools: [{ name: "Edit", target: "a.ts" }] }, "k", []);
  assert.deepEqual(lines.map((l) => l.kind), ["steps", "message"]);
  const shell = linesOfTurn({ role: "user", text: "ls", shell: { cwd: "/", output: "a\nb", exit_code: 0, duration_ms: 3, truncated: false } }, "s", []);
  assert.deepEqual(shell, [{ key: "s", kind: "shell", command: "ls", output: "a\nb", exitCode: 0 }]);
  assert.equal(bareCommand('/bin/zsh -lc "cd \\"/a b\\" && git status"'), 'cd "/a b" && git status');
  assert.equal(bareCommand("cd /repo && git status"), "cd /repo && git status");
});

test("en vivo: los pasos corren y cierran, y el texto anterior queda como avance", () => {
  let live = applyLive([], { kind: "delta", text: "Voy " });
  live = applyLive(live, { kind: "delta", text: "a mirar." });
  live = applyLive(live, { kind: "tool", text: "Bash", target: "npm test" });
  assert.equal(linesOfLive(live).at(-1)?.kind, "steps");
  live = applyLive(live, { kind: "tool_done", text: "Bash", ok: true });
  live = applyLive(live, { kind: "delta", text: "Pasa.", starts_message: true });
  const lines = linesOfLive(live);
  assert.deepEqual(lines.map((l) => l.kind), ["progress", "steps", "message"]);
  assert.ok(lines[0].kind === "progress" && lines[0].text === "Voy a mirar.");
  assert.ok(lines[1].kind === "steps" && !lines[1].rows[0].steps[0].running && lines[1].rows[0].steps[0].ok === true);
  assert.equal(lines[2].key, "live");
});

test("el input de un encargado o de otra tarea lleva quién lo escribió; el de la persona, no", () => {
  const [mine] = linesOfTurn({ role: "user", text: "hola" }, "t0", []);
  assert.equal(mine.kind === "message" && mine.from, null);
  const [byAgent] = linesOfTurn({ role: "user", text: "revisa esto", agent: "Ada" }, "t1", []);
  assert.deepEqual(byAgent.kind === "message" && byAgent.from, { agent: "Ada", task: null, provider: null });
  const fromTask = { folder: "web", task: "t-9", title: "Arreglar el login", provider: "codex" };
  const [byTask] = linesOfTurn({ role: "user", text: "listo", from_task: fromTask }, "t2", []);
  assert.deepEqual(byTask.kind === "message" && byTask.from, { agent: null, task: "Arreglar el login", provider: "codex" });
});

test("releer con el turno corriendo no borra lo que se escribe en vivo; tras guardar un tramo queda solo lo nuevo", () => {
  const before = applyLive(applyLive([], { kind: "tool", text: "Read", target: "a.ts" }), { kind: "delta", text: "Ya lo" });
  // Durante la lectura siguió llegando texto y otra herramienta.
  const now = applyLive(applyLive(before, { kind: "delta", text: " vi." }), { kind: "tool", text: "Bash", target: "ls" });
  assert.equal(liveAfterRead(now, before, { running: true, resync: false }), now, "el foco o un aviso no tocan lo vivo");
  const rest = liveAfterRead(now, before, { running: true, resync: true });
  assert.deepEqual(rest.map((p) => ("text" in p ? p.text : p.step.name)), [" vi.", "Bash"], "lo guardado sale de lo vivo; lo que llegó después se queda");
  assert.deepEqual(liveAfterRead(before, before, { running: true, resync: true }), []);
  assert.deepEqual(liveAfterRead(now, before, { running: false, resync: false }), [], "el turno terminó: lo guardado lo trae todo");
  const empty: readonly LivePiece[] = [];
  assert.equal(liveAfterRead(empty, before, { running: false, resync: true }), empty);
});

test("las lecturas pedidas con una en marcha se juntan en una sola, que empieza después", async () => {
  const runs: boolean[] = [];
  let release: () => void = () => {};
  const read = coalesced(
    (resync: boolean) => {
      runs.push(resync);
      return new Promise<void>((resolve) => (release = resolve));
    },
    (a, b) => a || b,
  );
  const first = read(false);
  const second = read(false);
  const third = read(true);
  assert.deepEqual(runs, [false], "nunca dos a la vez");
  release();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(runs, [false, true], "las dos pedidas durante la primera, en una, con `resync` si alguna lo pidió");
  release();
  await Promise.all([first, second, third]);
  void read(false);
  assert.deepEqual(runs, [false, true, false], "terminada, la siguiente corre al momento");
  release();
});

const user = (id: string, at?: number): Turn => ({ id, role: "user", text: `pide ${id}`, at });
const agent = (id: string, tools: string[], text = "", extra: Partial<Turn> = {}): Turn => ({ id, role: "agent", text, tools: tools.map((target) => ({ name: "Bash", target })), pieces: [...tools.map((_, tool) => ({ tool })), ...(text ? [{ text }] : [])], ...extra });
const decision = (id: string, target: string, allow = true): Turn => ({ id, role: "user", text: "", permission: { tool: "Bash", target, allow } });
const works = (lines: readonly { kind: string }[]) => lines.filter((l): l is WorkLine => l.kind === "work");
const targets = (line: WorkLine) => line.steps.map((s) => s.target);
const rowIds = (turns: Turn[], live: LivePiece[] = [], running = false) => workRuns(turns, live, running).runs.at(-1)!.items.flatMap((i) => (i.kind === "row" ? [i.id] : []));

test("una ejecución cerrada es un grupo con sus avances adentro y la respuesta afuera", () => {
  const turn: Turn = { id: "a", role: "agent", text: "Listo", duration_ms: 3000, tools: [{ name: "Read", target: "a.ts" }, { name: "Bash", target: "ls" }], pieces: [{ tool: 0 }, { text: "Miro." }, { tool: 1 }, { text: "Listo" }] };
  const { lines, runs } = workRuns([user("u"), turn], [], false);
  assert.deepEqual(lines.map((l) => l.kind), ["message", "work", "message"]);
  const [group] = works(lines);
  assert.equal(group.run, "u");
  assert.equal(group.durationMs, 3000);
  assert.deepEqual(runs[0].items.map((i) => i.kind), ["row", "note", "row"]);
  assert.equal(runs[0].durationMs, 3000);
});

test("sin `duration_ms` en ningún tramo no hay duración que enseñar", () => {
  const { lines, runs } = workRuns([user("u"), agent("a", ["ls"], "Listo")], [], false);
  assert.equal(works(lines)[0].durationMs, null);
  assert.equal(runs[0].durationMs, null);
});

test("decisión a mitad de turno: no parte el grupo y la ejecución sigue siendo una", () => {
  const turns = [user("u"), agent("a", ["uno"]), decision("d", "rm -rf build"), agent("b", ["dos"], "Listo")];
  const { lines, runs } = workRuns(turns, [], false);
  assert.equal(runs.length, 1);
  assert.deepEqual(works(lines).flatMap(targets), ["uno", "rm -rf build", "dos"]);
  assert.equal(works(lines).length, 1, "un tramo sin respuesta sigue en el mismo grupo");
  assert.ok(lines.every((l) => l.kind !== "message" || l.text), "la decisión no deja un globo vacío");
  assert.deepEqual(runs[0].steps[1], { kind: "permission", name: "Bash", target: "rm -rf build", ok: null, running: false, allowed: true, by: null });
});

test("una decisión ya guardada entra al grupo de lo que sigue vivo", () => {
  const { lines, live } = workRuns([user("u"), decision("d", "rm")], [{ step: stepOf("Bash", "dos", null, true) }], true);
  assert.equal(works(lines).length, 0);
  const [group] = works(live);
  assert.deepEqual(targets(group), ["rm", "dos"]);
  assert.equal(group.live, true);
});

test("la respuesta a una pregunta y un `!` no abren ejecución", () => {
  const answer: Turn = { id: "r", role: "user", text: "Primera", answers: [{ turn: "q", question: "c" } as never] };
  const shell: Turn = { id: "s", role: "user", text: "ls", shell: { cwd: "/", output: "", exit_code: 0, duration_ms: 1, truncated: false } };
  const { runs } = workRuns([user("u"), agent("q", ["uno"], "¿Cuál?"), answer, shell, agent("b", ["dos"], "Listo")], [], false);
  assert.deepEqual(runs.map((r) => r.key), ["u"]);
  assert.deepEqual(runs[0].steps.map((s) => s.target), ["uno", "dos"]);
});

test("inyección: el mensaje abre otra ejecución y la anterior queda como pasado", () => {
  const before = workRuns([user("u"), agent("a", ["uno"])], [{ step: stepOf("Bash", "dos", null, true) }], true);
  assert.equal(before.runs.at(-1)?.live, true);
  const after = workRuns([user("u"), agent("a", ["uno", "dos"]), user("i")], [], true);
  assert.deepEqual(after.runs.map((r) => [r.key, r.live]), [["u", false], ["i", true]]);
  assert.deepEqual(after.runs[0].steps.map((s) => s.target), ["uno", "dos"]);
});

test("lanzamiento insertado: los tramos entran antes del marcador y la clave no se mueve", () => {
  const launch: Turn = { id: "l", role: "system", text: "Lanzó una tarea", meta: "task_launched" };
  const first = workRuns([user("u"), launch], [{ step: stepOf("Bash", "uno", null, true) }], true);
  const saved = workRuns([user("u"), agent("a", ["uno"]), launch, agent("b", ["dos"])], [], false);
  assert.deepEqual([first.runs.length, saved.runs.length], [1, 1]);
  assert.equal(first.runs[0].key, saved.runs[0].key);
  assert.deepEqual(saved.runs[0].steps.map((s) => s.target), ["uno", "dos"]);
  assert.deepEqual(saved.lines.map((l) => l.kind), ["message", "work", "message", "work"]);
});

test("tramo de pregunta: lo guardado no se ve dos veces porque `question` relee con `resync`", () => {
  assert.equal(savesLive("question"), true);
  assert.equal(savesLive("session"), false);
  assert.equal(savesLive("chat", "segment_saved"), true);
  assert.equal(savesLive("chat", "permission"), false);
  const live: LivePiece[] = [{ step: stepOf("Bash", "uno") }];
  const saved = [user("u"), agent("q", ["uno"], "¿Cuál?", { questions: [{ id: "c", question: "¿Cuál?", options: [], multiple: false, free_text: true }] })];
  const stale = workRuns(saved, liveAfterRead(live, live, { running: true, resync: false }), true);
  assert.equal(stale.runs[0].steps.length, 2, "el defecto: lo guardado sigue además en vivo");
  const fixed = workRuns(saved, liveAfterRead(live, live, { running: true, resync: savesLive("question") }), true);
  assert.deepEqual(fixed.runs[0].steps.map((s) => s.target), ["uno"]);
  assert.deepEqual(fixed.lines.map((l) => l.kind), ["message", "work", "message"]);
});

test("de viva a guardada: la clave, los pasos y lo expandido se conservan", () => {
  const anchor = user("u");
  const running = workRuns([anchor], [{ step: stepOf("Bash", "uno") }, { text: "Sigo" }, { step: stepOf("Bash", "dos", null, true) }], true);
  const segment = workRuns([anchor, agent("a", ["uno"]), decision("d", "rm")], [{ step: stepOf("Bash", "dos", null, true) }], true);
  const saved = workRuns([anchor, agent("a", ["uno"]), decision("d", "rm"), agent("b", ["dos"], "Listo")], [], false);
  assert.deepEqual([running, segment, saved].map((t) => t.runs[0].key), ["u", "u", "u"]);
  const idOf = (thread: typeof saved, target: string) => thread.runs[0].items.find((i) => i.kind === "row" && i.row.steps[0].target === target)?.id;
  assert.equal(idOf(running, "dos"), idOf(saved, "dos"), "la decisión se movió y la fila sigue siendo la misma");
  assert.equal(idOf(segment, "uno"), idOf(saved, "uno"));
  assert.equal(saved.runs[0].live, false);
});

test("lo expandido distingue el mismo comando por su aparición", () => {
  const ids = rowIds([user("u"), agent("a", ["ls", "ls"], "Listo")]);
  assert.equal(new Set(ids).size, 2);
});

test("en curso cada tramo es un grupo y el avance sigue a la vista; al cerrar se juntan", () => {
  const live: LivePiece[] = [{ step: stepOf("Bash", "uno") }, { text: "Sigo" }, { step: stepOf("Bash", "dos", null, true) }];
  const thread = workRuns([user("u")], live, true);
  assert.deepEqual(thread.live.map((l) => l.kind), ["work", "progress", "work"]);
  assert.deepEqual(works(thread.live).map((l) => l.live), [false, true]);
  assert.equal(runningStep(thread.runs[0])?.target, "dos");
});

test("un fallo sin texto sigue en el hilo; la línea del cupo retira el que ya resolvió", () => {
  const fallo = { clase: "sin_cupo", detail: "429" };
  const stopped = workRuns([user("u"), { id: "f", role: "system", text: "", meta: "fallo", fallo }], [], false);
  const last = stopped.lines.at(-1);
  assert.ok(last?.kind === "message" && last.fallo?.clase === "sin_cupo" && last.meta === "fallo");
  const continued = workRuns(
    [user("u"), { id: "f", role: "system", text: "", meta: "fallo", fallo }, { id: "q", role: "system", text: "", meta: "cupo", quota: { from: "a", to: "b" } }],
    [],
    false,
  );
  const messages = continued.lines.filter((line) => line.kind === "message");
  assert.deepEqual(messages.map((line) => (line.kind === "message" ? line.meta : null)), [undefined, "cupo"]);
});

test("una respuesta intermedia queda en el chat y en la hoja; la última, solo en el chat", () => {
  const { lines, runs } = workRuns([user("u"), agent("a", ["uno"], "Primera"), agent("b", ["dos"], "Segunda")], [], false);
  assert.deepEqual(lines.map((l) => l.kind), ["message", "work", "message", "work", "message"]);
  assert.deepEqual(runs[0].items.map((i) => (i.kind === "note" ? i.text : "fila")), ["fila", "Primera", "fila"]);
});

test("la derivación no recalcula las ejecuciones pasadas con cada pedazo vivo", () => {
  const turns = [user("u"), agent("a", ["uno"], "Listo"), user("v")];
  const one = workRuns(turns, [{ text: "ho" }], true);
  const two = workRuns(turns, [{ text: "hola" }], true);
  assert.equal(one.runs[0], two.runs[0]);
  assert.equal(one.lines[1], two.lines[1]);
});

test("sesión vieja sin ids: la clave es el índice del turno que abrió", () => {
  const { runs } = workRuns([{ role: "user", text: "uno" }, { role: "agent", text: "dos" }, { role: "user", text: "tres" }], [], false);
  assert.deepEqual(runs.map((r) => r.key), ["0", "2"]);
});

test("buscar encuentra comandos y avances dentro del grupo", () => {
  const turn: Turn = { id: "a", role: "agent", text: "Listo", tools: [{ name: "Bash", target: "pnpm verify\nsegunda" }], pieces: [{ text: "Miro el catálogo." }, { tool: 0 }, { text: "Listo" }] };
  const [group] = works(workRuns([user("u"), turn], [], false).lines);
  assert.equal(lineMatches(group, "verify"), true);
  assert.equal(lineMatches(group, "catálogo"), true);
  assert.equal(lineMatches(group, "nada"), false);
  assert.equal(hitOf(group, "verify")?.at, 0);
});

test("el reloj es `started_at` acotado por el mensaje que abrió, y sin dato no hay tiempo", () => {
  assert.equal(runClock(1000, 400), 1000);
  assert.equal(runClock(1000, 2000), 2000, "un mensaje inyectado reinicia");
  assert.equal(runClock(null, 2000), null);
  assert.equal(runClock(1000, null), 1000);
  assert.equal(elapsed(5000, 1000), 0, "el reloj del teléfono puede ir atrás del de la máquina");
});


test("Buscar distingue un avance del paso siguiente aunque comparten at", () => {
  const turn: Turn = {
    id: "a", role: "agent", text: "Listo",
    tools: [{ name: "Read", target: "antes.ts" }, { name: "Bash", target: "echo paso-profundo" }],
    pieces: [{ tool: 0 }, { text: "Nota avanceprofundo para hallar." }, { tool: 1 }, { text: "Listo" }],
  };
  const { lines, runs } = workRuns([user("u"), turn], [], false);
  const items = runs[0].items;
  const group = works(lines)[0];
  const noteHit = hitOf(group, "avanceprofundo")!;
  const stepHit = hitOf(group, "paso-profundo")!;
  assert.equal(noteHit.at, 1);
  assert.equal(stepHit.at, noteHit.at);
  const note = workFocus(items, noteHit.at, "avanceprofundo");
  assert.equal(note?.kind, "note");
  assert.equal(note?.id, "note\n0");
  const step = workFocus(items, stepHit.at, "paso-profundo");
  assert.equal(step?.kind, "row");
  assert.notEqual(step?.id, note?.id);
  assert.equal(workFocus(items, 1, "")?.id, step?.id, "abrir sin Buscar conserva el ancla del paso");
  assert.equal(workFocus(items, 1, "ya no existe")?.id, step?.id, "una coincidencia retirada conserva el respaldo por paso");
});


test("Buscar conserva la fila agrupada y sus claves al apuntar a un paso interior", () => {
  const turn: Turn = { id: "a", role: "agent", text: "Listo", tools: [
    { name: "Read", target: "uno.ts" }, { name: "Read", target: "dos.ts" }, { name: "Read", target: "tres.ts" },
  ] };
  const { runs } = workRuns([user("u"), turn], [], false);
  const items = runs[0].items;
  assert.equal(items.length, 1);
  const first = workFocus(items, 0, "uno.ts");
  const inner = workFocus(items, 2, "TRES.TS");
  assert.equal(inner?.kind, "row");
  assert.equal(inner?.id, first?.id);
  assert.ok(inner?.kind === "row" && inner.row.steps.length === 3);
});


test("Buscar elige la nota coincidente entre varias que comparten at", () => {
  const turn: Turn = {
    id: "a", role: "agent", text: "Listo",
    tools: [{ name: "Read", target: "antes.ts" }, { name: "Bash", target: "echo compartido" }],
    pieces: [{ tool: 0 }, { text: "Primera nota." }, { text: "Segunda compartido." }, { tool: 1 }, { text: "Listo" }],
  };
  const { runs, lines } = workRuns([user("u"), turn], [], false);
  const notes = runs[0].items.filter(item => item.kind === "note");
  assert.equal(notes.length, 2);
  assert.equal(notes[0].at, notes[1].at);
  const hit = hitOf(works(lines)[0], "compartido")!;
  assert.equal(hit.text, "Segunda compartido.", "la nota precede al paso que también coincide");
  assert.equal(workFocus(runs[0].items, hit.at, "compartido")?.id, notes[1].id);
  assert.equal(workFocus(runs[0].items, hit.at, "echo")?.kind, "row", "si solo coincide el paso, conserva su fila");
});


test("el razonamiento del turno es una fila plegada encima de la respuesta", () => {
  const turn: Turn = {
    id: "a", role: "agent", text: "Listo",
    tools: [{ name: "Read", target: "a.ts" }],
    pieces: [{ tool: 0 }, { text: "Listo" }],
    reasoning: [{ text: "Miro el archivo.", duration_ms: 1200 }, { text: "Ya sé qué cambiar.", duration_ms: 800 }],
  };
  const lines = linesOfTurn(turn, "a", []);
  assert.deepEqual(lines.map((l) => l.kind), ["steps", "reasoning", "message"], "una sola fila por turno, encima del texto");
  const row = lines[1];
  assert.ok(row.kind === "reasoning");
  assert.equal(row.key, "a:reasoning");
  assert.equal(row.text, "Miro el archivo.\n\nYa sé qué cambiar.");
  assert.equal(row.durationMs, 2000, "la duración es la suma de los bloques");
  assert.equal(row.live, false);
});

test("sin razonamiento no hay fila; un turno viejo o en blanco se pinta igual", () => {
  const plain = linesOfTurn({ id: "a", role: "agent", text: "Listo" }, "a", []);
  assert.deepEqual(plain.map((l) => l.kind), ["message"]);
  const empty = linesOfTurn({ id: "b", role: "agent", text: "Listo", reasoning: [] }, "b", []);
  assert.deepEqual(empty.map((l) => l.kind), ["message"]);
  const blank = linesOfTurn({ id: "c", role: "agent", text: "Listo", reasoning: [{ text: "  \n " }] }, "c", []);
  assert.deepEqual(blank.map((l) => l.kind), ["message"], "un bloque en blanco no deja fila");
});

test("sin `duration_ms` el razonamiento no inventa duración", () => {
  const [row] = linesOfTurn({ id: "a", role: "agent", text: "", reasoning: [{ text: "Pienso." }] }, "a", []);
  assert.ok(row.kind === "reasoning");
  assert.equal(row.durationMs, null);
});

test("mientras el turno corre el razonamiento se marca en vivo; al cerrar, no", () => {
  const turn: Turn = { id: "a", role: "agent", text: "Listo", reasoning: [{ text: "Pienso." }] };
  const open = workRuns([user("u"), turn], [], true).lines.find((l) => l.kind === "reasoning");
  assert.ok(open?.kind === "reasoning" && open.live, "el turno sigue y el resumen dice que está pensando");
  const closed = workRuns([user("u"), turn], [], false).lines.find((l) => l.kind === "reasoning");
  assert.ok(closed?.kind === "reasoning" && !closed.live);
});

test("dos lecturas con el mismo razonamiento dejan la misma fila; si cambia, la fila cambia", () => {
  const turns: Turn[] = [user("u"), { id: "a", role: "agent", text: "Listo", reasoning: [{ text: "Pienso.", duration_ms: 500 }] }, user("v")];
  const one = workRuns(turns, [], false).lines.find((l) => l.kind === "reasoning");
  const two = workRuns(turns, [], false).lines.find((l) => l.kind === "reasoning");
  assert.ok(one && two);
  assert.equal(JSON.stringify(one), JSON.stringify(two), "la misma lectura reutiliza la fila (`sameLine`)");
  const changed: Turn[] = [user("u"), { ...turns[1], reasoning: [{ text: "Pienso otra cosa.", duration_ms: 500 }] }, user("v")];
  const three = workRuns(changed, [], false).lines.find((l) => l.kind === "reasoning");
  assert.notEqual(JSON.stringify(one), JSON.stringify(three), "si el razonamiento cambia, la fila se actualiza al releer");
});

test("el razonamiento no entra en Buscar ni en los conteos del turno", () => {
  const turn: Turn = { id: "a", role: "agent", text: "Listo", tools: [{ name: "Read", target: "a.ts" }], reasoning: [{ text: "Una pista secreta.", duration_ms: 10 }] };
  const { lines, runs } = workRuns([user("u"), turn], [], false);
  const row = lines.find((l) => l.kind === "reasoning");
  assert.ok(row);
  assert.equal(lineMatches(row, "secreta"), false);
  assert.equal(runs[0].steps.length, 1, "no suma pasos");
  assert.deepEqual(runs[0].items.map((i) => i.kind), ["row"], "no entra en la hoja del turno");
  assert.equal(works(lines).length, 1);
});

test("el razonamiento en vivo se ignora: llega al releer tras `done`", () => {
  const live: LivePiece[] = [{ text: "Sigo." }];
  assert.equal(applyLive(live, { kind: "reasoning", text: "Pienso." }), live, "el stream no lo concatena");
  assert.deepEqual(linesOfLive(live).map((l) => l.kind), ["message"]);
});
