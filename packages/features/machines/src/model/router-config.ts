import type { AccountWorkspace, SystemId } from "@terminus/computers";
import type { Fleet } from "@terminus/fleet";
import type { EngineWorkspace } from "../queries/engine-workspaces.ts";
export type Invoke = (command: string, args?: Record<string, unknown>, options?: { headers?: HeadersInit }) => Promise<unknown>;
export type SliceChange = "sessions" | "projects" | "spaces" | "attention" | "mentions" | "workspaces";
export type RouterConfig = {
  /** La máquina de la ventana; `null` en la web. */
  self: string | null;
  fleet: Fleet;
  /** El IPC de la ventana: el motor de esta computadora; `null` en la web. */
  native: Invoke | null;
  deliverRemote?: boolean;
  /** El registro de la cuenta (`GET /v1/workspaces`), o `null` si no se pudo leer. */
  registry?: () => Promise<AccountWorkspace[] | null>;
  /** Cambió la rebanada de otra máquina: la ventana vuelve a leer eso. */
  onSlices?: (changes: SliceChange[]) => void;
  /** Los eventos de otra máquina, ya con los ids del panel. */
  deliver?: (events: { name: string; payload: unknown }[]) => void;
  /** «Ejecutar en» para `workspace`, si la persona eligió una máquina. */
  pickedFor?: (workspace: string | null) => string | null;
  /**
   * Lo que el motor de esta computadora sabe de las otras máquinas de la persona
   * (`state_machines`), de todas sus cuentas; `null` sin la función, y entonces
   * los workspaces de una organización salen de la flota.
   */
  engineWorkspaces?: () => readonly EngineWorkspace[] | null;
  /**
   * Lo que anuncia el motor de aquí. Con `light_state_v1` la barra de esta máquina
   * sale de su índice (`state_resource`) y, con `light_state_machines_v1`, la de
   * las otras de sus copias (`state_copy`), sin preguntar a cada una por el relay.
   */
  engineFeatures?: () => readonly string[];
  /** La máquina de la ventana. `os` solo si se sabe; sin `wakes`, se pinta como laptop. */
  home?: () => { wakes?: boolean; os?: SystemId | null; features?: readonly string[]; version?: string | null };
};
