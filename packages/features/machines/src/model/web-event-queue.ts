import type { JournalEvent } from "../../../../host/src/serviceEvents.ts";
import type { PushedBatch, ServicePage } from "../../../../ui/src/lib/service-page.ts";

/** A paused tab cannot retain an unbounded journal; overflow becomes an explicit resync. */
const MAX_BYTES = 2 * 1024 * 1024;
const POLL_WAIT = 20_000;
export function createWebEventQueue(limit = MAX_BYTES) {
  let batches: PushedBatch[] = [], bytes = 0, cursor = 0, gap = false, resync = false, closed = false;
  const waiting = new Set<() => void>();
  const page = (): ServicePage => {
    const result = { cursor: ++cursor, gap, resync, replay: false, runtime: "fleet", reset: false, push: false, batches };
    batches = []; bytes = 0; gap = false; resync = false;
    return result;
  };
  return {
    push(events: JournalEvent[], context: { replay?: boolean; replayId?: string; cursor?: number | null; runtime?: string; gap?: boolean; resync?: boolean } = {}) {
      if (closed) return;
      gap ||= context.gap === true;
      resync ||= context.resync === true;
      if (events.length) {
        const batch = { events, replay: context.replay, cursor: context.cursor, runtime: context.runtime, replayId: context.replayId };
        const size = JSON.stringify(batch).length * 2;
        if (bytes + size > limit) { batches = []; bytes = 0; gap = true; }
        if (size <= limit) { batches.push(batch); bytes += size; }
      }
      if (batches.length || gap || resync) for (const finish of [...waiting]) finish();
    },
    poll(): Promise<ServicePage> {
      if (closed || batches.length || gap || resync) return Promise.resolve(page());
      return new Promise(done => {
        const finish = () => { clearTimeout(timer); waiting.delete(finish); done(page()); };
        const timer = setTimeout(finish, POLL_WAIT);
        waiting.add(finish);
      });
    },
    close() {
      closed = true; batches = []; bytes = 0; gap = false; resync = false;
      for (const finish of [...waiting]) finish();
    },
  };
}
