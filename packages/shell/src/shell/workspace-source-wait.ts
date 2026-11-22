export function createWorkspaceSourceWait<T>(read: () => Promise<unknown>, changed: () => void, clock = { set: (run: () => void) => setTimeout(run, 10000), clear: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer) }) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rows: readonly T[] | null = null;
  let timedOut = false;
  const cancel = () => { if (timer !== undefined) clock.clear(timer); timer = undefined; };
  return {
    update(next: readonly T[] | null) {
      rows = next;
      if (next !== null) { cancel(); timedOut = false; }
      else if (timer === undefined && !timedOut) timer = clock.set(() => { timer = undefined; timedOut = true; changed(); });
    },
    view: () => ({ rows, timedOut }),
    retry: () => {
      cancel(); timedOut = false;
      timer = clock.set(() => { timer = undefined; timedOut = true; changed(); });
      changed();
      return read();
    },
    dispose: cancel,
  };
}
