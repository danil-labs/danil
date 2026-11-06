import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptedFreeModelPolicy,
  freeModelPolicy,
  freeModelScope,
  recognizedFreeModelPolicy,
  sameFreeModelPolicy,
  type FreeModelConsent,
  type FreeModelPolicy,
} from "../../src/lib/free-model-policy.ts";

const policy = (changes: Partial<FreeModelPolicy> = {}): FreeModelPolicy => ({
  workspace_id: "workspace-a",
  version: 2,
  providers: ["kilo", "vercel", "reflection"],
  lines: [{ clave: "consent.free_model_router" }],
  acceptance_ref: "opaque-policy-reference",
  enabled: true,
  terms: [{ label: "Reflection", url: "https://reflection.ai/terms" }],
  accepted: false,
  ...changes,
});

const consent = (changes: Partial<FreeModelConsent> = {}): FreeModelConsent => ({
  workspace_id: "workspace-a",
  version: 2,
  providers: ["kilo", "vercel", "reflection"],
  policy_id: "policy-v2",
  acceptance_id: "acceptance-a",
  ...changes,
});

test("sin política nueva el motor antiguo no habilita el router", () => {
  assert.equal(freeModelPolicy({ active: "workspace-a" }), null);
  assert.equal(freeModelPolicy({ active: null, free_model_policy: policy() }), null);
});

test("el modal solo recibe una política habilitada del workspace activo y versión vigente", () => {
  const current = policy();
  assert.equal(freeModelPolicy({ active: "workspace-a", free_model_policy: current }), current);
  for (const changes of [
    { workspace_id: "workspace-b" },
    { version: 1 },
    { version: 3 },
    { enabled: false },
    { acceptance_ref: "" },
    { lines: [] },
  ]) {
    assert.equal(freeModelPolicy({ active: "workspace-a", free_model_policy: policy(changes) }), null);
  }
});

test("agregar, quitar o duplicar proveedores requiere otra política", () => {
  for (const providers of [
    [],
    ["kilo", "vercel"],
    ["kilo", "vercel", "reflection", "nvidia"],
    ["kilo", "vercel", "paid-provider"],
    ["kilo", "kilo", "reflection"],
  ]) {
    assert.equal(freeModelPolicy({ active: "workspace-a", free_model_policy: policy({ providers }) }), null);
    assert.equal(acceptedFreeModelPolicy(policy(), consent({ providers })), false);
    assert.equal(sameFreeModelPolicy(policy(), policy({ providers })), false);
  }
});

test("el orden del mismo conjunto de proveedores no cambia la política ni su aceptación", () => {
  const providers = ["reflection", "kilo", "vercel"];
  assert.ok(freeModelPolicy({ active: "workspace-a", free_model_policy: policy({ providers }) }));
  assert.equal(sameFreeModelPolicy(policy(), policy({ providers })), true);
  assert.equal(acceptedFreeModelPolicy(policy(), consent({ providers })), true);
});

test("el consentimiento ausente, v1 o de otro workspace no autoriza", () => {
  assert.equal(acceptedFreeModelPolicy(policy()), false);
  assert.equal(acceptedFreeModelPolicy(policy(), consent()), true);
  for (const changes of [{ version: 1 }, { version: 3 }, { workspace_id: "workspace-b" }]) {
    assert.equal(acceptedFreeModelPolicy(policy(), consent(changes)), false);
  }
});

test("un registro parcial no acredita una aceptación del motor", () => {
  for (const changes of [{ policy_id: "" }, { acceptance_id: "" }]) {
    assert.equal(acceptedFreeModelPolicy(policy(), consent(changes)), false);
  }
  for (const record of [
    {},
    { workspace_id: "workspace-a", version: 2 },
    { workspace_id: "workspace-a", version: 2, policy_id: "p", acceptance_id: "a" },
  ]) {
    assert.equal(acceptedFreeModelPolicy(policy(), record as FreeModelConsent), false);
  }
});

test("un modal pendiente detecta cambio de workspace o versión y ausencia de política", () => {
  assert.equal(sameFreeModelPolicy(policy(), null), false);
  assert.equal(sameFreeModelPolicy(policy(), policy({ workspace_id: "workspace-b" })), false);
  assert.equal(sameFreeModelPolicy(policy(), policy({ version: 3 })), false);
  assert.equal(sameFreeModelPolicy(policy(), policy()), true);
});

test("el scope de aceptar y revocar pertenece al workspace de la política mostrada", () => {
  const a = policy();
  const b = policy({ workspace_id: "workspace-b" });
  assert.deepEqual(freeModelScope(a), { headers: { "x-terminus-workspace": "workspace-a" } });
  assert.deepEqual(freeModelScope(b), { headers: { "x-terminus-workspace": "workspace-b" } });
  assert.deepEqual(freeModelScope(a), { headers: { "x-terminus-workspace": "workspace-a" } });
});

test("una política deshabilitada se reconoce para revocar pero no para aceptar", () => {
  const disabled = policy({ enabled: false, accepted: true });
  const startup = { active: "workspace-a", free_model_policy: disabled };
  assert.equal(recognizedFreeModelPolicy(startup), disabled);
  assert.equal(freeModelPolicy(startup), null);
  assert.equal(acceptedFreeModelPolicy(disabled, consent()), true);
  assert.equal(recognizedFreeModelPolicy({ ...startup, active: "workspace-b" }), null);
  assert.equal(recognizedFreeModelPolicy({ ...startup, free_model_policy: policy({ enabled: false, version: 1 }) }), null);
});

test("cambiar de máquina invalida la política capturada aunque coincidan workspace y proveedores", () => {
  const captured = policy({ destination_machine: "machine-a" });
  assert.equal(sameFreeModelPolicy(captured, policy({ destination_machine: "machine-a" })), true);
  assert.equal(sameFreeModelPolicy(captured, policy({ destination_machine: "machine-b" })), false);
  assert.equal(sameFreeModelPolicy(captured, policy()), false);
  assert.equal(sameFreeModelPolicy(policy(), captured), false);
});

test("el scope conserva juntos el workspace y la máquina capturados", () => {
  assert.deepEqual(freeModelScope(policy({ destination_machine: "machine-a" })), {
    headers: { "x-terminus-workspace": "workspace-a", "x-terminus-machine": "machine-a" },
  });
});
