import GitBranch from "lucide-solid/icons/git-branch";
import { For, Show, type JSX } from "solid-js";
import {
  Badge,
  Button,
  MarcaProveedor,
  SettingsPanel,
  SettingsRow,
  SettingsSection,
} from "@danil/ui";

export interface SourceControlSectionProps {
  slot?: JSX.Element;
  onConnect?: (providerId: string) => void;
}

interface GitHostItem {
  id: string;
  name: string;
  description: string;
  status: "connected" | "disconnected";
  user?: string;
}

const GIT_HOSTS: GitHostItem[] = [
  {
    id: "github",
    name: "GitHub",
    description: "Repositorios públicos y privados de GitHub y GitHub Enterprise.",
    status: "disconnected",
  },
  {
    id: "gitlab",
    name: "GitLab",
    description: "Instancias de GitLab.com y servidores autoalojados.",
    status: "disconnected",
  },
  {
    id: "bitbucket",
    name: "Bitbucket",
    description: "Espacios de trabajo y proyectos de Atlassian Bitbucket.",
    status: "disconnected",
  },
];

export function SourceControlSection(props: SourceControlSectionProps) {
  return (
    <Show when={props.slot} fallback={<FallbackSourceControl {...props} />}>
      {props.slot}
    </Show>
  );
}

function FallbackSourceControl(props: SourceControlSectionProps) {
  return (
    <SettingsPanel data-source-control="">
      <SettingsSection
        title="Control de Fuentes"
        description="Conecta proveedores de git para clonar, sincronizar y crear ramas en tus proyectos."
      >
        <For each={GIT_HOSTS}>
          {(h) => (
            <SettingsRow
              lead={<MarcaProveedor id={h.id} size={18} />}
              label={h.name}
              description={h.description}
            >
              <div class="flex items-center gap-2">
                <Badge forma="dato">
                  {h.status === "connected" ? "conectado" : "sin conectar"}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => props.onConnect?.(h.id)}
                >
                  Conectar
                </Button>
              </div>
            </SettingsRow>
          )}
        </For>
      </SettingsSection>

      <SettingsSection
        title="Herramientas locales de git"
        description="Integración con las credenciales y utilidades de la máquina local."
      >
        <SettingsRow
          lead={<GitBranch size={16} class="text-neutral-500" />}
          label="GitHub CLI (gh)"
          description="Usa la sesión existente de gh configurada en tu terminal."
        >
          <Badge>disponible</Badge>
        </SettingsRow>
      </SettingsSection>
    </SettingsPanel>
  );
}
