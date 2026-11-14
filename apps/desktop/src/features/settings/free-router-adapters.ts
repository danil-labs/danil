/** El motor y el borde que usa el cliente del Free router de plataforma, en Desk (Rust) y en la web (cookie). */
import { EdgeError, type EdgeTransport } from "@terminus/computers";
import type { InvokeOptions } from "@tauri-apps/api/core";
import { edgeFetch } from "../../lib/edge.ts";
import { invoke } from "../../lib/invoke.ts";
import type { EdgeSend, EngineCall } from "./free-router-platform.ts";

/** Las órdenes RPC1 del pase y la lista de workspaces, cada una por su nombre, al motor (`options` lleva su ámbito). */
export function freeRouterEngine(options?: InvokeOptions): EngineCall {
  const orders: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
    set_free_router_union: (args) => invoke("set_free_router_union", args, options),
    free_router_binding: (args) => invoke("free_router_binding", args, options),
    prove_free_router_binding: (args) => invoke("prove_free_router_binding", args, options),
    set_free_router_grant: (args) => invoke("set_free_router_grant", args, options),
    clear_free_router_grant: (args) => invoke("clear_free_router_grant", args, options),
    release_free_router_owner: (args) => invoke("release_free_router_owner", args, options),
    list_workspaces: () => invoke("list_workspaces", undefined, options),
  };
  return (command, args) => orders[command]?.(args) ?? Promise.reject("free_router.invalid_request");
}

/** Lo que anuncia el motor de la máquina de ese workspace, según `machine_list`; sin dato, nada. */
export async function freeRouterFeatures(policy: { destination_machine?: string }): Promise<readonly string[]> {
  const machines = await invoke<{ id: string; active?: boolean; features?: readonly string[] }[]>("machine_list");
  const machine = machines.find((m) => (policy.destination_machine ? m.id === policy.destination_machine : m.active));
  return machine?.features ?? [];
}

/** Desk: `danil_edge_fetch` pone el Bearer en Rust y contesta el status tal cual; sin red rechaza y se reintenta. */
export const freeRouterDeskEdge: EdgeSend = async (method, path, body, key) => {
  const reply = await edgeFetch(method, path, body, key);
  return { status: reply.status, body: reply.body, ...(reply.retry_after_ms === undefined ? {} : { retryAfterMs: reply.retry_after_ms }) };
};

/** La web: la cookie y el CSRF de `edgeTransport`; un `EdgeError` vuelve a ser un status con su código. */
export function freeRouterWebEdge(transport: EdgeTransport): EdgeSend {
  return async (method, path, body, key) => {
    const relative = path.replace(/^\/v1\//, "");
    try {
      const response = method === "GET"
        ? await transport.call(relative)
        : await transport.mutation(relative, {
          method,
          headers: { ...(key ? { "Idempotency-Key": key } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      const text = response.status === 204 ? "" : await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    } catch (e) {
      if (!(e instanceof EdgeError)) throw e;
      const seconds = e.retryAfter && /^\d+$/.test(e.retryAfter) ? Number(e.retryAfter) * 1000 : undefined;
      return { status: e.status, body: e.code ? { code: e.code } : null, ...(seconds === undefined ? {} : { retryAfterMs: seconds }) };
    }
  };
}
