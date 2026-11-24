/**
 * «Descarga la app» en la Configuración de la web: el instalador del escritorio
 * de cada sistema, con el de esta computadora primero. La ventana no la pinta.
 */
import Download from "lucide-solid/icons/download";
import { For } from "solid-js";
import { downloadsFor, DOWNLOAD_PAGE, type DesktopPlatform } from "../../../../host/src/downloads";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Button } from "../../../../ui/src/Button";
import { ENLACE } from "../../../../ui/src/ExternalLink";
import { SettingsBlock, SettingsPanel, SettingsRow, SettingsSection } from "../../../../ui/src/SettingsLayout";

const platformName = (p: DesktopPlatform) => t(`web.download.platform.${p}`);

export function AppDownloadsSection(props: { userAgent?: string }) {
  const downloads = () => downloadsFor(props.userAgent ?? (typeof navigator === "undefined" ? "" : navigator.userAgent));
  return (
    <SettingsSection title={t("web.download.title")} data-app-downloads="">
      <For each={downloads()}>
        {(d) => (
          <SettingsRow label={platformName(d.platform)} description={d.file} data-app-download={d.platform}>
            <Button
              as="a"
              href={d.url}
              size="sm"
              variant="secondary"
              rel="noopener"
              download=""
              class="outline-none focus:outline-none focus-visible:outline-none"
            >
              <Download size={14} />
              {t("web.download.action")}
            </Button>
          </SettingsRow>
        )}
      </For>
      <SettingsBlock>
        <a
          class={ENLACE + " justify-self-start text-ui outline-none focus:outline-none focus-visible:outline-none"}
          href={DOWNLOAD_PAGE}
          target="_blank"
          rel="noopener"
          data-app-download-page=""
        >
          {t("web.download.all")}
        </a>
      </SettingsBlock>
    </SettingsSection>
  );
}

export default function AppDownloads(props: { userAgent?: string }) {
  return (
    <SettingsPanel>
      <AppDownloadsSection userAgent={props.userAgent} />
    </SettingsPanel>
  );
}
