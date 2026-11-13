/**
 * El estado de una credencial de IA sale de un solo sitio. «No se pudo preguntar»
 * (máquina apagada, motor sin respuesta, almacén ilegible) nunca se pinta como
 * «desconectada»: eso queda para una negativa real del CLI o del proveedor.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { credentialState } from "../src/index.ts";

test("a real no from the CLI or the provider is disconnected; a yes is connected", () => {
  assert.deepEqual(credentialState({ status: { authenticated: false } }), { kind: "disconnected", why: "signed_out" });
  assert.deepEqual(credentialState({ status: { authenticated: true }, limits: { mode: "revoked" } }), { kind: "disconnected", why: "revoked" }, "the provider's 401 beats the file on disk");
  assert.deepEqual(credentialState({ status: { authenticated: true } }), { kind: "connected" });
});

test("could not ask is never disconnected", () => {
  for (const code of ["machine_off", "machine_starting"]) {
    assert.deepEqual(credentialState({ statusFailure: code }), { kind: "unknown", why: "machine_off" }, code);
  }
  for (const code of ["machine_timeout", "io", "service_busy", "no_machine"]) {
    assert.deepEqual(credentialState({ statusFailure: code }), { kind: "unknown", why: "no_answer" }, code);
  }
  assert.deepEqual(credentialState({ status: { authenticated: true }, statusFailure: "machine_off" }), { kind: "unknown", why: "machine_off" }, "an answer from before the failed check is not today's");
  assert.deepEqual(credentialState({ status: { authenticated: false, unreadable: { what: "x" } } }), { kind: "unknown", why: "unreadable" }, "the engine could not open its store: what it says is the last known, not a no");
  assert.deepEqual(credentialState({ statusFailure: "machine_off", limits: { mode: "failed" } }), { kind: "unknown", why: "machine_off" }, "a failed usage read is no verdict either");
});

test("no usage data is no verdict: a Codex 401 its CLI will renew comes as no_account (danil-engine#433)", () => {
  assert.deepEqual(credentialState({ limits: { mode: "no_account" } }), { kind: "pending" });
  assert.deepEqual(credentialState({ statusFailure: "machine_timeout", limits: { mode: "no_account" } }), { kind: "unknown", why: "no_answer" });
  assert.deepEqual(credentialState({ status: { authenticated: true }, limits: { mode: "no_account" } }), { kind: "connected" });
});

test("the provider answering with usage proves the account works when the CLI did not answer", () => {
  assert.deepEqual(credentialState({ statusFailure: "machine_timeout", limits: { mode: "read" } }), { kind: "connected" });
});

test("nothing known yet, and a check that failed on a machine that was off", () => {
  assert.deepEqual(credentialState({ statusFailure: "machine_off" }), { kind: "unknown", why: "machine_off" });
  assert.deepEqual(credentialState({}), { kind: "pending" });
});
