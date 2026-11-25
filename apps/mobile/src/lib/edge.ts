/**
 * El plano de control del teléfono en la web: todo por el borde `/v1` con la cookie de la
 * página, como la web y Desk. La persona y salir (`identity`), las organizaciones
 * (`identity/organizations`), el contexto de la cookie (`identity/sessions`), el catálogo
 * (`/v1/workspaces`) y la máquina de la organización (`/v1/machines`: lista, encendido con su
 * operación y el ticket de un solo uso del canal de datos). Las llamadas de una organización
 * llevan `X-Danil-Session` y solo valen si el borde devuelve el mismo contexto. Nada de
 * Supabase, del plano de control de `computers` ni de la mensajería.
 *
 * Tolerante (regla 10): un 404 o un 501 de la lista es «aún no» y quien llama reintenta solo;
 * un 401 avisa la sesión vencida. Sin React Native: se prueba en Node.
 */
import {
  type Answer,
  type Computer,
  type EdgeDeployment,
  type EdgeTransport,
  type OrganizationSource,
  EdgeError,
  edgeIdentity,
  edgeTransport,
} from "@terminus/computers";
import type { Admission as MachineAdmission } from "../../../../packages/platform-client/src/machines-config.ts";
import {
  DEFAULT_RELAY_ORIGINS,
  machineToComputer,
  machinesClient,
  wokeOf,
} from "../../../../packages/platform-client/src/machines.ts";
import { type EdgeSessionSet, sessionSetOf } from "./edge-sessions.ts";
import { catalogPage, type EdgeWorkspace, workspaceRead, type WorkspaceRead } from "./edge-workspaces.ts";

export type EdgeOptions = {
  fetch?: typeof fetch;
  /** Orígenes exactos del relay que pueden recibir el ticket; sin lista, los de Desk y la web. */
  relayOrigins?: readonly string[];
  /** Un 401 de cualquier llamada: la sesión del borde venció. */
  onUnauthorized?: () => void;
  /** El contexto de la organización activa. Sin él, la llamada usa el contexto por omisión del borde. */
  context?: () => string | null;
  /** La organización de ese contexto. Si está, el eco tiene que traer la misma. */
  organization?: () => string | null;
  /** El borde contestó `organization_selection_required`: hay que elegir organización. */
  onSelectionRequired?: () => void;
};

export type { EdgeWorkspace };

/**
 * El borde que fijó la compilación (`EXPO_PUBLIC_DANIL_EDGE_ORIGIN`, desde `DANIL_WEB_API_ORIGIN`),
 * o null si la compilacion no configura el borde.
 */
export function edgeDeployment(env: Record<string, string | undefined>): EdgeDeployment | null {
  const raw = env.EXPO_PUBLIC_DANIL_EDGE_ORIGIN?.trim();
  if (!raw) return null;
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.href !== `${url.origin}/` || url.username || url.password) throw new Error("invalid_edge_origin");
  const timeoutMs = Number(env.EXPO_PUBLIC_DANIL_EDGE_TIMEOUT_MS ?? 15_000);
  return { origin: url.origin, timeoutMs: Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 60_000 ? timeoutMs : 15_000 };
}

/** Los orígenes del relay de la compilación (`EXPO_PUBLIC_DANIL_RELAY_ORIGINS`, separados por coma). */
export function relayOriginsOf(raw: string | undefined): readonly string[] {
  const list = (raw ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_RELAY_ORIGINS;
}

export function edgeControlPlane(deployment: EdgeDeployment, options: EdgeOptions = {}) {
  const raw = edgeTransport(deployment, options.fetch);
  const seen = async (work: () => Promise<Response>) => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof EdgeError && error.status === 401) options.onUnauthorized?.();
      throw error;
    }
  };
  const transport: EdgeTransport = {
    call: (path, init) => seen(() => raw.call(path, init)),
    mutation: (path, init) => seen(() => raw.mutation(path, init)),
  };
  const scoped = scopedTransport(transport, () => options.context?.() ?? null, () => options.organization?.() ?? null);
  const machines = machinesClient({ endpoint: `${deployment.origin}/v1`, transport: scoped, relayOrigins: options.relayOrigins ?? DEFAULT_RELAY_ORIGINS });
  const relayOrigin = (options.relayOrigins ?? DEFAULT_RELAY_ORIGINS)[0];

  const organizations: OrganizationSource = {
    capabilities: async () => (await transport.call("capabilities")).json(),
    list: async () => (await transport.call("identity/organizations")).json(),
    select: async (id, key) =>
      (
        await transport.mutation("identity/organizations/select", {
          headers: { "Content-Type": "application/json", "Idempotency-Key": key },
          body: JSON.stringify({ organization_id: id }),
        })
      ).json(),
  };

  return {
    // Identity decide la sesión: sus 401 no pasan por el aviso, que lo vuelve a preguntar a ella.
    identity: edgeIdentity(raw, deployment.origin),
    organizations,
    /** Adonde abre el canal de datos; la URL exacta la trae cada ticket. */
    relayOrigin,
    /** El conjunto de la cookie, sin contexto: de aquí sale la organización de las demás llamadas. */
    async sessions(): Promise<EdgeSessionSet | null> {
      try {
        return sessionSetOf(await (await transport.call("identity/sessions")).json());
      } catch {
        return null;
      }
    },
    /**
     * La máquina de la organización como `Computer`. Una personal no se enciende desde la nube.
     * El borde decide el resto (`not_remotely_startable`).
     */
    async computers(): Promise<Answer<Computer[]>> {
      const answer = await machines.list();
      if (answer.kind === "error" && answer.code === "organization_selection_required") options.onSelectionRequired?.();
      if (answer.kind === "ok") return { kind: "ok", value: answer.value.map((m) => machineToComputer(m)) };
      if (answer.kind === "unavailable") return { kind: "error", status: answer.status };
      return answer;
    },
    /** Los workspaces de la organización. `null`: el catálogo no contestó y se conserva la lista de antes. */
    async workspaces(): Promise<Answer<EdgeWorkspace[]> | null> {
      try {
        const read = await readCatalog(scoped.call.bind(scoped));
        if (read.kind === "unavailable") return null;
        if (read.kind === "organization") {
          options.onSelectionRequired?.();
          return { kind: "error", status: 403, code: "organization_selection_required" };
        }
        if (read.kind === "workspace") return { kind: "error", status: 403, code: "no_workspace_access" };
        return { kind: "ok", value: read.value };
      } catch (error) {
        if (error instanceof EdgeError && error.status === 401) return { kind: "unauthorized" };
        return null;
      }
    },
    async wake(id: string): Promise<boolean | "not_startable"> {
      return wokeOf(await machines.start(id));
    },
    async admit(id: string): Promise<MachineAdmission> {
      const answer = await machines.admission(id);
      if (answer.kind !== "ok") throw new Error(answer.kind === "error" ? (answer.code ?? "machine_unreachable") : answer.kind);
      return answer.value;
    },
  };
}

export type EdgeControlPlane = ReturnType<typeof edgeControlPlane>;

/** Pone el contexto y rechaza una respuesta cuyo eco no es ese contexto y su organización. */
function scopedTransport(raw: EdgeTransport, context: () => string | null, organization: () => string | null): EdgeTransport {
  const prepared = (init: RequestInit | undefined) => {
    const ctx = context();
    if (!ctx) return { ctx, init };
    const headers = new Headers(init?.headers);
    headers.set("X-Danil-Session", ctx);
    return { ctx, init: { ...init, headers } };
  };
  const echoed = async (response: Response, ctx: string | null) => {
    if (!ctx) return response;
    const applied = response.headers.get("X-Danil-Session-Applied");
    const org = response.headers.get("X-Danil-Session-Applied-Org");
    const expect = organization();
    if (applied !== ctx || !org || (expect !== null && org !== expect)) {
      await response.body?.cancel();
      throw new EdgeError(503, null, "session_echo_mismatch");
    }
    return response;
  };
  return {
    call: async (path, init) => {
      const next = prepared(init);
      return echoed(await raw.call(path, next.init), next.ctx);
    },
    mutation: async (path, init) => {
      const next = prepared(init);
      return echoed(await raw.mutation(path, next.init), next.ctx);
    },
  };
}

/** Todas las páginas del catálogo. Un cursor repetido o una página ilegible no se usan. */
async function readCatalog(call: EdgeTransport["call"]): Promise<WorkspaceRead> {
  const pages: { rows: EdgeWorkspace[]; next: string | null; empty: string | null }[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    let response: Response;
    try {
      response = await call(cursor ? `workspaces?cursor=${encodeURIComponent(cursor)}` : "workspaces");
    } catch (error) {
      if (error instanceof EdgeError && error.status === 403 && error.code === "organization_selection_required") return { kind: "organization" };
      if (error instanceof EdgeError && error.status === 401) throw error;
      return { kind: "unavailable" };
    }
    const body = await response.json().catch(() => null);
    let page: ReturnType<typeof catalogPage>;
    try {
      page = catalogPage(body);
    } catch {
      return { kind: "unavailable" };
    }
    pages.push(page);
    cursor = page.next;
    if (cursor && seen.has(cursor)) return { kind: "unavailable" };
    if (cursor) seen.add(cursor);
  } while (cursor);
  return workspaceRead(pages);
}
