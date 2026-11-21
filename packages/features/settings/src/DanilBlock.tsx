import { For } from "solid-js";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import Accounts from "./Accounts";
import DanilCreditsRow from "./DanilCreditsRow";
import { SettingsSection } from "./layout";

/**
 * El bloque Danil de Proveedores de IA: Danil Credits y el Router IA gratis,
 * un `Accounts soloGratuitos` sin título por motor (su fila trae el
 * consentimiento y la instalación). El Router no es un grupo ni sale en «Agregar cuenta».
 */
export default function DanilBlock(props: { routers: string[] }) {
  return (
    <SettingsSection title="Danil" aria-label="Danil">
      <DanilCreditsRow />
      <For each={props.routers}>{(id) => <Accounts agente={id} soloGratuitos nombre={t("surfaces.label.free")} />}</For>
    </SettingsSection>
  );
}
