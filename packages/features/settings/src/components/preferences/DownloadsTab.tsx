import Download from "lucide-solid/icons/download";
import { For } from "solid-js";
import { Button, SettingsPanel, SettingsRow, SettingsSection } from "@danil/ui";

interface DownloadItem {
  platform: string;
  file: string;
  url: string;
}

const DOWNLOADS: DownloadItem[] = [
  {
    platform: "macOS (Apple Silicon)",
    file: "Danil-arm64.dmg",
    url: "https://danil.ai/download/mac-arm64",
  },
  {
    platform: "macOS (Intel)",
    file: "Danil-x64.dmg",
    url: "https://danil.ai/download/mac-x64",
  },
  {
    platform: "Windows",
    file: "Danil-Setup-x64.exe",
    url: "https://danil.ai/download/windows",
  },
  {
    platform: "Linux (.deb)",
    file: "danil_amd64.deb",
    url: "https://danil.ai/download/linux-deb",
  },
  {
    platform: "Linux (.AppImage)",
    file: "Danil.AppImage",
    url: "https://danil.ai/download/linux-appimage",
  },
];

export function DownloadsTab() {
  return (
    <SettingsPanel>
      <SettingsSection
        title="Descarga la app"
        description="Instaladores oficiales de Danil para escritorio."
      >
        <For each={DOWNLOADS}>
          {(d) => (
            <SettingsRow label={d.platform} description={d.file}>
              <Button
                as="a"
                href={d.url}
                target="_blank"
                rel="noopener"
                size="sm"
                variant="secondary"
              >
                <Download size={14} class="mr-1.5" />
                Descargar
              </Button>
            </SettingsRow>
          )}
        </For>
      </SettingsSection>
    </SettingsPanel>
  );
}
