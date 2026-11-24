import assert from "node:assert/strict";
import { test } from "node:test";

// Lo que `proxy` (`cli/service/mod.rs`) rechaza cuando la ventana ya tiene su
// tope de órdenes en vuelo: la orden no llegó al servicio.
const saturated = { what: { clave: "shell.service.busy" }, detail: "service_busy" };

type Call = { command: string; args: unknown };

// El `invoke` de Tauri llama a esto; así se prueba el camino real de la ventana.
function window(busyFor: number) {
  const calls: Call[] = [];
  const saved = new Map<string, boolean>();
  (globalThis as { window?: unknown }).window = {
    __TAURI_INTERNALS__: {
      invoke: async (command: string, args: { project: string; name: string }) => {
        calls.push({ command, args });
        if (calls.filter((c) => c.command === command).length <= busyFor) throw saturated;
        const key = `${args.project}/${args.name}`;
        if (command === "telegram_set_token") saved.set(key, true);
        if (command === "telegram_set_token" || command === "telegram_status") {
          return { token_saved: saved.get(key) ?? false, pairing: null };
        }
        throw new Error(`orden inesperada: ${command}`);
      },
    },
  };
  return { calls, saved };
}

test("saving the token of an agent with no conversation survives a saturated window", async () => {
  const { calls, saved } = window(2);
  const { invoke } = await import("../../../../packages/engine-client/src/client.ts");
  const agent = { project: "gfe8ehsg", name: "daneel-po" };
  await invoke("telegram_set_token", { ...agent, token: "123:abc" });
  const status = await invoke<{ token_saved: boolean }>("telegram_status", agent);
  assert.equal(saved.get("gfe8ehsg/daneel-po"), true);
  assert.equal(status.token_saved, true);
  assert.equal(calls.filter((c) => c.command === "telegram_set_token").length, 3);
});
