import { listenDanilConnectionChange } from "../../../../host/src/danilConnectionEvents.ts";
import { edgeFetch, ORGANIZATION_CHANGED } from "../../../../platform-client/src/client";
import { getWorkspaces } from "../../../../platform-client/src/workspaces";
import { callEngine } from "../../../../engine-client/src/client";
import { availableDanilCredits, type DanilCreditsSource } from "../model/danil-credits";
import { readCreditsBalance } from "../../../../platform-client/src/treasury";

// Presupuesto de reintentos para las dos lecturas de una misma tarjeta.
const RETRY_BUDGET_MS = 5_000;

/** Solo un vínculo publicado por Workspaces atribuye el saldo al workspace del motor. */
export const desktopCredits: DanilCreditsSource = {
  async readBalance(signal) {
    const { active } = await callEngine<{ active: string | null }>("list_workspaces");
    if (!active || signal.aborted) return null;

    const deadline = Date.now() + RETRY_BUDGET_MS;
    const patience = () => ({ signal, retryBudgetMs: Math.max(0, deadline - Date.now()) });
    const transport = { send: edgeFetch };
    const directory = await getWorkspaces(patience(), transport);
    // El contrato deja `items` opcional; se lee igual que antes.
    const bound = directory.body.items!.find((row) => row.engine_workspace_id === active);
    if (!bound?.org || signal.aborted) return null;

    const reply = await readCreditsBalance(patience(), transport);
    return !signal.aborted && reply.status === 200 ? availableDanilCredits(reply.body, bound.org) : null;
  },

  subscribe(changed) {
    const events = ["harness:workspace", ORGANIZATION_CHANGED];
    for (const event of events) window.addEventListener(event, changed);
    const connection = listenDanilConnectionChange(changed).catch(() => undefined);
    return () => {
      for (const event of events) window.removeEventListener(event, changed);
      void connection.then((stop) => stop?.());
    };
  },
};
