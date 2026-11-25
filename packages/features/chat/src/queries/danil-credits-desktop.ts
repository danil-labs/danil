import { listenDanilConnectionChange } from "../../../../host/src/danilConnectionEvents.ts";
import {
  edgeFetch,
  ORGANIZATION_CHANGED,
  readDeskSessionStatus,
  type DeskSessionStatus,
  type EdgeMethod,
  type EdgeReply,
} from "../../../../platform-client/src/client.ts";
import { getWorkspaces } from "../../../../platform-client/src/workspaces.ts";
import { callEngine } from "../../../../engine-client/src/client.ts";
import { availableDanilCredits, type DanilCreditsSource } from "../model/danil-credits.ts";
import { readCreditsBalance } from "../../../../platform-client/src/treasury.ts";

// Presupuesto de reintentos para las dos lecturas de una misma tarjeta.
const RETRY_BUDGET_MS = 5_000;

type ListedWorkspaces = {
  active: string | null;
  workspaces?: Array<{ id?: string; account?: { org?: string | null } | null }>;
};

export type DesktopCreditsDeps = {
  listWorkspaces?: () => Promise<ListedWorkspaces>;
  readSessionStatus?: () => Promise<DeskSessionStatus | null>;
  sendEdge?: <T = unknown>(
    method: EdgeMethod,
    path: string,
    body?: unknown,
    idempotencyKey?: string,
    context?: string,
  ) => Promise<EdgeReply<T>>;
};

function contextsByOrg(status: DeskSessionStatus | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!status || !Array.isArray(status.sessions)) return map;
  for (const family of status.sessions) {
    if (!Array.isArray(family.contexts)) continue;
    for (const entry of family.contexts) {
      if (typeof entry.org === "string" && entry.org && typeof entry.context_id === "string" && entry.context_id) {
        if (!map.has(entry.org)) map.set(entry.org, entry.context_id);
      }
    }
  }
  return map;
}

/** Solo un vínculo publicado por Workspaces atribuye el saldo al workspace del motor. */
export function createDesktopCredits(deps: DesktopCreditsDeps = {}): DanilCreditsSource {
  const listWorkspaces = deps.listWorkspaces ?? (() => callEngine<ListedWorkspaces>("list_workspaces"));
  const readStatus = deps.readSessionStatus ?? readDeskSessionStatus;
  const sendEdge = deps.sendEdge ?? edgeFetch;

  return {
    async readBalance(signal) {
      const listed = await listWorkspaces();
      const active = listed.active;
      if (!active || signal.aborted) return null;

      const sealedOrg = listed.workspaces?.find((row) => row.id === active)?.account?.org ?? null;
      const status = await readStatus();
      if (signal.aborted) return null;

      const orgContexts = contextsByOrg(status);
      const transportFor = (context?: string) => ({
        send: <T = unknown>(method: EdgeMethod, path: string, body?: unknown, idempotencyKey?: string) =>
          sendEdge<T>(method, path, body, idempotencyKey, context),
      });

      const deadline = Date.now() + RETRY_BUDGET_MS;
      const patience = () => ({ signal, retryBudgetMs: Math.max(0, deadline - Date.now()) });

      const preferredContext = sealedOrg ? orgContexts.get(sealedOrg) : undefined;
      const candidates: Array<string | undefined> = preferredContext
        ? [preferredContext]
        : [undefined, ...new Set(orgContexts.values())];

      let boundOrg: string | null = null;
      let boundContext: string | undefined;
      for (const candidate of candidates) {
        if (signal.aborted) return null;
        try {
          const directory = await getWorkspaces(patience(), transportFor(candidate));
          const bound = directory.body.items?.find((row) => row.engine_workspace_id === active);
          if (bound?.org) {
            boundOrg = bound.org;
            boundContext = orgContexts.get(bound.org) ?? candidate;
            break;
          }
        } catch {
          if (signal.aborted) return null;
        }
      }

      if (!boundOrg || signal.aborted) return null;

      const reply = await readCreditsBalance(patience(), transportFor(boundContext));
      return !signal.aborted && reply.status === 200 ? availableDanilCredits(reply.body, boundOrg) : null;
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
}

export const desktopCredits: DanilCreditsSource = createDesktopCredits();
