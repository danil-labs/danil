import { type Fleet, type Listed, listedWorkspaces } from "@terminus/fleet";
import { createRoot, createSignal } from "solid-js";
import { availableInContext } from "../model/context-source.ts";
import { rememberMachineNames } from "../model/known-names.ts";

/**
 * Los workspaces de Danil de una organización de pago (plan de agregar workspaces, A2 y A3): lo que
 * contesta `list_workspaces` en sus máquinas `kind=organization` de `/v1/machines`. Nada más
 * decide qué es de Danil: ni el índice del motor ni el vínculo del prototipo.
 */
const [revision, bump] = createRoot(() => createSignal(0));
let fleet: Fleet | null = null;
let unlisten: (() => void) | null = null;
const reading = new Map<string, Promise<void>>();

/** La flota de la ventana; `null` al cerrar sesión, y entonces no hay nada de Danil. */
export function setDanilFleet(next: Fleet | null) {
  if (fleet === next) return;
  unlisten?.();
  fleet = next;
  unlisten = next?.onListing(() => bump((n) => n + 1)) ?? null;
  reading.clear();
  bump((n) => n + 1);
}

/** La flota recibió su inventario: se recuerdan los nombres de sus máquinas y la fuente la adopta. */
export function machinesListed(next: Fleet) {
  rememberMachineNames(next.machines());
  setDanilFleet(next);
  bump((n) => n + 1);
}

/** Una respuesta de `list_workspaces`, tolerante: solo filas con `id`. */
export function listedOf(value: unknown): Listed[] | null {
  return listedWorkspaces(value);
}

/** Lo que contestó `machine` en `list_workspaces` (la web lo atribuye desde `webListing`). */
export function noteListing(machine: string, value: unknown, context?: string) {
  const listed = listedOf(value);
  if (!fleet || !listed) return;
  fleet.setListing(machine, listed, context);
  bump((n) => n + 1);
}

/** Los de `organization`, o `null` mientras su máquina no contestó: la fuente no está asentada. */
export function danilAvailable(organization: string | null): Listed[] | null {
  revision();
  return organization && fleet ? fleet.available(organization) : null;
}

/** Las máquinas `kind=organization` de `organization`; vacío sin flota. */
export function danilMachines(organization: string | null): string[] {
  revision();
  return organization && fleet ? fleet.organizationMachines(organization) : [];
}

/** Pregunta `list_workspaces` a las máquinas de `organization`, una lectura a la vez por organización. */
export function readDanil(organization: string | null): Promise<void> {
  const current = fleet;
  if (!organization || !current) return Promise.resolve();
  const running = reading.get(organization);
  if (running) return running;
  const read = Promise.all(
    current.organizationMachines(organization).map(async (machine) => {
      const owner = current.info(machine)?.context;
      const slice = await current.read({ machine, workspace: null, command: "list_workspaces" }).catch(() => null);
      if (slice?.has && fleet === current && owner === current.info(machine)?.context) noteListing(machine, slice.value);
    }),
  ).then(() => undefined);
  reading.set(organization, read);
  return read.finally(() => reading.delete(organization));
}

/** Si `workspace` es de Danil: lo lista una máquina `kind=organization`. Un local nunca lo es. */
export function isDanilWorkspace(workspace: string): boolean {
  revision();
  const current = fleet;
  if (!current) return false;
  return current.machines().some((machine) => machine.kind === "organization" && !!machine.organizationId &&
    !!current.available(machine.organizationId, machine.context)?.some((row) => row.id === workspace));
}

/** Solo una fuente atribuida al contexto puede aportar datos a su grupo. */
export function danilAvailableContext(organization: string, context: string): Listed[] | null {
  revision();
  return availableInContext(fleet, organization, context);
}

export function readDanilContext(organization: string, context: string, fresh = false): Promise<void> {
  const current = fleet;
  if (!current) return Promise.resolve();
  return Promise.all(current.machines().filter((m) => m.kind === "organization" && m.organizationId === organization && m.context === context).map(async (m) => {
    const envelope = { machine: m.id, context, workspace: null, command: "list_workspaces" };
    const reply = await (fresh ? current.raw(envelope).then(({ value }) => ({ has: true, value })) : current.read(envelope)).catch(() => null);
    if (reply?.has && fleet === current && current.info(m.id, context)?.context === context) noteListing(m.id, reply.value, context);
  })).then(() => undefined);
}
