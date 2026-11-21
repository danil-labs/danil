import RefreshCw from "lucide-solid/icons/refresh-cw";
import { For } from "solid-js";
import {
  Badge,
  Button,
  SettingsBlock,
  SettingsPanel,
  SettingsRow,
  SettingsSection,
} from "@danil/ui";

interface ToolItem {
  id: string;
  name: string;
  version: string;
  location: string;
  status: "ready" | "optional";
}

const TOOLS: ToolItem[] = [
  {
    id: "git",
    name: "Git",
    version: "2.43.0",
    location: "/usr/bin/git",
    status: "ready",
  },
  {
    id: "engine",
    name: "Danil Engine",
    version: "0.3.0",
    location: "bundled",
    status: "ready",
  },
  {
    id: "node",
    name: "Node.js",
    version: "22.12.0",
    location: "/usr/bin/node",
    status: "ready",
  },
  {
    id: "gh",
    name: "GitHub CLI",
    version: "2.40.0",
    location: "/usr/bin/gh",
    status: "optional",
  },
];

export function EnvironmentTab() {
  return (
    <SettingsPanel data-environment-tab="">
      <SettingsSection
        title="Estado del entorno"
        description="Herramientas instaladas, binarios y dependencias del sistema requeridas por Danil."
        aside={
          <Button size="compact" variant="ghost">
            <RefreshCw size={13} class="mr-1.5" />
            Comprobar
          </Button>
        }
      >
        <For each={TOOLS}>
          {(t) => (
            <SettingsRow
              label={t.name}
              description={`${t.version} · ${t.location}`}
            >
              <Badge forma="dato">{t.status === "ready" ? "listo" : "opcional"}</Badge>
            </SettingsRow>
          )}
        </For>
      </SettingsSection>

      <SettingsSection
        title="Versión de Danil"
        description="Actualizaciones del cliente y componentes de ejecución."
      >
        <SettingsRow
          label="Danil Desktop"
          description="Tienes la versión más reciente instalada."
        >
          <Button size="sm" variant="outline">
            Buscar actualización
          </Button>
        </SettingsRow>
      </SettingsSection>
    </SettingsPanel>
  );
}
