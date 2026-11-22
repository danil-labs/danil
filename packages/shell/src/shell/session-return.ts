/** Foco y visibilidad del mismo regreso a la ventana comparten una lectura. */
export function coalesceSessionReturn(refresh: () => Promise<void>, schedule: (run: () => void, ms: number) => unknown = setTimeout) {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    schedule(() => {
      queued = false;
      void refresh();
    }, 50);
  };
}
