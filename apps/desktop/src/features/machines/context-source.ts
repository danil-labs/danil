import type { Listed } from "@terminus/fleet";

type Source = {
  organizationMachines(organization: string): readonly string[];
  info(machine: string): { id: string; context?: unknown } | null | undefined;
  available(organization: string): Listed[] | null;
};

/** D2b atribuye inventario y admisión al contexto. Una fuente por omisión no acredita un grupo. */
export function contextSourceMatches(source: Source | null, organization: string, context: string): boolean {
  const machines = source?.organizationMachines(organization) ?? [];
  return machines.length > 0 && machines.every((id) => source?.info(id)?.context === context);
}

export function availableInContext(source: Source | null, organization: string, context: string): Listed[] | null {
  return contextSourceMatches(source, organization, context) ? source?.available(organization) ?? null : null;
}
