import FileArchive from "lucide-solid/icons/file-archive";
import FolderOpen from "lucide-solid/icons/folder-open";
import { Badge, Button, SettingsPanel, SettingsRow, SettingsSection } from "@danil/ui";

export function LanguagesTab() {
  return (
    <SettingsPanel>
      <SettingsSection
        title="Lenguas"
        description="Paquetes de traducción instalados en esta versión."
        aside={
          <div class="flex items-center gap-2">
            <Button variant="ghost" size="compact" disabled>
              <FolderOpen size={14} class="mr-1.5" />
              Instalar de una carpeta
            </Button>
            <Button variant="secondary" size="sm" disabled>
              <FileArchive size={14} class="mr-1.5" />
              Instalar de un .zip
            </Button>
          </div>
        }
      >
        <SettingsRow
          lead={
            <span class="flex size-6 items-center justify-center rounded bg-surface-muted text-xs font-mono font-bold">
              es
            </span>
          }
          label="Español"
          description="es · 1.0.0 · Por Danil"
        >
          <Badge>incluida</Badge>
        </SettingsRow>
        <SettingsRow
          lead={
            <span class="flex size-6 items-center justify-center rounded bg-surface-muted text-xs font-mono font-bold">
              en
            </span>
          }
          label="English"
          description="en · 1.0.0 · Por Danil"
        >
          <Badge>incluida</Badge>
        </SettingsRow>
      </SettingsSection>
    </SettingsPanel>
  );
}
