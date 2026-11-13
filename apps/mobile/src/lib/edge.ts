/**
 * El plano de control del teléfono en la web: todo por el borde `/v1` con la cookie de la
 * página, como la web y Desk. La persona y salir (`identity`), las organizaciones
 * (`identity/organizations`), y la máquina de la organización (`/v1/machines`: lista, encendido
 * con su operación y el ticket de un solo uso del canal de datos). Nada de Supabase, del plano de
 * control de `computers` ni de la mensajería.
 *
 * Tolerante (regla 10): un 404 o un 501 de la lista es «aún no» y quien llama reintenta solo;
 * un 401 avisa la sesión vencida. Sin React Native: se prueba en Node.
 */
import {
  type Answer,
  type Computer,
  type EdgeDeployment,
  type EdgeTransport,
  type MachineAdmission,
  type OrganizationSource,
  DEFAULT_RELAY_ORIGINS,
  EdgeError,
  edgeIdentity,
  edgeTransport,
  machineToComputer,
  machinesClient,
  wokeOf,
} from "@terminus/computers";

export type EdgeOptions = {
  fetch?: typeof fetch;
  /** Orígenes exactos del relay que pueden recibir el ticket; sin lista, los de Desk y la web. */
  relayOrigins?: readonly string[];
  /** Un 401 de cualquier llamada: la sesión del borde venció. */
  onUnauthorized?: () => void;
};

/**
 * El borde que fijó la compilación (`EXPO_PUBLIC_DANIL_EDGE_ORIGIN`, desde `DANIL_WEB_API_ORIGIN`),
 * o `null`: sin él, la app sigue con la cuenta y las máquinas de antes (iOS y Android).
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
  const machines = machinesClient({ endpoint: `${deployment.origin}/v1`, transport, relayOrigins: options.relayOrigins ?? DEFAULT_RELAY_ORIGINS });
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
    /**
     * La máquina de la organización como `Computer`. Toda fila de `/v1/machines` la administra
     * Danil: se ofrece encender y el borde decide (`not_remotely_startable`).
     */
    async computers(): Promise<Answer<Computer[]>> {
      const answer = await machines.list();
      if (answer.kind === "ok") return { kind: "ok", value: answer.value.map((m) => ({ ...machineToComputer(m), wakeable: true })) };
      if (answer.kind === "unavailable") return { kind: "error", status: answer.status };
      return answer;
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
