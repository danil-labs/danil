import type { HistoryChunk, HistoryRef } from "@terminus/protocol";
import { invoke } from "../../../../engine-client/src/client.ts";
import { machineOf } from "../../../machines/src/queries/store";
import type { Session } from "../model/transcript";

export const readTurns = (ref: (HistoryRef)) => (before: number) =>
  invoke<(Session)>(
    "load_session",
    { project: ref.project, id: ref.session, history_request: { version: 1, before, revision: null } },
    machineOf(ref.session),
  );

export const readDetailChunk = (
  ref: (HistoryRef),
  history_request: unknown,
): Promise<(HistoryChunk)> =>
  invoke<(HistoryChunk)>(
    "load_session",
    { project: ref.project, id: ref.session, history_request },
    machineOf(ref.session),
  );
