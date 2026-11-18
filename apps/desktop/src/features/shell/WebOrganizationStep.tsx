import { Show } from "solid-js";
import { capabilities } from "../../lib/platform";
import { OrganizationSection } from "./OrganizationMenu";

/** Reutiliza el selector de la sesión web; no crea contextos ni cambia la selección de Desk. */
export function WebOrganizationStep(props: { onClose: () => void }) {
  return <Show when={capabilities().organizations}>{(load) => <OrganizationSection load={load()} onClose={props.onClose} />}</Show>;
}
