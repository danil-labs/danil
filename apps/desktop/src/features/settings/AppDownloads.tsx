/**
 * «Descarga la app» en la Configuración de la web: el instalador del escritorio
 * de cada sistema, con el de esta computadora primero. La ventana no la pinta.
 */
import Download from "lucide-solid/icons/download";
import { For } from "solid-js";
import { downloadsFor, DOWNLOAD_PAGE, type DesktopPlatform } from "../../lib/downloads";
import { t } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import { ENLACE } from "../../ui/ExternalLink";
import { SettingsPanel, SettingsRow, SettingsSection } from "./layout";

const platformName = (p: DesktopPlatform) => t(`settings.download.platform.${p}`);

export default function AppDownloads(props: { userAgent?: string }) {
  const downloads = downloadsFor(props.userAgent ?? (typeof navigator === "undefined" ? "" : navigator.userAgent));
  return (
    <SettingsPanel>
      <SettingsSection title={t("settings.download.title")} data-app-downloads="">
        <For each={downloads}>
          {(d) => (
            <SettingsRow label={platformName(d.platform)} description={d.file} data-app-download={d.platform}>
              <Button as="a" href={d.url} size="sm" variant="secondary" rel="noopener" download="">
                <Download size={14} />
                {t("settings.download.action")}
              </Button>
            </SettingsRow>
          )}
        </For>
      </SettingsSection>
      <a class={ENLACE + " justify-self-start text-ui"} href={DOWNLOAD_PAGE} target="_blank" rel="noopener" data-app-download-page="">
        {t("settings.download.all")}
      </a>
    </SettingsPanel>
  );
}
