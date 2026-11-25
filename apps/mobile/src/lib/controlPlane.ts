/**
 * De dónde salen las máquinas de la persona, inyectado por la cuenta: `MachinesProvider` no
 * sabe si habla con el plano de control de Danil Machines (portador de la cuenta, iOS y
 * Android) o con el borde `/v1` (cookie, el teléfono en la web). Sin React Native.
 */
import type { AccountWorkspace, Answer, Computer } from "@terminus/computers";
import type { EdgeControlPlane, EdgeWorkspace } from "./edge.ts";
import type { RelayAuth, Waker } from "./hosts.ts";

export type ControlPlane = {
  computers(): Promise<Answer<Computer[]>>;
  /** El registro de workspaces de la cuenta; `null` si este plano de control no lo dice. */
  workspaces(): Promise<Answer<AccountWorkspace[] | EdgeWorkspace[]> | null>;
  wake: Waker;
  /** Con qué abre la flota cada sesión de relay: portador o ticket. */
  relay: RelayAuth;
  /**
   * Los servicios del plano de control de Danil Machines que piden el portador (avisos push,
   * memoria, directorio). El borde aún no los publica: sin ellos, sus pantallas no se ofrecen.
   */
  bearerServices: boolean;
  /**
   * El catálogo del borde es la lista que se puede ver: cada máquina queda ligada solo a los
   * workspaces que pueden correr en ella. Un plano de control anterior no lo hace.
   */
  limitToRegistry: boolean;
  /** Cambia cuando cambia el contexto: la flota vuelve a leer con ese contexto. */
  scope: string | null;
};

/** El borde: la máquina y los workspaces de la organización, el canal con ticket. */
export function edgeMachinesPlane(edge: EdgeControlPlane, scope: string | null = null): ControlPlane {
  return {
    computers: () => edge.computers(),
    workspaces: () => edge.workspaces(),
    wake: (computer) => edge.wake(computer),
    relay: { endpoint: edge.relayOrigin, admit: (computer) => edge.admit(computer) },
    bearerServices: false,
    limitToRegistry: true,
    scope,
  };
}
