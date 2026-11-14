/** Una lista que no se pudo leer se vuelve a pedir sola en ≤ 30 s, un intento a la vez; desmontar la para (regla 10). */
export const RECOVERY_DELAYS_MS = [10_000, 20_000, 30_000];

type Schedule = (run: () => void, ms: number) => () => void;
const timer: Schedule = (run, ms) => {
  const t = setTimeout(run, ms);
  return () => clearTimeout(t);
};

export function createListRecovery(run: () => void, schedule: Schedule = timer) {
  let attempt = 0;
  let cancel: (() => void) | null = null;
  let stopped = false;
  const clear = () => {
    cancel?.();
    cancel = null;
  };
  return {
    failed() {
      if (stopped) return;
      clear();
      cancel = schedule(() => {
        cancel = null;
        if (!stopped) run();
      }, RECOVERY_DELAYS_MS[Math.min(attempt++, RECOVERY_DELAYS_MS.length - 1)]);
    },
    succeeded() {
      attempt = 0;
      clear();
    },
    stop() {
      stopped = true;
      clear();
    },
  };
}
