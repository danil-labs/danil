import assert from "node:assert/strict";
import test from "node:test";
import { loadFreeModelPolicy } from "../../src/lib/free-model-policy-load.ts";
import type { FreeModelPolicy } from "../../src/lib/free-model-policy.ts";

const policy = (changes: Partial<FreeModelPolicy> = {}): FreeModelPolicy => ({
  workspace_id: "workspace-a", version: 2, providers: ["kilo", "vercel", "reflection"],
  lines: [{ clave: "consent.free_model_router" }], acceptance_ref: "opaque-reference",
  enabled: true, accepted: false, terms: [], ...changes,
});

type Call = { command: string; options?: { headers?: HeadersInit } };

async function withIpc(
  answer: (call: Call) => unknown,
  run: (calls: Call[]) => Promise<void>,
) {
  const before = Object.getOwnPropertyDescriptor(globalThis, "window");
  const calls: Call[] = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    __TAURI_INTERNALS__: { invoke: async (command: string, _args: unknown, options: Call["options"]) => {
      const call = { command, options };
      calls.push(call);
      return answer(call);
    } },
  } });
  try { await run(calls); }
  finally {
    if (before) Object.defineProperty(globalThis, "window", before);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

test("el loader relee en el workspace y máquina capturados y descarta la política fusionada", async () => {
  await withIpc(({ command, options }) => {
    if (command === "machine_list") return [{ id: "machine-a", active: true }];
    if (!options) return { active: "workspace-a", free_model_policy: policy({ acceptance_ref: "merged-reference" }) };
    return { active: "workspace-a", free_model_policy: policy() };
  }, async (calls) => {
    assert.deepEqual(await loadFreeModelPolicy(), policy({ destination_machine: "machine-a" }));
    assert.deepEqual(calls, [
      { command: "workspaces_startup", options: undefined },
      { command: "machine_list", options: undefined },
      { command: "workspaces_startup", options: { headers: {
        "x-terminus-workspace": "workspace-a", "x-terminus-machine": "machine-a",
      } } },
    ]);
  });
});

test("revalidar un modal no vuelve a elegir la máquina activa", async () => {
  await withIpc(({ command }) => {
    assert.equal(command, "workspaces_startup");
    return { active: "workspace-a", free_model_policy: policy({ enabled: false }) };
  }, async (calls) => {
    const captured = policy({ destination_machine: "machine-a" });
    assert.deepEqual(await loadFreeModelPolicy(captured), policy({ enabled: false, destination_machine: "machine-a" }));
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].options, { headers: {
      "x-terminus-workspace": "workspace-a", "x-terminus-machine": "machine-a",
    } });
  });
});

test("sin workspace o máquina activa el loader no obtiene una política utilizable", async () => {
  for (const active of [null, "workspace-a"]) {
    await withIpc(({ command }) => command === "machine_list" ? [] : { active }, async (calls) => {
      assert.equal(await loadFreeModelPolicy(), null);
      assert.ok(calls.every((call) => !call.options));
    });
  }
});

test("una respuesta scoped de otro workspace no sustituye al destino capturado", async () => {
  await withIpc(() => ({ active: "workspace-b", free_model_policy: policy({ workspace_id: "workspace-b" }) }), async () => {
    assert.equal(await loadFreeModelPolicy(policy({ destination_machine: "machine-a" })), null);
  });
});

test("un motor viejo sin política no habilita el destino capturado", async () => {
  await withIpc(() => ({ active: "workspace-a" }), async () => {
    assert.equal(await loadFreeModelPolicy(policy({ destination_machine: "machine-a" })), null);
  });
});

test("si desaparece el destino el loader propaga el error sin cambiar a otro motor", async () => {
  const error = { what: "destination unavailable", detail: "io" };
  await withIpc(() => { throw error; }, async (calls) => {
    await assert.rejects(loadFreeModelPolicy(policy({ destination_machine: "machine-a" })), (e) => e === error);
    assert.equal(calls.length, 1);
  });
});
