/**
 * El selector de organización de Desk: `edgeFetch` de `lib/edge.ts` (Bearer en Rust,
 * lista cerrada de rutas, status del borde tal cual). El backoff, con el selector oculto,
 * y la `Idempotency-Key` los lleva `@terminus/computers` (`organizations.ts`).
 * Al iniciar o cerrar sesión (`danil-connect`) se vuelve a leer.
 */

import { createOrganizationSelection, type OrganizationSelection } from "@terminus/computers";
import { cancelEdgeWrites, edgeFetch, ORGANIZATION_CHANGED } from "../../../platform-client/src/client";
import { edgeOrganizationSource } from "./organization-edge";
import { legacyOrganizationGate } from "./organization-session-gate";

export function desktopOrganizations(): OrganizationSelection {
  const selection = createOrganizationSelection(
    // Una llamada por intento; la clave de cada `select` se repite en sus reintentos.
    edgeOrganizationSource(edgeFetch, cancelEdgeWrites),
    {
      onSelected: (organization, workspace) => {
        window.dispatchEvent(new CustomEvent(ORGANIZATION_CHANGED, { detail: { organization: organization.id, workspace } }));
        // Solo tras un cambio: fuera de la carga inicial.
        void import("../../../features/machines/src/store").then((m) => m.refetchMachines());
      },
    },
  );
  // Un `403 organization_selection_required` de cualquier ruta del borde abre el selector.
  // Cualquier otro rechazo (`license_required`, `workspace_forbidden`…) no es asunto del selector.
  legacyOrganizationGate(selection);
  return selection;
}
