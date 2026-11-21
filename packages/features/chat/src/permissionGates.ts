import type { PermissionRequest } from "./Chat";

export type PendingPermission = { id?: string; request_id: string; revision?: number; tool: string; target: string | null };

/**
 * Funde una lectura de `pending_requests` con los gates de esa tarea.
 * El motor escribe el registro antes de emitir `permission`: un gate anterior a la lectura
 * (`desde`) que no sale en ella ya se resolvió; el que la disparó (`llegada == desde`) o uno posterior
 * puede no estar todavía y se conserva.
 * Una lectura vacía no decide nada: los quita `permission_resolved`.
 */
export function mergeGates(
  ps: PermissionRequest[],
  session: string,
  workspace: string | null | undefined,
  read: PendingPermission[],
  desde: number,
): PermissionRequest[] {
  if (!read.length) return ps;
  // Sin `id` (motor anterior) solo casa el `request_id`: `undefined === undefined` daba por leídos todos los gates.
  const leido = (p: PermissionRequest) =>
    read.some((x) => x.request_id === p.requestId || (x.id !== undefined && (x.id === p.durableId || x.id === p.requestId)));
  return [
    ...ps.filter((p) => p.session !== session || (!leido(p) && (p.llegada ?? 0) >= desde)),
    ...read.map((p) => ({
      session,
      workspace: workspace ?? undefined,
      requestId: p.request_id,
      revision: p.revision,
      durableId: p.id,
      tool: p.tool,
      target: p.target,
      origin: ps.find((x) => x.session === session && x.requestId === p.request_id)?.origin ?? null,
    })),
  ];
}
