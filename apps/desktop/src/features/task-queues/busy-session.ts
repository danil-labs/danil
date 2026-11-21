import { createEffect, onCleanup, onMount } from "solid-js";

type Queues = {
  items: () => readonly unknown[];
  retained: () => string | null;
  retain: (reason: null) => void;
  savedEntries: () => [string, { retained: string | null }][];
};

/**
 * The window's own wait for a task that another turn holds (`session`): it asks
 * `queue_ready` each second for the queue in hand, and drains the hidden ones.
 * Off where the engine dispatches the queue.
 */
export function waitForBusySessions(deps: {
  queues: Queues;
  session: () => string | null;
  project: () => string;
  generation: () => number;
  ready: (project: string, session: string) => Promise<boolean>;
  engineDispatches: (session: string) => boolean;
  drain: (session: string) => void;
}) {
  createEffect(() => {
    const id = deps.session();
    if (deps.queues.retained() !== "session" || !deps.queues.items().length || !id || deps.engineDispatches(id)) return;
    const project = deps.project(), generation = deps.generation();
    let cancelled = false, checking = false;
    const timer = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        const ready = await deps.ready(project, id);
        if (ready && !cancelled && generation === deps.generation() && id === deps.session()) deps.queues.retain(null);
      } catch {
        // A failed read does not prove that the task is free.
      } finally {
        checking = false;
      }
    }, 1000);
    onCleanup(() => { cancelled = true; clearInterval(timer); });
  });
  onMount(() => {
    const timer = setInterval(() => {
      for (const [session, queued] of deps.queues.savedEntries()) if (queued.retained === "session") deps.drain(session);
    }, 1000);
    onCleanup(() => clearInterval(timer));
  });
}
