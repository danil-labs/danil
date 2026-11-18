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
 * menos los ocultos locales. Una cuenta sin evidencia previa da `[]`: empieza vacía.
 */
export function seedOf(available: readonly { id: string }[], shown: ReadonlySet<string>, hidden: ReadonlySet<string>): string[] {
  return available.map((w) => w.id).filter((id) => shown.has(id) && !hidden.has(id) && ENGINE_ID.test(id)).slice(0, MAX);
}

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

  /** Sin la cuenta: la lista local nace de la misma siembra, una vez asentada la fuente. */
  function keepLocal(key: string) {
    const current = record(key);
    if (current.local) return;
    const available = deps.available();
    if (!available) return;
    const seed = seedOf(available, deps.shown(), deps.hidden());
    deps.store.write(key, { ...current, local: [...apply(seed, current.pending)] });
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
    const reply = await deps.transport.get().catch((): PreferencesReply => ({ status: 0 }));
    const read = outcomeOf(reply) === "ok" ? parsePreferences(reply.body) : null;
    if (!read) {
      keepLocal(key);
      return retry();
    }
    if (read.version === 0) {
      const current = record(key);
      const available = deps.available();
      if (!current.local && !available) {
        // Sin fuente asentada no se decide nada: el riel conserva lo que mostraba.
        server = null;
        return retry();
      }
      const base = current.local ?? seedOf(available ?? [], deps.shown(), deps.hidden());
      const seed = [...apply(base, current.pending)];
      if (seed.length) {
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
        if (outcome === "local") {
          keepLocal(key);
          return retry();
        }
      }
      // Cuenta nueva o siembra vacía: nada en la cuenta todavía; lo que se agregue la crea.
      deps.store.write(key, { ...record(key), local: null });
    }
    if (!(await flush(key))) {
      server = { key, added: apply(read.added, record(key).pending) };
      deps.onChange();
      return retry();
    }
    const current = record(key);
    if (current.local) deps.store.write(key, { ...current, local: null });
    server = { key, added: apply(read.added, record(key).pending) };
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
    const local = current.local ? [...apply(current.local, [{ op, id }])] : null;
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
      const current = record(key);
      return current.local ? new Set(current.local) : null;
    },
    sync,
    add: (id: string) => change(id, "add"),
    remove: (id: string) => change(id, "remove"),
  };
}
