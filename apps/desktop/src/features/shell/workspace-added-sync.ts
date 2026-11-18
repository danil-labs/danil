/**
 * Los workspaces de Danil que la persona agregó al riel, por (persona, organización),
 * según `workspace-preferences-v1` con `added` (plan 2026-11-18 § 5 y § 6):
 * `GET /v1/workspaces/preferences`, `PUT`/`DELETE …/added/{engine_id}` y la siembra
 * atómica `PUT /v1/workspaces/preferences {added, if_version: 0}` (`409 already_initialized`).
 *
 * - 404, 501, `403 organization_selection_required`, 429, 503 o un error de red: sin lista de la
 *   cuenta. Se usa una lista local de agregados y se sube con la siembra cuando la ruta aparece.
 * - Se siembra solo con `version: 0`, la fuente asentada y una lista no vacía.
 * - Mientras no hay nada que decir (`added()` es `null`), el riel conserva lo que mostraba.
 */

export type PreferencesReply = { status: number; body?: unknown };
/** Una llamada por operación, sin reintentos; un error de red rechaza. */
export type AddedTransport = {
  get(): Promise<PreferencesReply>;
  put(id: string): Promise<PreferencesReply>;
  remove(id: string): Promise<PreferencesReply>;
  seed(added: readonly string[]): Promise<PreferencesReply>;
};
export type AddedScope = { person: string; organization: string };
export type PendingOp = { op: "add" | "remove"; id: string };
/** Lo guardado por (persona, organización): la lista local mientras falta la de la cuenta, y lo que falta subir. */
export type AddedRecord = { local: string[] | null; pending: PendingOp[] };
export type AddedStore = { read(key: string): AddedRecord | null; write(key: string, record: AddedRecord): void };

const ENGINE_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const RETRY_MS = 30_000;
const MAX = 500;

type Outcome = "ok" | "local" | "refused" | "conflict";

export function outcomeOf(reply: PreferencesReply): Outcome {
  if (reply.status >= 200 && reply.status < 300) return "ok";
  if (reply.status === 409) return "conflict";
  return reply.status === 422 ? "refused" : "local";
}

const codeOf = (reply: PreferencesReply) => {
  const code = (reply.body as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
};

/** El cuerpo del `GET`, tolerante: `version` y `added`; sin lista válida, `null`. */
export function parsePreferences(body: unknown): { version: number; added: string[] } | null {
  const raw = body as { version?: unknown; added?: unknown } | null;
  if (!raw || !Array.isArray(raw.added)) return null;
  const version = typeof raw.version === "number" && raw.version >= 0 ? raw.version : 0;
  return { version, added: [...new Set(raw.added.filter((id): id is string => typeof id === "string" && ENGINE_ID.test(id)))] };
}

/** Agrega una operación; una pendiente del mismo id se reemplaza: solo cuenta la última intención. */
export function enqueue(pending: readonly PendingOp[], next: PendingOp): PendingOp[] {
  return [...pending.filter((p) => p.id !== next.id), next];
}

const apply = (base: Iterable<string>, pending: readonly PendingOp[]) => {
  const out = new Set(base);
  for (const p of pending) p.op === "add" ? out.add(p.id) : out.delete(p.id);
  return out;
};

/**
 * La siembra: los de Danil que la fuente asentada sirve y que el riel pintaba en este equipo,
 * menos los ocultos locales. `null` sin evidencia previa: no se siembra nada y el riel sigue
 * mostrando los de la organización, como antes. Nunca hay siembra vacía.
 */
export function seedOf(available: readonly { id: string }[], shown: ReadonlySet<string>, hidden: ReadonlySet<string>): string[] | null {
  const ids = available.map((w) => w.id).filter((id) => ENGINE_ID.test(id));
  const seed = ids.filter((id) => shown.has(id) && !hidden.has(id)).slice(0, MAX);
  return seed.length ? seed : null;
}

/** Lo que el riel muestra sin evidencia: todos los de la organización menos los ocultos. */
const shownAll = (available: readonly { id: string }[], hidden: ReadonlySet<string>) =>
  available.map((w) => w.id).filter((id) => ENGINE_ID.test(id) && !hidden.has(id)).slice(0, MAX);

/** Una lista local vacía sin cambios de la persona viene de una siembra de antes, no de quitarlos: no cuenta. */
const validLocal = (record: AddedRecord) => (record.local && (record.local.length > 0 || record.pending.length > 0) ? record.local : null);

const keyOf = (scope: AddedScope) => `${scope.person}:${scope.organization}`;

export function createAddedSync(deps: {
  transport: AddedTransport;
  store: AddedStore;
  scope: () => AddedScope | null;
  /** Lo que sirve la organización activa, de `list_workspaces` en su máquina; `null` sin asentar. */
  available: () => readonly { id: string }[] | null;
  /** Evidencia previa de este equipo: lo que el riel pintaba (`workspaces.order`, el índice del motor). */
  shown: () => ReadonlySet<string>;
  /** Los ocultos locales (`workspaces.hidden`). */
  hidden: () => ReadonlySet<string>;
  /** La siembra respondió 204: los ids de Danil se pueden quitar de los ocultos locales. */
  onSeeded?: (ids: readonly string[]) => void;
  onChange: () => void;
  schedule?: (run: () => void, ms: number) => void;
}) {
  let server: { key: string; added: Set<string> } | null = null;
  let running: Promise<void> | null = null;
  let again = false;
  let retrying = false;
  const schedule = deps.schedule ?? ((run, ms) => void setTimeout(run, ms));
  const record = (key: string): AddedRecord => deps.store.read(key) ?? { local: null, pending: [] };
  const retry = () => {
    if (retrying) return;
    retrying = true;
    schedule(() => {
      retrying = false;
      void sync();
    }, RETRY_MS);
  };

  /**
   * Con qué se siembra: la lista local, la evidencia de este equipo o, si la persona ya cambió
   * algo, lo que el riel mostraba. `null` mientras no hay de dónde: el riel sigue como estaba.
   */
  function baseFor(key: string): string[] | null {
    const current = record(key);
    const local = validLocal(current);
    if (local) return local;
    const available = deps.available();
    if (!available) return null;
    return seedOf(available, deps.shown(), deps.hidden()) ?? (current.pending.length ? shownAll(available, deps.hidden()) : null);
  }

  /** Sin la cuenta: la lista local nace con la misma regla que la siembra, una vez asentada la fuente. */
  function keepLocal(key: string) {
    const current = record(key);
    if (validLocal(current)) return;
    const base = baseFor(key);
    deps.store.write(key, { ...current, local: base ? [...apply(base, current.pending)] : null });
    deps.onChange();
  }

  /** Sube lo pendiente en orden; `false` si hay que esperar al reintento. */
  async function flush(key: string): Promise<boolean> {
    for (;;) {
      const [first] = record(key).pending;
      if (!first) return true;
      const reply = await (first.op === "add" ? deps.transport.put(first.id) : deps.transport.remove(first.id));
      const outcome = outcomeOf(reply);
      if (outcome === "local") return false;
      if (outcome === "refused" && codeOf(reply) === "too_many") await prune(key);
      const after = record(key);
      deps.store.write(key, { ...after, pending: after.pending.filter((p) => p.id !== first.id || p.op !== first.op) });
    }
  }

  /** Con `422 too_many`, se quitan de la cuenta los ids que la fuente asentada ya no sirve. */
  async function prune(key: string) {
    const available = deps.available();
    if (!available || server?.key !== key) return;
    const served = new Set(available.map((w) => w.id));
    for (const id of [...server.added]) if (!served.has(id) && outcomeOf(await deps.transport.remove(id)) === "ok") server.added.delete(id);
  }

  async function once(): Promise<void> {
    const scope = deps.scope();
    if (!scope) {
      if (server) (server = null), deps.onChange();
      return;
    }
    const key = keyOf(scope);
    if (server && server.key !== key) (server = null), deps.onChange();
    // Un error de red cuenta como una ruta ausente.
    let seeding: string[] | null = null;
    const reply = await deps.transport.get().catch((): PreferencesReply => ({ status: 0 }));
    const read = outcomeOf(reply) === "ok" ? parsePreferences(reply.body) : null;
    if (!read) {
      keepLocal(key);
      return retry();
    }
    // Sin fila, o una fila en `version` 1 sin ids: quitar uno exige haberlo agregado antes, así que nunca tuvo nada.
    if (read.version === 0 || (read.version === 1 && read.added.length === 0)) {
      const base = baseFor(key);
      const current = record(key);
      if (!base) {
        // Sin evidencia (o sin fuente) no se siembra: el riel sigue mostrando los de la organización.
        if (current.local) deps.store.write(key, { ...current, local: null });
        server = null;
        deps.onChange();
        if (!deps.available()) retry();
        return;
      }
      const seed = [...apply(base, current.pending)];
      if (!seed.length) {
        // La persona los quitó todos antes de tener cuenta: se queda la lista local vacía, sin sembrar.
        deps.store.write(key, { ...current, local: [] });
        server = null;
        deps.onChange();
        return;
      }
      if (read.version === 0) {
        const sent = await deps.transport.seed(seed).catch((): PreferencesReply => ({ status: 0 }));
        const outcome = outcomeOf(sent);
        if (outcome === "ok") {
          deps.store.write(key, { local: null, pending: [] });
          server = { key, added: new Set(seed) };
          deps.onSeeded?.(seed);
          deps.onChange();
          return;
        }
        if (outcome === "conflict") return void (again = true);
        keepLocal(key);
        return retry();
      }
      // La fila ya existe vacía: la siembra va id por id.
      deps.store.write(key, { local: null, pending: seed.reduce((all, id) => enqueue(all, { op: "add", id }), current.pending.filter((p) => p.op !== "remove")) });
      seeding = seed;
    }
    // La lectura es de antes de subir lo pendiente: se le aplica lo que estaba pendiente al leer.
    const uploaded = record(key).pending;
    if (!(await flush(key))) {
      server = { key, added: apply(apply(read.added, uploaded), record(key).pending) };
      deps.onChange();
      return retry();
    }
    const current = record(key);
    if (current.local) deps.store.write(key, { ...current, local: null });
    server = { key, added: apply(apply(read.added, uploaded), record(key).pending) };
    if (seeding) deps.onSeeded?.(seeding);
    deps.onChange();
  }

  /** Lee y sube; una llamada durante otra pide una vuelta más, y la promesa cubre todas. */
  function sync(): Promise<void> {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await once().catch(() => retry());
      } while (again);
    })().finally(() => {
      running = null;
    });
    return running;
  }

  function change(id: string, op: PendingOp["op"]) {
    const scope = deps.scope();
    if (!scope) return;
    const key = keyOf(scope);
    const current = record(key);
    const kept = validLocal(current);
    const local = kept ? [...apply(kept, [{ op, id }])] : null;
    deps.store.write(key, { local, pending: enqueue(current.pending, { op, id }) });
    if (server?.key === key) op === "add" ? server.added.add(id) : server.added.delete(id);
    deps.onChange();
    void sync();
  }

  return {
    /** Los agregados de la organización activa; `null` si aún no se sabe (el riel no se vacía). */
    added: (): ReadonlySet<string> | null => {
      const scope = deps.scope();
      if (!scope) return null;
      const key = keyOf(scope);
      if (server?.key === key) return server.added;
      const local = validLocal(record(key));
      return local ? new Set(local) : null;
    },
    sync,
    add: (id: string) => change(id, "add"),
    remove: (id: string) => change(id, "remove"),
  };
}
