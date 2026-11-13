/**
 * El selector de organización (contrato `mvp-v1`, `identity`):
 * `GET /v1/identity/organizations` y `POST /v1/identity/organizations/select`.
 * Lo usan Desk y la web; el transporte se inyecta (Bearer por Rust en Desk, cookie en la web).
 *
 * Tolerante (regla 10): sin la capacidad `identity.organizations` v1, o con un 404/501 (o
 * el `not_available_yet` de Desk), el selector queda oculto y se reintenta solo con backoff;
 * cuando la ruta aparece, funciona sin recompilar. Campos desconocidos se ignoran.
 *
 * Sin APIs del DOM ni de Solid: el reloj y la clave se inyectan; `subscribe` avisa cambios.
 */
import { announces, capabilityList } from "./capabilities.ts";

export type Organization = { id: string; name: string; plan?: string; role?: string };

export type OrganizationSource = {
  /** El cuerpo de `GET /v1/capabilities`; sin esto, la ruta misma dice si existe. */
  capabilities?: () => Promise<unknown>;
  /** El cuerpo de `GET /v1/identity/organizations`. */
  list: () => Promise<unknown>;
  /** `POST /v1/identity/organizations/select` con `Idempotency-Key`. */
  select: (organizationId: string, idempotencyKey: string) => Promise<unknown>;
};

export type OrganizationState =
  | { kind: "hidden" }
  | { kind: "ready"; items: Organization[]; active: string | null; busy: boolean; error: string | null; errorStatus?: number; refused?: boolean };

export function hasActiveOrganization(state: OrganizationState): boolean {
  return state.kind === "ready" && !state.busy && !state.error && state.items.some(org => org.id === state.active);
}

export type OrganizationOptions = {
  /** Programa un reintento; devuelve cómo cancelarlo. */
  schedule?: (run: () => void, ms: number) => () => void;
  key?: () => string;
  /** Tras un cambio: releer workspaces y máquinas de la nueva organización. */
  onSelected?: (organization: Organization, workspace: string | null) => void | Promise<void>;
};

const CAPABILITY = "identity.organizations";
const FIRST_MS = 2_000;
const CEILING_MS = 5 * 60_000;
const SELECTION_REQUIRED = "organization_selection_required";

const record = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);
const text = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

function organizationOf(raw: unknown): Organization | null {
  const r = record(raw);
  const id = text(r?.id);
  if (!r || !id) return null;
  // Solo lo declarado; lo demás se ignora (consumidor tolerante).
  return { id, name: text(r.name) ?? id, ...(text(r.plan) ? { plan: r.plan as string } : {}), ...(text(r.role) ? { role: r.role as string } : {}) };
}

/** `status` HTTP (web) o `detail` del `invoke` de Desk. */
const statusOf = (e: unknown): number | undefined => {
  const s = record(e)?.status;
  return typeof s === "number" ? s : undefined;
};
const codeOf = (e: unknown): string | undefined => text(record(e)?.code) ?? text(record(e)?.detail);
const hintOf = (e: unknown): number | undefined => {
  const v = record(e)?.retry_after_ms;
  return typeof v === "number" && v >= 0 ? v : undefined;
};

/** Lo que significa «el servidor aún no la tiene / no responde»: se oculta y se reintenta. */
function retriable(e: unknown): boolean {
  const status = statusOf(e);
  if (status !== undefined) return status === 404 || status === 501 || status === 429 || status >= 500 || status === 408;
  const code = codeOf(e);
  return code === "not_available_yet" || code === "unavailable" || code === undefined;
}

/** Un `403 organization_selection_required` de cualquier ruta, en su forma web o de Desk. */
export function isOrganizationSelectionRequired(e: unknown): boolean {
  const status = statusOf(e);
  return (status === undefined || status === 403) && codeOf(e) === SELECTION_REQUIRED;
}

/** `true` si `identity.organizations` está anunciada en v1 y `available` (lectura común con la web y Machines). */
export function announcesOrganizations(body: unknown): boolean {
  return announces(capabilityList(body), CAPABILITY);
}

const defaultSchedule = (run: () => void, ms: number) => {
  const timer = setTimeout(run, ms);
  (timer as unknown as { unref?: () => void }).unref?.();
  return () => clearTimeout(timer);
};

export function createOrganizationSelection(source: OrganizationSource, options: OrganizationOptions = {}) {
  const schedule = options.schedule ?? defaultSchedule;
  const key = options.key ?? (() => crypto.randomUUID());
  let state: OrganizationState = { kind: "hidden" };
  let needed = false;
  let attempt = 0;
  let cancel: (() => void) | null = null;
  let pending: { id: string; key: string } | null = null;
  // La última negativa definitiva (4xx) a una selección. La selección automática no la repite: solo
  // una elección explícita de la persona, o que el directorio la anuncie activa, la deja atrás.
  let refusal: { id: string; error: string; status?: number } | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const set = (next: OrganizationState) => {
    state = next;
    emit();
  };

  function retryLater(hint?: number) {
    cancel?.();
    const wait = Math.min(CEILING_MS, Math.max(FIRST_MS * 2 ** Math.min(attempt, 16), hint ?? 0));
    attempt++;
    cancel = schedule(() => {
      cancel = null;
      void load();
    }, wait);
  }

  // Una sola lectura del directorio a la vez: una segunda carga concurrente reutiliza la que está en
  // vuelo. Si no, volvería a fijar el estado (borrando `busy`) mientras la primera selecciona.
  let loading: Promise<void> | null = null;
  function load(): Promise<void> {
    loading ??= loadOnce().finally(() => { loading = null; });
    return loading;
  }

  async function loadOnce(): Promise<void> {
    try {
      if (source.capabilities && !announcesOrganizations(await source.capabilities())) {
        set({ kind: "hidden" });
        retryLater();
        return;
      }
      const body = record(await source.list());
      const items = (Array.isArray(body?.items) ? body.items : []).map(organizationOf).filter((o): o is Organization => o !== null);
      const announced = text(body?.active_organization_id);
      const active = announced && items.some((o) => o.id === announced) ? announced : null;
      attempt = 0;
      if (active || !items.some((o) => o.id === refusal?.id)) refusal = null;
      set(refusal
        ? { kind: "ready", items, active, busy: false, error: refusal.error, errorStatus: refusal.status, refused: true }
        : { kind: "ready", items, active, busy: false, error: null });
      if (!active && items.length === 1 && !refusal) await choose(items[0].id);
      else if (!active && items.length > 1) {
        needed = true;
        emit();
      }
    } catch (e) {
      if (!retriable(e)) {
        // Sin sesión o un rechazo del contrato: no hay selector, y no se martillea.
        set({ kind: "hidden" });
        return;
      }
      if (state.kind !== "ready") set({ kind: "hidden" });
      retryLater(hintOf(e));
    }
  }

  async function choose(id: string): Promise<void> {
    if (state.kind !== "ready" || state.busy) return;
    if (state.active === id && !pending) {
      needed = false;
      emit();
      return;
    }
    // La misma intención conserva su clave: repetirla tras una respuesta perdida es idempotente.
    if (pending?.id !== id) pending = { id, key: key() };
    refusal = null;
    const before = state;
    set({ ...before, busy: true, error: null, errorStatus: undefined, refused: false });
    try {
      const reply = record(await source.select(pending.id, pending.key));
      const organization = organizationOf(reply?.organization) ?? before.items.find((o) => o.id === id) ?? { id, name: id };
      const workspace = text(reply?.workspace) ?? null;
      pending = null;
      needed = false;
      set({ ...before, active: organization.id, busy: false, error: null, errorStatus: undefined, refused: false });
      await options.onSelected?.(organization, workspace);
    } catch (e) {
      const status = statusOf(e);
      // Un 4xx definitivo descarta la intención; red o 5xx la conservan para reintentar con la misma clave.
      const refused = status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429;
      const error = codeOf(e) ?? "unavailable";
      if (refused) {
        pending = null;
        refusal = { id, error, status };
      }
      set({ ...before, busy: false, error, errorStatus: status, refused });
    }
  }

  return {
    state: () => state,
    /** Se muestra con al menos una organización; con una sola, solo su nombre. */
    visible: () => state.kind === "ready" && state.items.length > 0,
    /** Hay que elegir: abre el selector. */
    needed: () => needed,
    load,
    choose,
    /** Para cualquier llamada: un `403 organization_selection_required` abre el selector. */
    report(e: unknown): boolean {
      if (!isOrganizationSelectionRequired(e)) return false;
      needed = true;
      emit();
      if (state.kind === "hidden") void load();
      return true;
    },
    dismiss() {
      needed = false;
      emit();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop() {
      cancel?.();
      cancel = null;
    },
  };
}

export type OrganizationSelection = ReturnType<typeof createOrganizationSelection>;
