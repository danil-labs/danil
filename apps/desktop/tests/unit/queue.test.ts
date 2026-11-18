import assert from "node:assert/strict";
import test from "node:test";

import { agruparCola as groupQueue, deOtraTarea as fromAnotherTask, contestaALaTerminal as answersTerminal, despachable as isDispatchable, esDeLaTerminal as isTerminalMessage, guardable as isSaveable, inyectable as isInjectable, retencionAlCargar as retentionOnLoad, seMandaSinSuperficie as sendsWithoutSurface, siguienteLote as nextBatch, sueltaElBorrador as releasesDraft } from "../../src/features/chat/queue.ts";
import type { Encolado as Queued } from "../../src/features/chat/MessageQueue.tsx";

const idle = {
  pendientes: 2,
  de: "A",
  mirando: "A",
  ocupado: false,
  editando: false,
  retenida: null,
  esperando: false,
} as const;

test("no sale nada de una cola que es de otra tarea", () => {
  // El incidente: la cola de A con B delante. `ocupado` en `false` porque B no
  // está contestando — eso es justo lo que abría la puerta.
  assert.equal(isDispatchable({ ...idle, de: "A", mirando: "B" }), false);
  // Y hacia el blanco, que es peor: ahí el mensaje habría creado una tarea.
  assert.equal(isDispatchable({ ...idle, de: "A", mirando: null }), false);
  // La cola de una tarea recién abierta, con el blanco todavía delante.
  assert.equal(isDispatchable({ ...idle, de: null, mirando: "B" }), false);
});

test("la cola de una conversación que aún no existe en disco es suya", () => {
  // Los dos `null` son la misma tarea: la del primer turno, que no tiene id
  // hasta que Rust crea la sesión. Retenerla ahí la dejaría muda para siempre.
  assert.equal(isDispatchable({ ...idle, de: null, mirando: null }), true);
});

test("las cuatro razones de quedarse quieto siguen valiendo", () => {
  assert.equal(isDispatchable({ ...idle, ocupado: true }), false);
  assert.equal(isDispatchable({ ...idle, editando: true }), false);
  assert.equal(isDispatchable({ ...idle, retenida: "borrador" }), false);
  assert.equal(isDispatchable({ ...idle, esperando: true }), false);
  assert.equal(isDispatchable({ ...idle, pendientes: 0 }), false);
});

test("no se guarda en la carpeta de una tarea que no es la suya", () => {
  assert.equal(isSaveable("A", "A"), true);
  // Lo que dejaba `.cola.json` vacíos en la tarea que se acababa de dejar.
  assert.equal(isSaveable("A", "B"), false);
  assert.equal(isSaveable("A", null), false);
  // Sin dueño no hay carpeta donde escribir: el primer turno la crea.
  assert.equal(isSaveable(null, null), false);
});

test("volver de otro workspace no deja en borrador la cola que iba a salir", () => {
  assert.equal(retentionOnLoad(2, undefined), "borrador", "lo que sobrevivió a cerrar la app");
  assert.equal(retentionOnLoad(2, null), null, "lo que la ventana tenía suelto vuelve suelto");
  assert.equal(retentionOnLoad(2, "fallo"), "fallo", "un fallo de antes del cambio se conserva");
  assert.equal(retentionOnLoad(0, "fallo"), null, "sin nada en cola no hay qué retener");
});

test("un borrador leído de disco se suelta mientras su tarea contesta", () => {
  assert.equal(releasesDraft("borrador", true, true), true);
  assert.equal(releasesDraft("borrador", false, true), false, "sin turno vivo nadie sabe para qué era");
  assert.equal(releasesDraft("borrador", true, false), false, "el de un cierre sin desenlace no");
  assert.equal(releasesDraft("fallo", true, true), false, "un fallo solo se suelta a mano");
});

test("el lote conserva el orden, los adjuntos y la última configuración explícita", () => {
  const first = { id: "a", text: "Haz los cambios", provider: "codex", model: "first", effort: null, permission_mode: "auto", attachments: ["/a", "/b"] };
  const last = { ...first, id: "b", text: "Y agrega las pruebas", model: "last", permission_mode: "ask", attachments: ["/b", "/c"] };
  assert.deepEqual(groupQueue([first, last]), {
    text: "Haz los cambios\n\nY agrega las pruebas",
    provider: "codex", model: "last", effort: null, permission_mode: "ask",
    attachments: ["/a", "/b", "/c"],
  });
  assert.equal(groupQueue([]), null);
  assert.deepEqual(first.attachments, ["/a", "/b"]);
});

test("agrupar menciones reajusta sus posiciones UTF-16 y conserva su identidad", () => {
  const target = { kind: "task" as const, projectId: "project", sessionId: "task" };
  const message = { provider: "codex", model: null, effort: null, permission_mode: null, attachments: [] };
  const combined = groupQueue([
    { ...message, id: "a", text: "🦊 primero" },
    { ...message, id: "b", text: "@Login", task_mentions: [{ target, start: 0, end: 6, text: "@Login" }] },
  ])!;
  const ref = combined.task_mentions![0];
  assert.equal(combined.text.slice(ref.start, ref.end), "@Login");
  assert.equal(ref.start, "🦊 primero\n\n".length);
  assert.deepEqual(ref.target, target);
});

test("el lote rebasa también los destinatarios, que el backend valida contra el texto", () => {
  const message = { provider: "codex", model: null, effort: null, permission_mode: null, attachments: [] };
  const combined = groupQueue([
    { ...message, id: "a", text: "🦊 primero" },
    { ...message, id: "b", text: "@arquitecto revisa", recipients: [{ name: "arquitecto", start: 0, end: 11, text: "@arquitecto" }] },
  ])!;
  const recipient = combined.recipients![0];
  assert.equal(combined.text.slice(recipient.start, recipient.end), "@arquitecto");
  assert.equal(recipient.name, "arquitecto");
  // Un lote sin destinatarios no escribe la clave: mandar `[]` y no mandarla
  // significan lo mismo, y dos formas de lo mismo se comparan mal.
  assert.equal("recipients" in groupQueue([{ ...message, id: "a", text: "sin nadie" }])!, false);
});

const delivery = {
  id: "d1",
  text: "Revisa el acceso",
  provider: "codex",
  model: null,
  effort: null,
  permission_mode: null,
  attachments: [],
  agent: "arquitecto",
  reply_to: { folder: "p", task: "t9" },
  hops: 2,
};

test("vaciar la cola devuelve el remitente y la dirección de vuelta de la entrega", () => {
  const { mensaje: message, lote: batch, resto: remaining } = nextBatch([delivery, { ...delivery, id: "d2", text: "Y el registro" }]);
  assert.equal(message!.agent, "arquitecto");
  assert.deepEqual(message!.reply_to, { folder: "p", task: "t9" });
  assert.equal(message!.hops, 2);
  assert.equal(message!.text, ["Revisa el acceso", "Y el registro"].join("\n\n"));
  assert.deepEqual(batch.map((i) => i.id), ["d1", "d2"]);
  assert.deepEqual(remaining, []);
});

test("un lote no mezcla remitentes: lo que viene de otro sobre espera al turno siguiente", () => {
  const own = { ...delivery, id: "p1", text: "Y esto lo escribo yo", agent: null, reply_to: null, hops: null };
  const first = nextBatch([delivery, own]);
  assert.equal(first.mensaje!.text, "Revisa el acceso");
  assert.equal(first.mensaje!.agent, "arquitecto");
  assert.deepEqual(first.resto.map((i) => i.id), ["p1"]);
  // Y al siguiente turno sale lo de la persona, sin la firma de nadie.
  const second = nextBatch(first.resto);
  assert.equal(second.mensaje!.text, "Y esto lo escribo yo");
  assert.equal("agent" in second.mensaje!, false);
  assert.equal("reply_to" in second.mensaje!, false);
  // Dos entregas del mismo remitente sí van juntas: es un solo turno suyo.
  assert.deepEqual(nextBatch([delivery, { ...delivery, id: "d2" }]).resto, []);
  assert.deepEqual(nextBatch([]).mensaje, null);
  assert.equal("agent" in groupQueue([own])!, false);
});

// Lo que llegó por Telegram mientras el chat contestaba espera en la cola sin
// firma de encargado, y sale con su canal para que la respuesta vuelva por él.
test("un mensaje encolado de un canal conserva su canal sin firma de agente", () => {
  const telegram = { ...delivery, id: "c1", text: "hola", agent: null, reply_to: null, hops: 1, channel: "Telegram" };
  const window = { ...telegram, id: "p1", text: "y esto desde la ventana", channel: null };
  const first = nextBatch([telegram, window]);
  assert.equal(first.mensaje!.channel, "Telegram");
  assert.equal("agent" in first.mensaje!, false);
  assert.deepEqual(first.resto.map((i) => i.id), ["p1"]);
  assert.equal("channel" in nextBatch(first.resto).mensaje!, false);

});

// Lo que mandó una tarea por el CLI y esperó en la cola sale firmado por ella, y
// no se junta en un turno con lo que mandó otra.
test("una entrega encolada conserva la tarea remitente", () => {
  const login = { folder: "p", task: "login", title: "Corregir login", provider: "codex" };
  const fromTask = { ...delivery, id: "t1", agent: null, reply_to: null, from_task: login };
  const fromOther = { ...fromTask, id: "t2", from_task: { ...login, task: "otra", title: "Otra" } };
  const first = nextBatch([fromTask, fromOther]);
  assert.deepEqual(first.mensaje!.from_task, login);
  assert.deepEqual(first.resto.map(item => item.id), ["t2"]);

});

// Lo que se encoló desde dos escritorios sale en dos turnos, cada uno con el
// suyo: juntarlos lanzaría lo pedido en A dentro del escritorio B.
test("un lote conserva su escritorio y separa mensajes de otro escritorio", () => {
  const own = { ...delivery, id: "a1", agent: null, reply_to: null, hops: null };
  const inA = { ...own, space: "iniA" };
  const inA2 = { ...own, id: "a2", text: "y otra cosa", space: "iniA" };
  const inB = { ...own, id: "b1", text: "desde B", space: "iniB" };
  const first = nextBatch([inA, inA2, inB]);
  assert.equal(first.mensaje!.space, "iniA");
  assert.deepEqual(first.lote.map((i) => i.id), ["a1", "a2"]);
  const second = nextBatch(first.resto);
  assert.equal(second.mensaje!.space, "iniB");
  assert.deepEqual(second.resto, []);
  // Sin escritorio (una cola de antes, o una entrega) no se junta con uno que sí.
  assert.deepEqual(nextBatch([own, inB]).resto.map((i) => i.id), ["b1"]);
  assert.equal("space" in nextBatch([own]).mensaje!, false);

});

const written = { provider: "claude", model: null, effort: null, permission_mode: null, attachments: [] };

// Juntar un `!` o un `/` con otro renglón los manda como un solo comando: el
// mensaje de detrás se ejecuta en la terminal o llega al CLI como argumento.
test("un comando de terminal o de barra sale solo en su lote, sin nada delante ni detrás", () => {
  const queue = [
    { ...written, id: "m1", text: "revisa el login" },
    { ...written, id: "m2", text: "y el registro" },
    { ...written, id: "s1", text: "!pnpm test" },
    { ...written, id: "s2", text: "!git status" },
    { ...written, id: "b1", text: "/compact" },
    { ...written, id: "m3", text: "ahora sigue" },
  ];
  const batches: string[][] = [];
  let remaining: Queued[] = queue;
  while (remaining.length) {
    const next = nextBatch(remaining);
    batches.push(next.lote.map((i) => i.id));
    remaining = next.resto;
  }
  assert.deepEqual(batches, [["m1", "m2"], ["s1"], ["s2"], ["b1"], ["m3"]]);
  assert.equal(nextBatch(queue.slice(2)).mensaje!.text, "!pnpm test");
});

// El turno vivo recibe texto para el agente: un `!` inyectado llegaría al
// modelo como prosa en vez de correr, y un `/` perdería su sitio de comando.
test("al turno vivo solo entra lo que es un mensaje, nunca un comando", () => {
  assert.equal(isInjectable({ ...written, id: "a", text: "y revisa esto" }), true);
  assert.equal(isInjectable({ ...written, id: "a", text: "!pnpm test" }), false);
  assert.equal(isInjectable({ ...written, id: "a", text: "/compact" }), false);
  assert.equal(isInjectable({ ...written, id: "a", text: "  !ls" }), false);
  // Un signo en medio no es un comando.
  assert.equal(isInjectable({ ...written, id: "a", text: "¿por qué falla /tmp!?" }), true);
});

// Lo que mandó otra tarea no entra en el turno vivo desde la ventana:
// `inject_message` no lleva sobre y saldría firmado por la persona. Se ve con
// su remitente y no se edita ni se quita como si fuera suyo.
test("una entrega de otra tarea no se inyecta ni se toma por de la persona", () => {
  const reply = {
    ...written,
    id: "r1",
    text: "Ya subí el arreglo",
    from_task: { folder: "p", task: "2jcp4typ", title: "Arreglo", provider: "claude" },
    hops: 0,
  };
  assert.equal(isInjectable(reply), false);
  assert.equal(fromAnotherTask(reply), true);
  assert.equal(isInjectable(delivery), false);
  assert.equal(fromAnotherTask(delivery), true);
  const telegram = { ...written, id: "c1", text: "hola", channel: "telegram", hops: 1 };
  assert.equal(isInjectable(telegram), false);
  assert.equal(fromAnotherTask(telegram), false, "lo de un canal lo escribió la persona");
  assert.equal(fromAnotherTask({ ...written, id: "a", text: "y revisa esto" }), false);
});

// Un `!` que llegó de otra tarea, de un encargado o de un canal no es de la
// persona: sale como texto para el agente y no se ejecuta.
test("solo se ejecuta el `!` que escribió la persona en su caja", () => {
  assert.equal(isTerminalMessage({ ...written, id: "a", text: "!ls" }), true);
  assert.equal(isTerminalMessage({ ...written, id: "a", text: "ls" }), false);
  assert.equal(isTerminalMessage({ ...delivery, text: "!rm -rf build" }), false);
  assert.equal(isTerminalMessage({ ...written, id: "a", text: "!ls", channel: "Telegram" }), false);
  assert.equal(isTerminalMessage({ ...written, id: "a", text: "!ls", hops: 0 }), false);
});

test("la respuesta automática espera al último comando y a que no venga un mensaje", () => {
  const command = { ...written, id: "s1", text: "!pnpm test" };
  const message = { ...written, id: "m1", text: "¿qué falla?" };
  assert.equal(answersTerminal([], false, true), true);
  assert.equal(answersTerminal([command], false, true), false);
  assert.equal(answersTerminal([message], false, true), false);
  assert.equal(answersTerminal([{ ...written, id: "b1", text: "/compact" }], false, true), false);
  assert.equal(answersTerminal([], true, true), false);
});

// Sin cuenta conectada nadie puede contestar: pedir el turno pintaría un fallo
// bajo un comando que corrió bien. La salida espera al primer mensaje.
test("sin superficie utilizable la salida de un `!` queda pendiente y no se pide respuesta", () => {
  assert.equal(answersTerminal([], false, true), true);
  assert.equal(answersTerminal([], false, false), false);
});

// Un `!` no llama a ningún modelo: exigirle superficie lo deja sin correr en
// una app recién instalada, que es donde se escribe primero.
test("un `!` se manda sin superficie utilizable y un mensaje no", () => {
  assert.equal(sendsWithoutSurface("!git status"), true);
  assert.equal(sendsWithoutSurface("revisa esto"), false);
  assert.equal(sendsWithoutSurface("/compact"), false);
  // La caja entra en modo terminal con el `!` en la primera columna.
  assert.equal(sendsWithoutSurface(" !ls"), false);
});
test("an uncertain delivery cannot be sent again or injected into a running turn", () => {
  const item = { id: "unknown", text: "may already be accepted", ...written, uncertain: true };
  assert.equal(isInjectable(item), false);
  assert.equal(groupQueue([item]), null);
  assert.deepEqual(nextBatch([item]), { mensaje: null, lote: [], resto: [item] });
});
test("batching stops before an uncertain delivery and leaves later work in order", () => {
  const ready = { id: "ready", text: "first", ...written };
  const unknown = { id: "unknown", text: "ambiguous", ...written, uncertain: true };
  const later = { id: "later", text: "last", ...written };
  const next = nextBatch([ready, unknown, later]);
  assert.deepEqual(next.lote, [ready]); assert.deepEqual(next.resto, [unknown, later]); assert.equal(next.mensaje?.text, "first");
});
