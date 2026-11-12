import { canonicalAgentId, isFreeRouterAgent, routerOfferState, type RouterOfferState } from "@terminus/tasks";
import type { FreeModels } from "./engine.ts";

/** La fila del Router en el selector; `null` es que todavía no se preguntó a la máquina. */
export function freeRouterState(rows: readonly FreeModels[] | null): RouterOfferState {
  if (rows === null) return routerOfferState(undefined, null);
  const row = rows.find((r) => isFreeRouterAgent(canonicalAgentId(r.provider, "danil-free/")));
  return routerOfferState(row?.policy ? { enabled: row.policy.enabled, accepted: row.accepted } : null, row ? row.usable : null);
}
