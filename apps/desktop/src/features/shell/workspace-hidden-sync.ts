/**
 * Los ocultos del riel que viajan con la cuenta (`workspace-preferences-v1`):
 * `GET /v1/workspaces/preferences` y `PUT`/`DELETE …/hidden/{engine_id}`.
 *
 * - La cuenta manda solo sobre los ids que sirve la máquina de la organización activa;
 *   los demás (locales y de otras cuentas) siguen siendo solo locales.
 * - 404, 501, `403 organization_selection_required`, 429, 503 o un error de red: solo local,
 *   sin error visible, con reintento. Un 422 descarta esa operación.
 * - Sin conexión, los cambios quedan como operaciones pendientes, en orden.
 * - La primera vez por (persona, organización) sube los ocultos locales de esa organización.
 */

export type PreferencesReply = { status: number; body?: unknown };
/** Una llamada por operación, sin reintentos; un error de red rechaza. */
export type PreferencesTransport = {
  get(): Promise<PreferencesReply>;
  put(id: string): Promise<PreferencesReply>;
  remove(id: string): Promise<PreferencesReply>;
};
export type SyncScope = { person: string; organization: string; served: ReadonlySet<string> };
export type PendingOp = { op: "add" | "remove"; id: string };
/** Lo guardado por (persona, organización): si ya migró y lo que falta subir. */
export type SyncRecord = { migrated: boolean; pending: PendingOp[] };
export type SyncStore = { read(key: string): SyncRecord | null; write(key: string, record: SyncRecord): void };

const ENGINE_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const RETRY_MS = 30_000;

type Outcome = "ok" | "local" | "refused";

/** Qué hacer con una respuesta: 2xx vale, 422 se descarta, lo demás es «solo local». */
export function outcomeOf(reply: PreferencesReply): Outcome {
  if (reply.status >= 200 && reply.status < 300) return "ok";
  return reply.status === 422 ? "refused" : "local";
}

/** `hidden` del cuerpo, tolerante: campos desconocidos se ignoran; sin lista válida, `null`. */
export function parseHidden(body: unknown): string[] | null {
  const hidden = (body as { hidden?: unknown } | null)?.hidden;
  if (!Array.isArray(hidden)) return null;
  return [...new Set(hidden.filter((id): id is string => typeof id === "string" && ENGINE_ID.test(id)))];
}

/** Los ocultos efectivos: los de la cuenta para lo que sirve la organización, los locales para lo demás. */
export function effectiveHidden(local: ReadonlySet<string>, account: ReadonlySet<string> | null, served: ReadonlySet<string>): Set<string> {
  if (!account) return new Set(local);
  const found = new Set([...local].filter((id) => !served.has(id)));
  for (const id of account) if (served.has(id)) found.add(id);
  return found;
}

/** Agrega una operación; una pendiente del mismo id se reemplaza: solo cuenta la última intención. */
export function enqueue(pending: readonly PendingOp[], next: PendingOp): PendingOp[] {
  return [...pending.filter((p) => p.id !== next.id), next];
}

const keyOf = (scope: SyncScope) => `${scope.person}:${scope.organization}`;
/** Los cambios hechos antes de saber persona y organización: el primer alcance toma los que sirve. */
const UNSCOPED = "*";

export function createHiddenSync(deps: {
  transport: PreferencesTransport;
  store: SyncStore;
  scope: () => SyncScope | null;
  /** Los ocultos de este equipo, para la migración inicial. */
  local: () => ReadonlySet<string>;
  /** Cambió lo que la cuenta dice: el riel se repinta. */
  onChange: () => void;
  schedule?: (run: () => void, ms: number) => void;
}) {
  let account: { key: string; hidden: Set<string> } | null = null;
  let running: Promise<void> | null = null;
  let again = false;
  let retrying = false;
  const schedule = deps.schedule ?? ((run, ms) => void setTimeout(run, ms));
  const record = (key: string): SyncRecord => deps.store.read(key) ?? { migrated: false, pending: [] };

  const retry = () => {
    if (retrying) return;
    retrying = true;
    schedule(() => {
      retrying = false;
      void sync();
    }, RETRY_MS);
  };

  /** Sube lo pendiente en orden; `false` si hay que esperar al reintento. */
  async function flush(key: string): Promise<boolean> {
    for (;;) {
      const current = record(key);
      const [first] = current.pending;
      if (!first) return true;
      const outcome = outcomeOf(await (first.op === "add" ? deps.transport.put(first.id) : deps.transport.remove(first.id)));
      if (outcome === "local") return false;
      const after = record(key);
      // Una intención igual que llegó mientras tanto ya quedó aplicada con esta.
      deps.store.write(key, { ...after, pending: after.pending.filter((p) => p.id !== first.id || p.op !== first.op) });
    }
  }

  async function once(): Promise<void> {
    const scope = deps.scope();
    if (!scope) {
      if (account) (account = null), deps.onChange();
      return;
    }
    const key = keyOf(scope);
    if (account && account.key !== key) (account = null), deps.onChange();
    const early = deps.store.read(UNSCOPED)?.pending ?? [];
    if (early.length) {
      const current = record(key);
      deps.store.write(key, { ...current, pending: early.filter((p) => scope.served.has(p.id)).reduce(enqueue, current.pending) });
      deps.store.write(UNSCOPED, { migrated: false, pending: [] });
    }
    if (!(await flush(key))) return retry();
    const reply = await deps.transport.get();
    if (outcomeOf(reply) !== "ok") return retry();
    const hidden = new Set(parseHidden(reply.body) ?? []);
    const current = record(key);
    if (!current.migrated) {
      const missing = [...deps.local()].filter((id) => scope.served.has(id) && !hidden.has(id));
      deps.store.write(key, { migrated: true, pending: missing.reduce((all, id) => enqueue(all, { op: "add", id }), current.pending) });
      for (const id of missing) hidden.add(id);
      if (!(await flush(key))) retry();
    }
    for (const p of record(key).pending) p.op === "add" ? hidden.add(p.id) : hidden.delete(p.id);
    account = { key, hidden };
    deps.onChange();
  }

  /** Lee y sube; una llamada durante otra se suma a una sola vuelta más. */
  function sync(): Promise<void> {
    if (running) {
      again = true;
      return running;
    }
    running = once()
      .catch(() => retry())
      .finally(() => {
        running = null;
        if (again) {
          again = false;
          void sync();
        }
      });
    return running;
  }

  function change(id: string, op: PendingOp["op"]) {
    const scope = deps.scope();
    if (scope && !scope.served.has(id)) return;
    const key = scope ? keyOf(scope) : UNSCOPED;
    const current = record(key);
    deps.store.write(key, { ...current, pending: enqueue(current.pending, { op, id }) });
    if (account?.key === key) op === "add" ? account.hidden.add(id) : account.hidden.delete(id);
    deps.onChange();
    void sync();
  }

  return {
    /** Lo que dice la cuenta para la organización activa, con lo pendiente aplicado; `null` si no se sabe. */
    account: (): ReadonlySet<string> | null => {
      const scope = deps.scope();
      return scope && account?.key === keyOf(scope) ? account.hidden : null;
    },
    sync,
    hide: (id: string) => change(id, "add"),
    show: (id: string) => change(id, "remove"),
  };
}
