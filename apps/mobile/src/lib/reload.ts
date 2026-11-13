/**
 * Una lectura que se repite sola mientras la respuesta pida reintento (un 404/501 del plano de
 * control, la red caída), con espera creciente y techo. Una respuesta buena reinicia la espera y
 * una lectura que llega tarde no pisa a una más nueva. Sin React: se prueba en Node.
 */
type Options<T> = {
  retry: (value: T) => boolean;
  /** Lo que se entrega si la lectura lanza; sin él, el error se propaga. */
  fallback?: () => T;
  schedule?: (run: () => void, ms: number) => () => void;
  first: number;
  max: number;
};

const defaultSchedule = (run: () => void, ms: number) => {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
};

export function retryingRead<T>(read: () => Promise<T>, deliver: (value: T) => void, options: Options<T>) {
  const schedule = options.schedule ?? defaultSchedule;
  let wait = options.first;
  let generation = 0;
  let cancel: (() => void) | null = null;
  const clear = () => {
    cancel?.();
    cancel = null;
  };

  async function run(): Promise<void> {
    clear();
    const mine = ++generation;
    let value: T;
    try {
      value = await read();
    } catch (error) {
      if (!options.fallback) throw error;
      value = options.fallback();
    }
    if (mine !== generation) return;
    deliver(value);
    if (!options.retry(value)) {
      wait = options.first;
      return;
    }
    const delay = wait;
    wait = Math.min(wait * 2, options.max);
    cancel = schedule(() => void run(), delay);
  }

  return {
    run,
    stop() {
      generation++;
      clear();
    },
  };
}
