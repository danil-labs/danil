/**
 * El selector de organización de Desk: `lib/edge.ts` (Bearer en Rust, lista cerrada de
 * rutas, `/v1/capabilities` ya consultado allí). Rust devuelve `not_available_yet` tras
 * su propio reintento; aquí no se espera dentro de la llamada (señal ya abortada) y el
 * backoff largo lo lleva `organization-selection.ts`, con el selector oculto.
 * Al iniciar o cerrar sesión (`danil-connect`) se vuelve a leer.
 */
import { listen } from "../../lib/serviceEvents";
import { onEdgeProblem, organizations, selectOrganization } from "../../lib/edge";
import { refetchMachines } from "../machines/store";
import { createOrganizationSelection, type OrganizationSelection } from "./organization-selection";
import { reloadDirectory } from "./workspace-directory";

/** Evento de ventana tras cambiar de organización: quien guarde datos de la anterior los suelta. */
export const ORGANIZATION_CHANGED = "danil:organization-changed";

const once = () => ({ signal: AbortSignal.abort() });

export function desktopOrganizations(): OrganizationSelection {
  const selection = createOrganizationSelection(
    {
      list: () => organizations(once()),
      // `Idempotency-Key` la pone Rust en cada escritura del borde.
      select: (id) => selectOrganization(id, once()),
    },
    {
      onSelected: (organization, workspace) => {
        window.dispatchEvent(new CustomEvent(ORGANIZATION_CHANGED, { detail: { organization: organization.id, workspace } }));
        reloadDirectory();
        void refetchMachines();
      },
    },
  );
  // Un `403 organization_selection_required` de cualquier ruta del borde abre el selector.
  onEdgeProblem((e) => void selection.report(e));
  void listen("danil-connect", () => void selection.load()).catch(() => {});
  void selection.load();
  return selection;
}
