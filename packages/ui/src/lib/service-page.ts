import type { JournalEvent } from "../../../../apps/desktop/src/lib/serviceEvents";
export type PushedBatch = { events?: JournalEvent[]; catchup?: string; resync?: string; replay?: boolean; replayId?: string; cursor?: number | null; runtime?: string };
export type ServicePage = { cursor: number | null; gap: boolean; resync?: boolean; streams?: boolean; replay: boolean; runtime: string; reset: boolean; push?: boolean; batches?: PushedBatch[] };
export type PollRequest = { cursor: number | null; workspace: null; replay: boolean; runtime: string | null };
export type ServiceFailure = "sleep" | "missing" | "managed" | "down" | "unavailable";
export type ConnectionMessage = "shell.service.engine_missing" | "shell.service.managed" | "shell.service.engine_down" | "chat.error.service_unavailable";
export type Clock = { now: () => number; schedule: (run: () => void, delay: number) => unknown; cancel: (handle: unknown) => void; microtask: (run: () => void) => void };
export type ServiceStreamDeps = {
  ready: () => Promise<unknown>;
  read: (request: PollRequest) => Promise<ServicePage>;
  filter: (sessions: string[]) => Promise<unknown>;
  visibleSessions: () => string[];
  applyBatches: (batches: PushedBatch[]) => void;
  applyPage: (page: ServicePage, recovered: boolean) => void;
  classifyFailure: (error: unknown) => ServiceFailure;
  connectionStatus: (message: ConnectionMessage | null) => void;
  clock?: Clock;
};
