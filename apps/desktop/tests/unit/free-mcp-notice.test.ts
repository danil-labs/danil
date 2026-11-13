import assert from "node:assert/strict";
import test from "node:test";
import { freeMcpNoticeAt } from "../../src/features/chat/free-mcp-notice.ts";

const header = { role: "system", meta: "aviso", text: "chat.notice.free_router_mcp_unavailable" };
const names = (text: string) => ({ role: "system", meta: "aviso", text });

test("el aviso reconoce la pareja persistida sin modificar el historial", () => {
  const identities = ["qa-env", "qa\\u{3c}b\\u{3e}", "qa \\\"quoted\\\"", "qa\\u{a}line"];
  const messages = Object.freeze([
    Object.freeze({ role: "user", text: "synthetic prompt" }),
    Object.freeze({ ...header }),
    Object.freeze(names(JSON.stringify(identities))),
    Object.freeze({ role: "agent", text: "respuesta que debe conservarse" }),
  ]);
  const before = JSON.stringify(messages);
  assert.deepEqual(freeMcpNoticeAt(messages, 1), { names: identities });
  assert.deepEqual(freeMcpNoticeAt(messages, 1), { names: identities });
  assert.equal(freeMcpNoticeAt(messages, 2), null);
  assert.equal(freeMcpNoticeAt(messages, 3), null);
  assert.equal(JSON.stringify(messages), before);
});

test("prosa del agente o usuario no se interpreta como aviso del motor", () => {
  for (const role of ["user", "agent"]) {
    assert.equal(freeMcpNoticeAt([{ ...header, role }, names('["qa"]')], 0), null);
  }
  assert.equal(freeMcpNoticeAt([{ ...header, meta: "fallo" }, names('["qa"]')], 0), null);
  assert.equal(freeMcpNoticeAt([{ ...header, text: "otro aviso" }, names('["qa"]')], 0), null);
  assert.equal(freeMcpNoticeAt([], 0), null);
  assert.equal(freeMcpNoticeAt([header], -1), null);
});

test("JSON inválido o de otro tipo no identifica la siguiente fila como lista de nombres", () => {
  for (const text of ["respuesta normal", "[", '"qa"', "null", "{}", '["qa",42]', '[{"name":"qa"}]']) {
    const next = names(text);
    assert.deepEqual(freeMcpNoticeAt([header, next], 0), { names: null });
    assert.equal(next.text, text);
  }
  assert.deepEqual(freeMcpNoticeAt([header], 0), { names: null });
});

test("la lista debe ser otra fila system/aviso y nunca absorbe contenido de otro autor", () => {
  for (const next of [
    { role: "user", meta: "aviso", text: '["user content"]' },
    { role: "agent", meta: "aviso", text: '["agent content"]' },
    { role: "system", meta: "fallo", text: '["failure content"]' },
  ]) {
    assert.deepEqual(freeMcpNoticeAt([header, next], 0), { names: null });
  }
});

test("el presupuesto de nombres no rompe Unicode ni cambia la fila original", () => {
  const list = Array.from({ length: 40 }, (_, i) => `${i}:` + "☃".repeat(500));
  const next = names(JSON.stringify(list));
  const before = next.text;
  const result = freeMcpNoticeAt([header, next], 0);
  assert.equal(result?.names?.length, 32);
  assert.equal(Array.from(result?.names?.[0] ?? "").length, 480);
  assert.equal(next.text, before);
  assert.deepEqual(freeMcpNoticeAt([header, names(JSON.stringify(["x".repeat(32768)]))], 0), { names: null });
});
