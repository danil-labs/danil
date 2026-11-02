import assert from "node:assert/strict";
import test from "node:test";

import {
  agentSwitchBlocked,
  canHandOverTask,
  handOverReason,
  handoverInForce,
  handoverMatches,
  type HandoverGate,
  type HandoverState,
} from "../../src/features/chat/handover.ts";
import { sendWithHandover } from "../../src/features/chat/handoverSend.ts";

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
  assert.equal(salida.settled, true);
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

test("si el consentimiento se escribe y el envío falla, el pendiente queda para el reintento", async () => {
  const pasos: string[] = [];
  await assert.rejects(
    sendWithHandover({
      session: "t1",
      pending: "codex",
      current: "claude",
      provider: "codex",
      command: false,
      setProvider: async () => {
        pasos.push("provider");
      },
      send: async () => {
        pasos.push("send");
        throw new Error("network");
      },
    }),
    /network/,
  );
  // Se lanzó: no hubo `settled` y el borrador conserva el pendiente. El
  // reintento vuelve a consentir, que es idempotente.
  assert.deepEqual(pasos, ["provider", "send"]);
});

test("no hay consentimiento cuando el CLI no cambia, el mensaje no es del nuevo o es un `!`", async () => {
  type Caso = { pending: string | null; current: string | null; provider: string; command: boolean; session: string | null };
  const casos: { caso: Caso; settled: boolean }[] = [
    { caso: { pending: "claude", current: "claude", provider: "claude", command: false, session: "t1" }, settled: true },
    { caso: { pending: "codex", current: "claude", provider: "claude", command: false, session: "t1" }, settled: false },
    { caso: { pending: "codex", current: "claude", provider: "codex", command: true, session: "t1" }, settled: false },
    { caso: { pending: "codex", current: "claude", provider: "codex", command: false, session: null }, settled: false },
    { caso: { pending: null, current: "claude", provider: "codex", command: false, session: "t1" }, settled: false },
  ];
  for (const { caso, settled } of casos) {
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
    assert.equal(salida.settled, settled, JSON.stringify(caso));
  }
});

test("un `!` con el pendiente ya puesto no lo consume", async () => {
  const salida = await sendWithHandover({
    session: "t1",
    pending: "codex",
    current: "codex",
    provider: "codex",
    command: true,
    setProvider: async () => {
      throw new Error("no debería pedirse");
    },
    send: async () => "comando",
  });
  assert.equal(salida.settled, false);
});

test("un chat de agente no se bloquea en el selector; un encargado sí", () => {
  assert.equal(agentSwitchBlocked({ ...tarea(), agentChat: true }), null);
  assert.equal(agentSwitchBlocked({ ...tarea({ handler: true }), agentChat: false }), "chat.handover.handler");
  assert.equal(
    agentSwitchBlocked({
      ...tarea({ state: estado({ can: false, blocked: "chat.handover.handler" }) }),
      agentChat: true,
    }),
    null,
  );
});

test("un pendiente cuyo `from` ya no es el CLI de la sesión caduca", () => {
  const pendiente = { from: "claude", to: "codex" };
  assert.deepEqual(handoverInForce(pendiente, "claude"), pendiente);
  assert.equal(handoverInForce(pendiente, "opencode"), null);
  assert.deepEqual(handoverInForce(pendiente, null), pendiente);
  assert.equal(handoverInForce(null, "claude"), null);
});

test("la confirmación solo se aplica a la tarea y al borrador que están delante", () => {
  const pedido = { sesion: "t1", clave: "t1" };
  assert.equal(handoverMatches(pedido, "t1", "t1"), true);
  assert.equal(handoverMatches(pedido, "t2", "t1"), false);
  assert.equal(handoverMatches(pedido, "t1", "borrador:p:agent:x"), false);
  assert.equal(handoverMatches(null, "t1", "t1"), false);
});
