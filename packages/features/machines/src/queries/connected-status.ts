/**
 * Lo que el motor reporta de sus inscripciones por organización (`connected_machines_v1`):
 * el motor se inscribe solo con su sesión; la ventana solo lee y nunca ve credenciales.
 */
export const CONNECTED_MACHINES_FEATURE = "connected_machines_v1";

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
export type ConnectedMachine = { organization_id: string; machine_id: string; state?: string; online?: boolean; error?: string; expires_at?: number };

const text = (value: unknown) => typeof value === "string" && value ? value : null;

function machinesOf(raw: unknown): ConnectedMachine[] | null {
  const list = (raw as { organizations?: unknown } | null)?.organizations;
  if (!Array.isArray(list)) return null;
  return list.flatMap((row) => {
    const r = row as Record<string, unknown> | null;
    return r && text(r.organization_id) && text(r.machine_id) ? [r as unknown as ConnectedMachine] : [];
  });
}

export function createConnectedStatus(rpc: Invoke) {
  let machines: ConnectedMachine[] = [];
  // La fila propia por la flota puede llegar sin `features`; lo que el motor anunció en esta ejecución vale.
  let supported = false;
  return {
    /** Las máquinas que son esta computadora: la lista no las repite. */
    own: (): ReadonlySet<string> => new Set(machines.map((m) => m.machine_id)),
    of: (org: string) => machines.find((m) => m.organization_id === org) ?? null,
    async read() {
      try {
        const self = (await rpc("machine_list") as { local?: boolean; features?: string[] }[]).find((m) => m.local);
        if (!self) return;
        supported ||= self.features?.includes(CONNECTED_MACHINES_FEATURE) ?? false;
        if (!supported) return;
        machines = machinesOf(await rpc("danil_connected_status")) ?? machines;
      } catch {
        // Un motor ocupado o reiniciando: se conserva lo último que reportó.
      }
    },
  };
}
