/**
 * El estado de una credencial de IA sale de un solo sitio. «No se pudo preguntar»
 * (máquina apagada, motor sin respuesta, almacén ilegible) nunca se pinta como
 * «desconectada»: eso queda para una negativa real del CLI o del proveedor.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { credentialState } from "../src/index.ts";

const once = 1_700_000_000_000;

test("a real no from the CLI or the provider is disconnected; a yes is connected", () => {
  assert.deepEqual(credentialState({ authenticatedAt: once, status: { authenticated: false } }), { kind: "disconnected", why: "signed_out" });
  assert.deepEqual(credentialState({ authenticatedAt: once, status: { authenticated: true }, limits: { mode: "revoked" } }), { kind: "disconnected", why: "revoked" }, "the provider's 401 beats the file on disk");
  assert.deepEqual(credentialState({ authenticatedAt: once, status: { authenticated: true } }), { kind: "connected" });
  assert.deepEqual(credentialState({ authenticatedAt: null, limits: { mode: "no_account" } }), { kind: "disconnected", why: "signed_out" });
});

test("could not ask is never disconnected", () => {
  for (const code of ["machine_off", "machine_starting"]) {
    assert.deepEqual(credentialState({ authenticatedAt: once, statusFailure: code }), { kind: "unknown", why: "machine_off" }, code);
  }
  for (const code of ["machine_timeout", "io", "service_busy", "no_machine"]) {
    assert.deepEqual(credentialState({ authenticatedAt: once, statusFailure: code }), { kind: "unknown", why: "no_answer" }, code);
  }
  assert.deepEqual(credentialState({ authenticatedAt: once, status: { authenticated: true }, statusFailure: "machine_off" }), { kind: "unknown", why: "machine_off" }, "an answer from before the failed check is not today's");
  assert.deepEqual(credentialState({ authenticatedAt: once, status: { authenticated: false, unreadable: { what: "x" } } }), { kind: "unknown", why: "unreadable" }, "the engine could not open its store: what it says is the last known, not a no");
  assert.deepEqual(credentialState({ authenticatedAt: once, statusFailure: "machine_off", limits: { mode: "failed" } }), { kind: "unknown", why: "machine_off" }, "a failed usage read is no verdict either");
});

test("the provider answering with usage proves the account works when the CLI did not answer", () => {
  assert.deepEqual(credentialState({ authenticatedAt: once, statusFailure: "machine_timeout", limits: { mode: "read" } }), { kind: "connected" });
});

test("never connected and nothing known yet", () => {
  assert.deepEqual(credentialState({ authenticatedAt: null, statusFailure: "machine_off" }), { kind: "unknown", why: "machine_off" }, "off: not even a new account is called disconnected");
  assert.deepEqual(credentialState({ authenticatedAt: null, statusFailure: "machine_timeout" }), { kind: "disconnected", why: "signed_out" }, "never connected and no answer: nothing to doubt");
  assert.deepEqual(credentialState({ authenticatedAt: once }), { kind: "pending" });
});
