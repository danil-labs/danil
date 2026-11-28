export type SessionLists<T> = Record<string, T[]>;

/** Iguales campo a campo, para datos que vienen de `JSON.parse`. */
function mismoValor(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const claves = Object.keys(a);
  if (claves.length !== Object.keys(b).length) return false;
  return claves.every((c) =>
    mismoValor((a as Record<string, unknown>)[c], (b as Record<string, unknown>)[c]),
  );
}

/**
 * La fila que no cambió conserva su objeto.
 *
 * `For` de Solid reconcilia por referencia: con filas nuevas en cada refresco
 * destruye y reconstruye el DOM de la lista entera, y una animación de la fila
 * se vuelve a disparar sin que nada haya cambiado.
 */
export function conservar<T>(previous: T[], incoming: T[], key: (row: T) => string): T[] {
  if (previous.length === 0) return incoming;
  const antes = new Map(previous.map((row) => [key(row), row]));
  const kept = incoming.map((row) => {
    const anterior = antes.get(key(row));
    return anterior !== undefined && mismoValor(anterior, row) ? anterior : row;
  });
  // La lista entera también: una nueva con las mismas filas despierta a quien la mira.
  return kept.length === previous.length && kept.every((row, i) => row === previous[i]) ? previous : kept;
}

/**
 * `incoming` con lo que no cambió tomado de `previous`, a cualquier
 * profundidad: el `reconcile` de los stores de Solid para datos inmutables.
 * Un mensaje que cambió en un campo conserva sus pasos, destinatarios e
 * imágenes, y los `For` de dentro no remontan sus filas.
 */
export function reutilizar<T>(previous: T, incoming: T): T {
  if (previous === incoming) return previous;
  if (typeof previous !== "object" || typeof incoming !== "object" || previous === null || incoming === null) return incoming;
  if (Array.isArray(previous) !== Array.isArray(incoming)) return incoming;
  if (Array.isArray(incoming)) {
    const antes = previous as unknown[];
    let igual = antes.length === incoming.length;
    const out = incoming.map((v, i) => {
      const r = i < antes.length ? reutilizar(antes[i], v) : v;
      if (r !== antes[i]) igual = false;
      return r;
    });
    return (igual ? previous : out) as T;
  }
  const antes = previous as Record<string, unknown>;
  const ahora = incoming as Record<string, unknown>;
  const claves = Object.keys(ahora);
  let igual = claves.length === Object.keys(antes).length;
  const out: Record<string, unknown> = {};
  for (const c of claves) {
    out[c] = reutilizar(antes[c], ahora[c]);
    if (out[c] !== antes[c] || !(c in antes)) igual = false;
  }
  return (igual ? previous : out) as T;
}

/** Como `conservar`, por posición: para listas que solo crecen por el final y no tienen clave única. */
export function conservarEnOrden<T>(previous: T[], incoming: T[]): T[] {
  const kept = incoming.map((row, i) => (i < previous.length ? reutilizar(previous[i], row) : row));
  return kept.length === previous.length && kept.every((row, i) => row === previous[i]) ? previous : kept;
}

/** Como `conservar`, por la identidad que traen las filas: la ventana pudo soltar por cualquiera de sus bordes. */
export function conservarPorClave<T extends { clave?: string }>(previous: T[], incoming: T[]): T[] {
  const antes = new Map(previous.flatMap((row) => (row.clave ? [[row.clave, row] as const] : [])));
  const kept = incoming.map((row) => {
    const anterior = row.clave ? antes.get(row.clave) : undefined;
    return anterior !== undefined && mismoValor(anterior, row) ? anterior : row;
  });
  return kept.length === previous.length && kept.every((row, i) => row === previous[i]) ? previous : kept;
}

/** Como `conservarEnOrden`, alineando por el final: para cuando se antepone lo anterior. */
export function conservarPorElFinal<T>(previous: T[], incoming: T[]): T[] {
  const offset = incoming.length - previous.length;
  const kept = incoming.map((row, i) => {
    const j = i - offset;
    return j >= 0 && j < previous.length && mismoValor(previous[j], row) ? previous[j] : row;
  });
  return kept.length === previous.length && kept.every((row, i) => row === previous[i]) ? previous : kept;
}

/** Lo más que espera la barra a la lectura de una carpeta. */
export const READ_TIMEOUT = 20_000;
/** Cuántas carpetas lee a la vez la barra: evita ráfagas que saturen el límite del motor. */
export const READ_CONCURRENCY = 6;

// Descartar una respuesta cuando salió otra después deja la lista vacía si esa
// otra no vuelve; pintar vacío ante un fallo esconde las tareas hasta el
// siguiente aviso.
export function sessionRefresh<T>(options: {
  read: (project: string) => Promise<T[]>;
  apply: (update: (previous: SessionLists<T>) => SessionLists<T>) => void;
  projects: () => string[];
  /** Qué hace a una fila la misma fila entre dos lecturas. */
  key: (row: T) => string;
  schedule?: (run: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
  /** Cuánto espera `gathered` a juntar en una sola lectura los avisos que llegan seguidos. */
  gather?: number;
  /**
   * El tope de la lectura de una carpeta. La que no vuelve a tiempo cuenta como
   * fallida —se queda lo que había y se reintenta—: una carpeta colgada no
   * congela la barra entera.
   */
  timeout?: number;
  /** Tope de lecturas de carpeta simultáneas. */
  concurrency?: number;
  /**
   * Ventana opcional (ms) para juntar las carpetas de una misma oleada multi-carpeta en una sola
   * aplicación al estado: si todas contestan antes, pinta de golpe sin esperar; si una tarda más,
   * pinta juntas las rápidas al vencer la ventana para no congelar la barra.
   */
  coalesce?: number;
}) {
  const schedule = options.schedule ?? ((run, ms) => setTimeout(run, ms));
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const limit = Math.max(1, Math.floor(options.concurrency ?? READ_CONCURRENCY));
  const coalesce = Math.max(0, options.coalesce ?? 0);
  let generation = 0;
  let started = 0;
  // Por carpeta, el pedido más nuevo que ya se pintó: uno anterior que vuelve
  // tarde no la pisa, y no frena a las demás.
  const applied = new Map<string, number>();
  // Por carpeta, el pedido más nuevo encolado: una lectura que todavía espera
  // turno cuando ya salió otra más reciente se salta sin pegar al motor.
  const latestRequest = new Map<string, number>();
  const pendingRetry = new Set<string>();
  const waveTimers = new Set<unknown>();
  let active = 0;
  const waiters: ((acquired: boolean) => void)[] = [];
  let delay = 0;
  let retry: unknown;
  let batch: { projects: Set<string>; handle: unknown; waiting: (() => void)[] } | null = null;

  function release() {
    const next = waiters.shift();
    if (next) next(true);
    else active--;
  }

  function drainWaiters() {
    while (waiters.length > 0) waiters.shift()!(false);
  }

  function clearRetry() {
    if (retry === undefined) return;
    cancel(retry);
    retry = undefined;
  }

  /**
   * Lee cada carpeta y la pinta **en cuanto vuelve**, sin esperar a las demás:
   * la más lenta (otra máquina, una carpeta colgada hasta `timeout`) ya no
   * retrasa a la que acaba de cambiar. Las carpetas que no se leyeron se
   * quedan como estaban, así que releer solo una no borra el resto del riel;
   * las que ya no están en `projects()` se sueltan.
   */
  async function refresh(projects: string[]): Promise<void> {
    const current = generation;
    const request = ++started;
    const timeout = options.timeout ?? READ_TIMEOUT;
    const unique = [...new Set(projects)];
    for (const project of unique) latestRequest.set(project, request);
    const paintBatch = (entries: [string, T[] | null][]) => {
      if (current !== generation || entries.length === 0) return;
      const vigentes = new Set(options.projects());
      const valid = entries.filter(([project]) => vigentes.has(project) && request >= (applied.get(project) ?? 0));
      if (valid.length === 0) return;
      for (const [project, rows] of valid) {
        if (rows !== null) {
          applied.set(project, request);
          pendingRetry.delete(project);
        } else {
          pendingRetry.add(project);
        }
      }
      options.apply((previous) => {
        const next: SessionLists<T> = {};
        for (const [k, v] of Object.entries(previous)) if (vigentes.has(k)) next[k] = v;
        for (const [project, rows] of valid) {
          next[project] = rows === null
            ? previous[project] ?? []
            : conservar(previous[project] ?? [], rows, options.key);
        }
        return next;
      });
    };
    let remaining = unique.length;
    let coalescing = coalesce > 0 && unique.length > 1;
    let waveTimer: unknown;
    const buffered = new Map<string, T[] | null>();
    const flushWave = () => {
      if (waveTimer !== undefined) {
        cancel(waveTimer);
        waveTimers.delete(waveTimer);
        waveTimer = undefined;
      }
      if (buffered.size === 0) return;
      const entries = [...buffered.entries()];
      buffered.clear();
      paintBatch(entries);
    };
    const settleFolder = (project?: string, rows?: T[] | null) => {
      remaining--;
      if (project !== undefined && rows !== undefined) {
        if (!coalescing) {
          paintBatch([[project, rows]]);
          return;
        }
        buffered.set(project, rows);
      }
      if (!coalescing) return;
      if (remaining <= 0) {
        coalescing = false;
        flushWave();
      } else if (buffered.size > 0 && waveTimer === undefined) {
        const handle = schedule(() => {
          waveTimers.delete(handle);
          if (waveTimer === handle) waveTimer = undefined;
          coalescing = false;
          flushWave();
        }, coalesce);
        waveTimer = handle;
        waveTimers.add(handle);
      }
    };
    const results = await Promise.all(unique.map(async (project) => {
      if (active >= limit) {
        const acquired = await new Promise<boolean>((resolve) => { waiters.push(resolve); });
        if (!acquired) { settleFolder(); return null; }
        if (current !== generation || request < (latestRequest.get(project) ?? 0)) {
          release();
          settleFolder();
          return null;
        }
      } else {
        active++;
      }
      let handle: ReturnType<typeof setTimeout> | undefined;
      let rows: T[] | null;
      try {
        const late = new Promise<null>((done) => {
          handle = setTimeout(() => done(null), timeout);
        });
        rows = await Promise.race([options.read(project), late]);
      } catch {
        rows = null;
      } finally {
        clearTimeout(handle);
        release();
      }
      // Vieja: ya se pintó algo más nuevo de esta carpeta, o cambió el workspace.
      if (current !== generation || request < (applied.get(project) ?? 0)) {
        settleFolder();
        return null;
      }
      settleFolder(project, rows);
      return rows !== null;
    }));
    if (current !== generation) return;
    const vigentes = results.filter((ok): ok is boolean => ok !== null);
    if (vigentes.length === 0) return;
    const activeProjects = new Set(options.projects());
    for (const project of [...pendingRetry]) {
      if (!activeProjects.has(project)) pendingRetry.delete(project);
    }
    if (pendingRetry.size === 0) {
      clearRetry();
      delay = 0;
      return;
    }
    if (vigentes.every(Boolean)) return;
    clearRetry();
    delay = Math.min(delay === 0 ? 1000 : delay * 2, 30_000);
    retry = schedule(() => {
      retry = undefined;
      if (current !== generation) return;
      const toRetry = [...pendingRetry].filter((p) => options.projects().includes(p));
      if (toRetry.length > 0) void refresh(toRetry);
    }, delay);
  }

  function gathered(projects: string[]): Promise<void> {
    return new Promise((resolve) => {
      if (!batch) {
        const current = { projects: new Set<string>(), handle: undefined as unknown, waiting: [] as (() => void)[] };
        batch = current;
        current.handle = schedule(() => {
          batch = null;
          void refresh([...current.projects]).then(() => { for (const done of current.waiting) done(); });
        }, options.gather ?? 0);
      }
      for (const project of projects) batch.projects.add(project);
      batch.waiting.push(resolve);
    });
  }

  return {
    refresh,
    gathered,
    reset() {
      generation++;
      applied.clear();
      latestRequest.clear();
      pendingRetry.clear();
      drainWaiters();
      delay = 0;
      clearRetry();
      for (const timer of waveTimers) cancel(timer);
      waveTimers.clear();
      if (batch) {
        cancel(batch.handle);
        for (const done of batch.waiting) done();
        batch = null;
      }
    },
  };
}
