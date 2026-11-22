import type { HistoryChunk, HistoryRef } from "../../../../engine-client/src/index.ts";
import { invoke } from "../../../../engine-client/src/client.ts";
import type { Session } from "../model/transcript";

export type MachineRoute = { headers: Record<string, string> } | undefined;
export type MachineOf = (id: string | null | undefined) => MachineRoute;

export const readTurns = (ref: (HistoryRef), route: MachineOf) => (before: number) =>
  invoke<(Session)>(
    "load_session",
    { project: ref.project, id: ref.session, history_request: { version: 1, before, revision: null } },
    route(ref.session),
  );

export const readDetailChunk = (
  ref: (HistoryRef),
  history_request: unknown,
  route: MachineOf,
): Promise<(HistoryChunk)> =>
  invoke<(HistoryChunk)>(
    "load_session",
    { project: ref.project, id: ref.session, history_request },
    route(ref.session),
  );
