import type { JournalEvent } from "../../../../apps/desktop/src/lib/serviceEvents";
export type PushedBatch = { events?: JournalEvent[]; catchup?: string; resync?: string; replay?: boolean; replayId?: string; cursor?: number | null; runtime?: string };
export type ServicePage = { cursor: number | null; gap: boolean; resync?: boolean; streams?: boolean; replay: boolean; runtime: string; reset: boolean; push?: boolean; batches?: PushedBatch[] };
