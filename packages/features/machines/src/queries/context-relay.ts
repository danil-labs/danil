import { RelaySession } from "./relay.ts";
import type { MachineInfo } from "../model/fleet/index.ts";
import { EDGE_ENDPOINT } from "./cloud-machines.ts";
import { createContextRelayPool } from "./context-relay-pool.ts";
import type { createSessionCloud } from "./session-cloud.ts";

/** Los tickets son de un solo uso y nunca se comparten entre identidades de la misma máquina. */
export function createCloudRelayFactory(cloud: ReturnType<typeof createSessionCloud>, renew: () => boolean, unauthorized: () => void, attention?: { suspended(info: MachineInfo): void; resumed(info: MachineInfo, value: unknown): void }) {
  const pool = createContextRelayPool();
  return (info: MachineInfo) => {
    // Canal de datos con ticket de un solo uso (`ticket.*`), nunca `bearer.*`.
    const create = () => new RelaySession({
      endpoint: EDGE_ENDPOINT, computerId: info.id,
      getAdmission: async () => {
        const answer = await cloud.client.admission(info.id, info.context);
        if (answer.kind === "error" && answer.status === 409 && answer.code === "machine_stopped") throw { code: "machine_stopped" };
        if (answer.kind !== "ok") throw new Error(answer.kind);
        return answer.value;
      },
      renewInChannel: renew, onUnauthorized: unauthorized,
    });
    return info.context ? pool.link(info.id, create, attention ? { onSuspend: () => attention.suspended(info), onResume: (value) => attention.resumed(info, value) } : undefined) : create();
  };
}
