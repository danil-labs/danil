import type { Listed } from "./fleet/index.ts";

type Source = {
  organizationMachines(organization: string, context?: string): readonly string[];
  info(machine: string, context?: string): { id: string; context?: unknown } | null | undefined;
  available(organization: string, context?: string): Listed[] | null;
};

/** El inventario y la admisión pertenecen al contexto. Una fuente por omisión no acredita un grupo. */
export function contextSourceMatches(source: Source | null, organization: string, context: string): boolean {
  const machines = source?.organizationMachines(organization, context) ?? [];
  return machines.length > 0 && machines.every((id) => source?.info(id, context)?.context === context);
}

export function availableInContext(source: Source | null, organization: string, context: string): Listed[] | null {
  return contextSourceMatches(source, organization, context) ? source?.available(organization, context) ?? null : null;
}
