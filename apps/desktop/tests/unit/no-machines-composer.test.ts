import assert from "node:assert/strict";
import test from "node:test";
import { createRoot, createSignal } from "solid-js";
import { modoInicial } from "../../../../packages/features/chat/src/model/modes.ts";
import { createComposerStore } from "../../../../packages/features/composer/src/index.ts";
import { DESKTOP_AVAILABILITY, type MachineAvailability } from "../../../../packages/features/machines/src/model/availability.ts";
import { setCapabilities, type Capabilities } from "../../../../packages/host/src/platform.ts";
import type { AgentModels, ModelOption, ModoDePermiso } from "../../src/lib/model.ts";
import type { Superficie } from "../../src/lib/surfaces.ts";

globalThis.window = new EventTarget() as unknown as Window & typeof globalThis;
const model = (id: string): ModelOption => ({ id, label: id, efforts: ["low", "high"], default_effort: "low", gratis: false, note: null });
const catalog = (provider: string, id: string): AgentModels => ({ provider, models: [model(id)], fallback: false });
const surface: Superficie = { id: "claude", provider: "claude", label: "Claude", catalogo: "todo", usable: true, marca: null, porque: null };
const permissionModes: ModoDePermiso[] = [
  { id: "auto", label: { clave: "agents.mode.auto" }, falta: null, por_omision: true },
];
const NO_MACHINES: MachineAvailability = { kind: "no_machines", scope: "context" };
const BASE_CAPS: Capabilities = { nativeWindow: false, updater: false, localSetup: false, computerStatus: false, danilAccount: true, radiant: false };
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test("composer skips engine RPCs in no_machines and recovers automatically when a machine becomes ready", async () => {
  await createRoot(async (dispose) => {
    const [availability, setAvailability] = createSignal<MachineAvailability>(NO_MACHINES);
    setCapabilities({ ...BASE_CAPS, machineAvailability: availability });
    try {
      const [workspace] = createSignal<string | null>("ws_1");
      const [machine] = createSignal<string | null>(null);
      const [machineOn] = createSignal<boolean | undefined>(undefined);
      const [connected] = createSignal(true);
      const [session] = createSignal<string | null>(null);
      const [workspaceMode] = createSignal<string | null>(null);
      const calls: string[] = [];
      const store = createComposerStore({
        invoke: async <T>(command: string, args?: Record<string, unknown>) => {
          calls.push(command);
          if (command === "list_models") return catalog(String(args?.provider), "first") as T;
          if (command === "list_surfaces") return [surface] as T;
          if (command === "list_permission_modes") return permissionModes as T;
          if (command === "list_slash_menu") return { commands: [], skills: [] } as T;
          return [] as T;
        },
        withLastAnswer: async (_m, _k, read) => read(),
        scope: { workspace, machine, machineOn, connected, session },
        workspaceMode,
        draftConfiguration: () => undefined,
        modoInicial,
        recordarModo: () => {},
      });
      store.installEffects();
      await store.refreshSurfaces(true);
      await store.refreshProviders();
      await store.readModels("claude");
      store.refreshCommands("claude");
      await tick();

      assert.deepEqual(calls, [], "no engine RPCs should fire while machineAvailability is no_machines");
      assert.deepEqual(store.superficies(), [], "surfaces should settle to empty array in no_machines");

      setAvailability(DESKTOP_AVAILABILITY);
      await tick();

      assert.ok(calls.includes("list_surfaces"), `expected list_surfaces on recovery, got: ${calls.join(", ")}`);
      assert.ok(calls.includes("list_providers"), `expected list_providers on recovery, got: ${calls.join(", ")}`);
      assert.ok(calls.includes("list_slash_menu"), `expected list_slash_menu on recovery, got: ${calls.join(", ")}`);
      assert.equal(store.superficies()?.length, 1);

      store.dispose();
    } finally {
      setCapabilities({ ...BASE_CAPS, nativeWindow: true, updater: true, localSetup: true, radiant: true });
      dispose();
    }
  });
});
