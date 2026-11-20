/**
 * R0 de la tarjeta de pregunta (2026-11-20): la persona elige una respuesta,
 * la respuesta llega y la tarjeta sigue visible hasta «Omitir».
 *
 * Usa el store de hilos real (`createThreadsCore`), sin ventana. La tarjeta se
 * deriva igual que `Chat.tsx:1856-1874` (`preguntaPendiente`) y que
 * `App.tsx:1599-1610` (`preguntasPendientes`, de donde sale `esperando`). Los
 * dos derivados viven dentro de sus componentes: aquí van copiados sin
 * cambios, no extraídos, para no tocar código de producto.
 *
 * Invariante (B1): la fila que `appendPersisted` anexa tras el acuse sobrevive
 * a cualquier repintado o lectura hasta que la trae una lectura iniciada
 * después del acuse.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createRoot, createSignal } from "solid-js";
import type { ChatEvent, Msg, Session } from "../../src/features/chat/index.ts";
import type { Respuesta } from "../../src/features/chat/Questions.tsx";
import { createThreadsCore } from "../../src/features/threads/store-core.ts";


// Copia literal del derivado de `Chat.tsx:1856-1874`.
function preguntaPendiente(msgs: readonly Msg[]): Msg | undefined {
  const respondido = new Map<string, Respuesta[]>();
  for (const msg of msgs) for (const r of msg.respuestas ?? []) respondido.set(r.turn, [...(respondido.get(r.turn) ?? []), r]);
  return msgs.find((msg) => msg.turno && msg.preguntas?.some((pregunta) =>
    !respondido.get(msg.turno!)?.some((respuesta) => respuesta.question === pregunta.id)));
}
// Copia literal de `preguntasPendientes` en `App.tsx:1599-1610` (el `esperando` que frena la cola).
const clave = (turn: string, question: string) => `${turn}\u0000${question}`;
function esperando(messages: readonly Msg[]): boolean {
  const contestadas = new Set(messages.flatMap((m) => m.respuestas ?? []).map((r) => clave(r.turn, r.question)));
  return messages.some((m) => !!m.turno && (m.preguntas ?? []).some((p) => !contestadas.has(clave(m.turno!, p.id))));
}

const PREGUNTA = { id: "q", question: "¿Qué base de datos?", header: null, options: [{ value: "pg", label: "Postgres" }, { value: "sqlite", label: "SQLite" }], multiple: false, free_text: false };
const RESPUESTA: Respuesta = { turn: "a1", question: "q", question_text: PREGUNTA.question, chosen: ["pg"], text: "Postgres", source: "persona", when: 2 };
const T_USER = { id: "u1", role: "user", at: 0, text: "Arma la app" } as Session["turns"][number];
const T_PREGUNTA = { id: "a1", role: "agent", at: 1, text: "", questions: [PREGUNTA] } as Session["turns"][number];
const T_RESPUESTA = { id: "u2", role: "user", at: 2, text: "Postgres", answers: [RESPUESTA] } as Session["turns"][number];
/** La fila que `App.tsx:5404-5410` anexa con `appendPersisted` tras el acuse de `answer_question`. */
const filaDelAcuse = (): Msg => ({ role: "user", text: "Postgres", turno: "u2", respuestas: [RESPUESTA] });
const sesion = (turns: Session["turns"]): Session => ({ turns, provider: "claude" }) as Session;
const segmentSaved = (id: string) => ({ kind: "segment_saved", text: "", session: "s", meta: null, id }) as ChatEvent;
const delta = (text: string) => ({ kind: "delta", text, session: "s", meta: null }) as ChatEvent;

type Read = () => Promise<Session>;
function fixture() {
  const reads: Read[] = [];
  const calls: string[] = [];
  return createRoot((dispose) => {
    const [workspace] = createSignal<string | null>("A");
    const [active] = createSignal<string | null>("s");
    const store = createThreadsCore({
      scope: { workspace, generation: () => 1, paged: () => false },
      activeSession: active,
      project: () => "p",
      invoke: async <T>(command: string) => {
        calls.push(command);
        const next = reads.shift();
        if (!next) throw new Error(`sin lectura preparada para ${command}`);
        return (await next()) as T;
      },
      route: () => undefined,
      liveThreads: () => new Set(),
    });
    /** Prepara la siguiente lectura; devuelve con qué resolverla si es diferida. */
    const nextRead = (turns?: Session["turns"]) => {
      if (turns) { reads.push(async () => sesion(turns)); return null; }
      let resolve!: (s: Session) => void;
      reads.push(() => new Promise<Session>((yes) => { resolve = yes; }));
      return (s: Session) => resolve(s);
    };
    const open = async (turns: Session["turns"]) => {
      nextRead(turns);
      const read = await store.read("p", "s");
      assert.equal(store.acceptSession("s", read, false, 1), true);
    };
    return { store, calls, nextRead, open, dispose: () => { store.dispose(); dispose(); } };
  });
}

test("control: la historia con una pregunta sin contestar pinta la tarjeta y la cola espera", async () => {
  const f = fixture();
  await f.open([T_USER, T_PREGUNTA]);
  assert.equal(preguntaPendiente(f.store.messages())?.turno, "a1");
  assert.equal(esperando(f.store.messages()), true);
  f.dispose();
});

test("control: el acuse de answer_question (appendPersisted) quita la tarjeta en ese instante", async () => {
  const f = fixture();
  await f.open([T_USER, T_PREGUNTA]);
  f.store.appendPersisted("s", [filaDelAcuse()]);
  assert.equal(preguntaPendiente(f.store.messages()), undefined);
  assert.equal(esperando(f.store.messages()), false);
  f.dispose();
});

test("H1: un segment_saved tras el acuse repinta desde pager.loaded y la tarjeta no vuelve", async () => {
  const f = fixture();
  await f.open([T_USER, T_PREGUNTA]);
  f.store.appendPersisted("s", [filaDelAcuse()]);
  assert.equal(preguntaPendiente(f.store.messages()), undefined, "precondición: el acuse quitó la tarjeta");
  // El agente reanuda con la respuesta: escribe y el motor guarda ese tramo.
  f.store.event(delta("Perfecto, uso Postgres."), { author: null }); f.store.flush();
  f.store.event(segmentSaved("a2"), { author: null });
  assert.deepEqual(f.calls, ["load_session"], "el repintado no hizo una lectura nueva");
  const base = f.store.rows().s.base.map((m) => m.turno);
  assert.equal(preguntaPendiente(f.store.messages()), undefined, `la tarjeta reaparece; base tras el segment_saved = ${JSON.stringify(base)}`);
  assert.equal(esperando(f.store.messages()), false, "la cola de la ventana vuelve a esperar");
  f.dispose();
});

test("H1 (control del invariante): si pager.loaded trae la respuesta, el mismo segment_saved no la devuelve", async () => {
  const f = fixture();
  await f.open([T_USER, T_PREGUNTA, T_RESPUESTA]);
  f.store.event(delta("Perfecto, uso Postgres."), { author: null }); f.store.flush();
  f.store.event(segmentSaved("a2"), { author: null });
  assert.equal(preguntaPendiente(f.store.messages()), undefined);
  f.dispose();
});

test("H3: una lectura iniciada antes de la respuesta y asentada después no pisa la fila del acuse", async () => {
  const f = fixture();
  await f.open([T_USER, T_PREGUNTA]);
  const resolve = f.nextRead()!;
  const tardia = f.store.read("p", "s"); // revisión 2: empezó antes del acuse
  f.store.appendPersisted("s", [filaDelAcuse()]);
  assert.equal(preguntaPendiente(f.store.messages()), undefined, "precondición: el acuse quitó la tarjeta");
  resolve(sesion([T_USER, T_PREGUNTA])); // el disco que leyó todavía no traía la respuesta
  const aceptada = f.store.acceptSession("s", await tardia, false, 1);
  assert.equal(preguntaPendiente(f.store.messages()), undefined, `la tarjeta reaparece tras la lectura tardía (loadResult la aceptó: ${aceptada})`);
  f.dispose();
});

test("H3 (control): una lectura iniciada después de la respuesta la trae y la tarjeta no vuelve", async () => {
  const f = fixture();
  await f.open([T_USER, T_PREGUNTA]);
  f.store.appendPersisted("s", [filaDelAcuse()]);
  f.nextRead([T_USER, T_PREGUNTA, T_RESPUESTA]);
  assert.equal(f.store.acceptSession("s", await f.store.read("p", "s"), false, 1), true);
  assert.equal(preguntaPendiente(f.store.messages()), undefined);
  assert.deepEqual(f.store.rows().s.base.map((m) => m.turno), ["u1", "a1", "u2"], "la lectura que la trae suelta la fila del acuse sin duplicarla");
  assert.deepEqual(f.store.rows().s.optimistic, []);
  f.dispose();
});

test("H3 (copia atrasada): latest() con una copia que aún no trae la respuesta no devuelve la tarjeta", async () => {
  const f = fixture();
  await f.open([T_USER, T_PREGUNTA]);
  f.store.appendPersisted("s", [filaDelAcuse()]);
  f.nextRead([T_USER, T_PREGUNTA]); // el relay o el disco todavía no tienen el turno u2
  await f.store.latest("s");
  assert.equal(preguntaPendiente(f.store.messages()), undefined, "la tarjeta reaparece con una lectura sin el turno de la respuesta");
  f.nextRead([T_USER, T_PREGUNTA, T_RESPUESTA]); // la copia se pone al día
  await f.store.latest("s");
  assert.deepEqual(f.store.rows().s.base.map((m) => m.turno), ["u1", "a1", "u2"], "la lectura que la trae suelta la fila del acuse sin duplicarla");
  assert.deepEqual(f.store.rows().s.optimistic, []);
  f.dispose();
});

test("regresión: tras contestar con acuse, la tarjeta desaparece y no reaparece con el siguiente segment_saved", async () => {
  const f = fixture();
  await f.open([T_USER, T_PREGUNTA]);
  f.store.appendPersisted("s", [filaDelAcuse()]);
  assert.equal(preguntaPendiente(f.store.messages()), undefined);
  for (const [i, text] of ["Perfecto,", " creo el esquema."].entries()) {
    f.store.event(delta(text), { author: null }); f.store.flush();
    f.store.event(segmentSaved(`a${i + 2}`), { author: null });
    assert.equal(preguntaPendiente(f.store.messages()), undefined, `tarjeta visible tras segment_saved a${i + 2}`);
  }
  f.dispose();
});
