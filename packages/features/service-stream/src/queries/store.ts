import type { PushedBatch, ServicePage } from "../../../../ui/src/lib/service-page.ts";
export type { PushedBatch, ServicePage };
import type { Clock, PollRequest, ServiceFailure, ConnectionMessage, ServiceStreamDeps as Dependencies } from "../../../../ui/src/lib/service-page.ts"; export type { PollRequest, ServiceFailure, ConnectionMessage };
const defaultClock: Clock = {
  now: Date.now,
  schedule: (run, delay) => setTimeout(run, delay),
  cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  microtask: queueMicrotask,
};
/** The engine journal cursor, polling lifecycle and deduplicated stream subscription. */
export function createServiceStream(deps: Dependencies) {
  const clock = deps.clock ?? defaultClock;
  let cursor: number | null = null, replay = true, runtime: string | null = null;
  let timer: unknown, disposed = false, started = false, pushed = false;
  let failingSince: number | null = null;
  let paged = false, filterQueued = false, sentFilter: string | null = null;
  function filterChanged() {
    if (disposed || !paged || filterQueued) return;
    filterQueued = true;
    clock.microtask(() => {
      filterQueued = false;
      if (disposed || !paged) return;
      const sessions = deps.visibleSessions();
      const key = sessions.join("\n");
      if (key === sentFilter) return;
      sentFilter = key;
      void deps.filter(sessions).catch(() => { if (!disposed) sentFilter = null; });
    });
  }
  async function poll() {
    await Promise.resolve();
    await deps.ready();
    if (disposed) return;
    pushed = false;
    try {
      const page = await deps.read({ cursor, workspace: null, replay, runtime });
      if (disposed) return;
      if (page.batches) deps.applyBatches(page.batches);
      if (disposed) return;
      pushed = page.push === true;
      if (pushed !== paged) { paged = pushed; sentFilter = null; filterChanged(); }
      cursor = page.cursor; replay = page.replay; runtime = page.runtime;
      deps.applyPage(page, failingSince !== null);
      if (disposed) return;
      if (failingSince !== null) { failingSince = null; deps.connectionStatus(null); }
    } catch (error) {
      if (disposed) return;
      failingSince ??= clock.now();
      const failure = deps.classifyFailure(error);
      if (failure === "sleep") { deps.connectionStatus(null); return; }
      if (clock.now() - failingSince > (failure === "unavailable" ? 10_000 : 2_000)) {
        deps.connectionStatus(failure === "missing" ? "shell.service.engine_missing" : failure === "managed" ? "shell.service.managed" : failure === "down" ? "shell.service.engine_down" : "chat.error.service_unavailable");
      }
    } finally {
      if (!disposed) timer = clock.schedule(() => void poll(), pushed ? 0 : 250);
    }
  }
  return {
    paged: () => paged,
    filterChanged,
    start: () => { if (!disposed && !started) { started = true; void poll(); } },
    dispose: () => { disposed = true; if (timer !== undefined) clock.cancel(timer); },
  };
}
