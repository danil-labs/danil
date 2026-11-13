/**
 * El selector de organización de Desk: `edgeFetch` de `lib/edge.ts` (Bearer en Rust,
 * lista cerrada de rutas, status del borde tal cual). El backoff, con el selector oculto,
 * y la `Idempotency-Key` los lleva `organization-selection.ts`.
 * Al iniciar o cerrar sesión (`danil-connect`) se vuelve a leer.
 */
import { listen } from "../../lib/serviceEvents";
import { edgeFetch, onEdgeProblem } from "../../lib/edge";
import { edgeOrganizationSource } from "./organization-edge";
import { createOrganizationSelection, type OrganizationSelection } from "./organization-selection";

/** Evento de ventana tras cambiar de organización: quien guarde datos de la anterior los suelta. */
export const ORGANIZATION_CHANGED = "danil:organization-changed";

export function desktopOrganizations(): OrganizationSelection {
  const selection = createOrganizationSelection(
    // Una llamada por intento; la clave de cada `select` se repite en sus reintentos.
    edgeOrganizationSource(edgeFetch),
    {
      onSelected: (organization, workspace) => {
        window.dispatchEvent(new CustomEvent(ORGANIZATION_CHANGED, { detail: { organization: organization.id, workspace } }));
        // Solo tras un cambio: fuera de la carga inicial.
        void import("./workspace-directory").then((m) => m.reloadDirectory());
        void import("../machines/store").then((m) => m.refetchMachines());
      },
    },
  );
  // Un `403 organization_selection_required` de cualquier ruta del borde abre el selector.
  onEdgeProblem((e) => void selection.report(e));
  void listen("danil-connect", () => void selection.load()).catch(() => {});
  void selection.load();
  return selection;
}
