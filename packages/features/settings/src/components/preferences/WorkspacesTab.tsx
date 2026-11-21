import FolderOpen from "lucide-solid/icons/folder-open";
import ImagePlus from "lucide-solid/icons/image-plus";
import { Button, SettingsPanel, SettingsRow, SettingsSection } from "@danil/ui";

export interface WorkspacesTabProps {
  workspaceName?: string;
}

export function WorkspacesTab(props: WorkspacesTabProps) {
  return (
    <SettingsPanel>
      <SettingsSection
        title="Barra de workspaces"
        description="Gestión y ajustes del workspace activo."
      >
        <SettingsRow
          label="Workspace actual"
          description={props.workspaceName ?? "Espacio predeterminado"}
        />

        <SettingsRow
          label="Logo"
          description="Se ve en la columna de workspaces y en el menú del nombre. Al elegirla, recortas el cuadrado que se muestra. Sin imagen se usan las iniciales."
        >
          <Button size="sm" variant="outline" disabled>
            <ImagePlus size={15} class="mr-1.5" />
            Elegir imagen
          </Button>
        </SettingsRow>

        <SettingsRow
          label="Carpeta para copias de trabajo"
          description="Carpeta de datos de la app"
        >
          <Button size="sm" variant="ghost" disabled>
            Restablecer
          </Button>
          <Button size="sm" variant="outline" disabled>
            <FolderOpen size={15} class="mr-1.5" />
            Elegir carpeta
          </Button>
        </SettingsRow>
      </SettingsSection>
    </SettingsPanel>
  );
}
