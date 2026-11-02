/**
 * El traspaso de proveedor en una tarea normal: cuándo se ofrece (el motor es
 * la autoridad) y el orden del envío. Sin pantallas, como la capa de datos.
 *
 *   node --test apps/mobile/scripts/handover.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { PROVIDER_HANDOFF_FEATURE } from "@terminus/protocol";
import { failureKey } from "../src/lib/failureNotice.ts";
import { handoverGate, livePending, sendWithHandover } from "../src/lib/handover.ts";

const features = [PROVIDER_HANDOFF_FEATURE];

test("una tarea quieta, con la feature y sin bloqueo del motor, sí puede cambiar", () => {
  assert.deepEqual(handoverGate({ session: { can_hand_over: true }, running: false, features, remote: false }), { allowed: true, reason: null });
});

test("un motor anterior no lo ofrece: sin feature o sin `can_hand_over`", () => {
  assert.equal(handoverGate({ session: { can_hand_over: true }, running: false, features: [], remote: false }).reason, "chat.handover.unsupported");
  assert.equal(handoverGate({ session: {}, running: false, features, remote: false }).reason, "chat.handover.unsupported");
  assert.equal(handoverGate({ session: null, running: false, features, remote: false }).reason, "chat.handover.unsupported");
});

test("el turno vivo es «busy» solo si lo demás permite; el motivo del motor manda antes", () => {
  assert.equal(handoverGate({ session: { can_hand_over: true }, running: true, features, remote: false }).reason, "chat.handover.busy");
  assert.equal(handoverGate({ session: { can_hand_over: true }, running: true, features, remote: true }).reason, "chat.handover.unsupported", "una remota no promete un cambio que nunca existirá");
  for (const key of ["chat.handover.handler", "chat.handover.adopted", "chat.handover.fork", "chat.handover.subagent", "chat.handover.child"]) {
    assert.equal(handoverGate({ session: { can_hand_over: false, hand_over_blocked: key }, running: false, features, remote: false }).reason, key);
    assert.equal(handoverGate({ session: { can_hand_over: false, hand_over_blocked: key }, running: true, features, remote: false }).reason, key, "el rechazo permanente gana al turno vivo");
  }
});

test("una hija remota no cambia en v1, aunque el motor no la haya rechazado", () => {
  assert.equal(handoverGate({ session: { can_hand_over: true }, running: false, features, remote: true }).reason, "chat.handover.unsupported");
});

test("el consentimiento va antes que el mensaje", async () => {
  const calls: string[] = [];
  const out = await sendWithHandover({
    shell: false,
    pending: "codex",
    from: "claude",
    to: "codex",
    consent: async (provider) => { calls.push(`consent:${provider}`); },
    send: async () => { calls.push("send"); return "ok"; },
  });
  assert.equal(out, "ok");
  assert.deepEqual(calls, ["consent:codex", "send"]);
});

test("sin cambio de CLI, o con un `!`, no escribe la intención", async () => {
  const calls: string[] = [];
  const consent = async () => { calls.push("consent"); };
  const send = async () => { calls.push("send"); return true; };
  await sendWithHandover({ shell: false, pending: "claude", from: "claude", to: "claude", consent, send });
  await sendWithHandover({ shell: true, pending: "codex", from: "claude", to: "codex", consent, send });
  assert.deepEqual(calls, ["send", "send"]);
});

test("si el consentimiento falla, el mensaje no sale", async () => {
  let sent = false;
  await assert.rejects(
    sendWithHandover({
      shell: false,
      pending: "codex",
      from: "claude",
      to: "codex",
      consent: async () => { throw new Error("chat.handover.no_budget"); },
      onConsent: () => assert.fail("no hubo consentimiento"),
      send: async () => { sent = true; return true; },
    }),
    /no_budget/,
  );
  assert.equal(sent, false);
});

test("el pendiente se suelta en cuanto el consentimiento queda escrito, aunque el turno falle después", async () => {
  let cleared = false;
  await assert.rejects(
    sendWithHandover({
      shell: false,
      pending: "codex",
      from: "claude",
      to: "codex",
      consent: async () => {},
      onConsent: () => { cleared = true; },
      send: async () => { throw new Error("turn_failed"); },
    }),
    /turn_failed/,
  );
  assert.equal(cleared, true);
});

test("el pendiente vive solo en su tarea y mientras el CLI siga siendo el de origen", () => {
  const pending = { to: "codex", from: "claude", task: "vm/w/f/1" };
  assert.equal(livePending(pending, "vm/w/f/1", "claude"), pending, "quieto en su origen");
  assert.equal(livePending(pending, "vm/w/f/1", null), pending, "la lectura aún no llegó");
  assert.equal(livePending(pending, "vm/w/f/1", "codex"), null, "ya se aplicó");
  assert.equal(livePending(pending, "vm/w/f/1", "opencode"), null, "otro cliente cambió el CLI");
  assert.equal(livePending(pending, "vm/w/f/2", "claude"), null, "otra tarea, aunque el CLI coincida");
});

test("el rechazo del motor conserva su clave de catálogo", () => {
  assert.equal(failureKey({ code: "command_failed", detail: { what: { clave: "chat.handover.no_budget" }, detail: "" } }), "chat.handover.no_budget");
  assert.equal(failureKey({ code: "command_failed", detail: "chat.handover.no_budget" }), "chat.handover.no_budget");
  assert.equal(failureKey({ message_key: "chat.handover.no_budget" }), "chat.handover.no_budget", "message_key de primer nivel");
  assert.equal(
    failureKey({ code: "command_failed", message_key: "cli.error.command_failed", detail: { what: { clave: "chat.handover.no_budget" }, detail: "" } }),
    "chat.handover.no_budget",
    "el sobre genérico no tapa la frase del motor",
  );
  assert.equal(failureKey(new Error("boom")), null);
});
