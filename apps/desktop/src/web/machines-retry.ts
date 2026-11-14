/** Tras «sin acceso» la lista de máquinas se vuelve a pedir sola, con espera acotada; un 401 o cerrar la ventana la paran. */
export const RETRY_FIRST_MS = 15_000;
export const RETRY_CEILING_MS = 5 * 60_000;

/** La espera del intento `attempt`: 15 s, 30 s, 60 s… con jitter de ±10 % y nunca por encima del tope. */
export function retryDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(RETRY_CEILING_MS, RETRY_FIRST_MS * 2 ** Math.min(attempt, 16));
  return Math.min(RETRY_CEILING_MS, Math.round(base * (0.9 + 0.2 * random())));
}

type Schedule = (run: () => void, ms: number) => () => void;
const timer: Schedule = (run, ms) => {
  const t = setTimeout(run, ms);
  return () => clearTimeout(t);
};

/** Un solo reintento programado a la vez; `run` es la lectura single-flight de la ventana. */
export function createMachinesRetry(run: () => void, schedule: Schedule = timer, random?: () => number) {
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
      }, retryDelay(attempt++, random));
    },
    succeeded() {
      attempt = 0;
      clear();
    },
    stop() {
      stopped = true;
      clear();
    },
    pending: () => cancel !== null,
  };
}
