/**
 * De dónde salen las máquinas de la persona, inyectado por la cuenta: `MachinesProvider` no
 * sabe si habla con el plano de control de Danil Machines (portador de la cuenta, iOS y
 * Android) o con el borde `/v1` (cookie, el teléfono en la web). Sin React Native.
 */
import { type AccountWorkspace, type Answer, type Computer, listComputers, listWorkspaces, startComputer } from "@terminus/computers";
import type { EdgeControlPlane } from "./edge.ts";
import type { RelayAuth, Waker } from "./hosts.ts";

export type ControlPlane = {
  computers(): Promise<Answer<Computer[]>>;
  /** El registro de workspaces de la cuenta; `null` si este plano de control no lo dice. */
  workspaces(): Promise<Answer<AccountWorkspace[]> | null>;
  wake: Waker;
  /** Con qué abre la flota cada sesión de relay: portador o ticket. */
  relay: RelayAuth;
  /**
   * Los servicios del plano de control de Danil Machines que piden el portador (avisos push,
   * memoria, directorio). El borde aún no los publica: sin ellos, sus pantallas no se ofrecen.
   */
  bearerServices: boolean;
};

/** Danil Machines con el portador de la cuenta: un portador rechazado se refresca una vez. */
export function computersControlPlane(endpoint: string, getToken: () => Promise<string>, unauthorized: () => Promise<boolean>): ControlPlane {
  return {
    async computers() {
      const answer = await listComputers(endpoint, await getToken());
      if (answer.kind !== "unauthorized" || !(await unauthorized())) return answer;
      return listComputers(endpoint, await getToken());
    },
    workspaces: () => getToken().then((token) => listWorkspaces(endpoint, token)),
    wake: async (computer) => (await startComputer(endpoint, await getToken(), computer)).kind === "ok",
    relay: { endpoint, getToken },
    bearerServices: true,
  };
}

/** El borde: la máquina de la organización por `/v1/machines`, el canal con ticket. */
export function edgeMachinesPlane(edge: EdgeControlPlane): ControlPlane {
  return {
    computers: () => edge.computers(),
    // El borde no tiene un registro de workspaces por máquina: no se filtra por vínculos.
    workspaces: async () => null,
    wake: (computer) => edge.wake(computer),
    relay: { endpoint: edge.relayOrigin, admit: (computer) => edge.admit(computer) },
    bearerServices: false,
  };
}
