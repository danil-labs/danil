import assert from "node:assert/strict";
import test from "node:test";
import { HostError } from "../src/lib/hosts.ts";
import { answerQuestion, loadDetail, loadTask, loadTurns } from "../src/lib/engine.ts";

function fakeHost(answers: (command: string, args: Record<string, any>) => unknown, power = "on") {
  const calls: { command: string; args: Record<string, any> }[] = [];
  const host = {
    label: "lab",
    power: () => power,
    call: async (command: string, _workspace: string | null, args: Record<string, any>) => {
      calls.push({ command, args });
      return { value: answers(command, args), cachedAt: null };
    },
  };
  return { host: host as never, calls };
}

const session = { id: "t", provider: "codex", model: "m", turns: [{ id: "a", role: "user", text: "hola" }], history: { version: 1, revision: "r", total: 1, start: 0, end: 1, limit: 50, has_more: false } };

test("abrir pide la cola con la misma forma que la web", async () => {
  const { host, calls } = fakeHost((command) => (command === "load_session" ? session : null));
  await loadTask(host, "w", "f", "t");
  assert.deepEqual(calls.find((call) => call.command === "load_session")?.args, { project: "f", id: "t", history_request: { version: 1, before: null, revision: null } });
});

test("apagada sin copia paginada y sin nada cargado cae a la copia entera", async () => {
  const { host, calls } = fakeHost((command, args) => (command === "load_session" && !args.history_request ? session : null), "off");
  assert.equal((await loadTask(host, "w", "f", "t")).session.id, "t");
  assert.equal(calls.filter((call) => call.command === "load_session").length, 2);
});

test("con una ventana cargada una copia entera no la pisa", async () => {
  const { host } = fakeHost((command, args) => (command === "load_session" && !args.history_request ? session : null), "off");
  await assert.rejects(loadTask(host, "w", "f", "t", true), HostError);
});

test("una página sin copia no se lee como el principio de la conversación", async () => {
  const { host } = fakeHost(() => null, "off");
  await assert.rejects(loadTurns(host, "w", "f", "t", 40), HostError);
});

test("el contenido de un turno cuya revisión cambió se lee tras comprobar el turno", async () => {
  const ref = { version: 1 as const, turn: 3, pointer: "/text", revision: "old", bytes: 12 };
  const { host } = fakeHost((_command, args) => {
    const request = args.history_request;
    if (request.kind === "detail") {
      if (request.revision !== "new") throw new Error("revision_changed");
      return { version: 1, revision: "new", offset: 0, next: 7, total: 7, done: true, text: '"hello"' };
    }
    return { turns: [{ id: "x", history_refs: [{ ...ref, revision: "new" }] }], history: { start: 3, end: 4, total: 4, limit: 50, has_more: true } };
  });
  assert.equal(await loadDetail(host, "w", "f", "t", ref, "x"), "hello");
  await assert.rejects(loadDetail(host, "w", "f", "t", ref, "other"));
});

test("una pregunta fuera de la cola no descarta la respuesta en silencio", async () => {
  const { host } = fakeHost((command) => (command === "load_session" ? session : command === "pending_requests" ? { questions: [], permissions: [] } : []));
  await assert.rejects(answerQuestion(host, "w", "f", "t", { request_id: null, turn: "lejos", questions: [{ id: "q", question: "?", options: [], multiple: false }] } as never, {}, {}), /question_unverified/);
});

test("un turno cuyo texto no cupo en la página sigue siendo un renglón", async () => {
  const { workRuns } = await import("../src/lib/steps.ts");
  const ref = { version: 1 as const, turn: 1, pointer: "/text", revision: "r", bytes: 9000 };
  const thread = workRuns([{ id: "u", role: "user", text: "hola" }, { id: "a", role: "agent", text: "", history_refs: [ref] }] as never, [], false);
  assert.ok(thread.lines.some((line) => line.kind === "message" && line.refs?.length === 1));
});
