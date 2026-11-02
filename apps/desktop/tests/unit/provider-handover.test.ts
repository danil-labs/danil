import assert from "node:assert/strict";
import test from "node:test";

import {
  canHandOverTask,
  handOverReason,
  sendWithHandover,
  type HandoverGate,
  type HandoverState,
} from "../../src/features/chat/handover.ts";

const estado = (over: Partial<HandoverState> = {}): HandoverState => ({
  can: true,
  blocked: null,
  provider: "claude",
  ...over,
});

const tarea = (over: Partial<HandoverGate> = {}): HandoverGate => ({
  session: "t1",
  running: false,
  remote: false,
  announced: true,
  state: estado(),
  ...over,
});

test("una tarea quieta, local y con el rasgo anunciado puede cambiar de CLI", () => {
  assert.equal(handOverReason(tarea()), null);
  assert.equal(canHandOverTask(tarea()), true);
});

test("sin tarea abierta no hay gesto ni motivo", () => {
  assert.equal(handOverReason(tarea({ session: null })), null);
  assert.equal(canHandOverTask(tarea({ session: null })), false);
});

test("el turno vivo se llama por su clave, no se esconde", () => {
  assert.equal(handOverReason(tarea({ running: true })), "chat.handover.busy");
  assert.equal(canHandOverTask(tarea({ running: true })), false);
});

test("un encargado conserva su proveedor", () => {
  assert.equal(handOverReason(tarea({ handler: true })), "chat.handover.handler");
});

test("una tarea de otra máquina no ofrece el gesto en esta ventana", () => {
  assert.equal(handOverReason(tarea({ remote: true })), "chat.handover.unsupported");
  assert.equal(canHandOverTask(tarea({ remote: true })), false);
});

test("un motor anterior, sin can_hand_over, no puede cambiar", () => {
  assert.equal(handOverReason(tarea({ state: undefined })), "chat.handover.unsupported");
  assert.equal(canHandOverTask(tarea({ state: undefined })), false);
});

test("sin el rasgo anunciado la tarea tampoco puede", () => {
  assert.equal(handOverReason(tarea({ announced: false })), "chat.handover.unsupported");
});

test("el motivo del motor es el que se muestra", () => {
  for (const clave of [
    "chat.handover.adopted",
    "chat.handover.fork",
    "chat.handover.subagent",
    "chat.handover.child",
    "chat.handover.stale",
    "chat.handover.unknown_provider",
  ]) {
    assert.equal(handOverReason(tarea({ state: estado({ can: false, blocked: clave }) })), clave);
  }
});

test("mientras corre, la razón permanente gana a la espera del turno", () => {
  assert.equal(
    handOverReason(tarea({ running: true, state: estado({ can: false, blocked: "chat.handover.adopted" }) })),
    "chat.handover.adopted",
  );
  assert.equal(handOverReason(tarea({ running: true })), "chat.handover.busy");
});

test("el consentimiento se pide antes de mandar el turno", async () => {
  const pasos: string[] = [];
  const salida = await sendWithHandover({
    session: "t1",
    pending: "codex",
    current: "claude",
    provider: "codex",
    command: false,
    setProvider: async (provider) => {
      pasos.push(`provider:${provider}`);
    },
    send: async () => {
      pasos.push("send");
      return "turno";
    },
  });
  assert.deepEqual(pasos, ["provider:codex", "send"]);
  assert.equal(salida.handedOver, true);
  assert.equal(salida.answer, "turno");
});

test("si el consentimiento falla, el mensaje no se manda", async () => {
  let mando = false;
  await assert.rejects(
    sendWithHandover({
      session: "t1",
      pending: "codex",
      current: "claude",
      provider: "codex",
      command: false,
      setProvider: async () => {
        throw new Error("chat.handover.stale");
      },
      send: async () => {
        mando = true;
        return "turno";
      },
    }),
    /chat\.handover\.stale/,
  );
  assert.equal(mando, false);
});

test("no hay consentimiento cuando el CLI no cambia, el mensaje no es del nuevo o es un `!`", async () => {
  const casos = [
    { pending: "claude", current: "claude", provider: "claude", command: false, session: "t1" },
    { pending: "codex", current: "claude", provider: "claude", command: false, session: "t1" },
    { pending: "codex", current: "claude", provider: "codex", command: true, session: "t1" },
    { pending: "codex", current: "claude", provider: "codex", command: false, session: null },
    { pending: null, current: "claude", provider: "codex", command: false, session: "t1" },
  ];
  for (const caso of casos) {
    let pidio = false;
    const salida = await sendWithHandover({
      ...caso,
      setProvider: async () => {
        pidio = true;
      },
      send: async () => "turno",
    });
    assert.equal(pidio, false, JSON.stringify(caso));
    assert.equal(salida.handedOver, false, JSON.stringify(caso));
  }
});
