import Files from "lucide-solid/icons/files";
import FolderOpen from "lucide-solid/icons/folder-open";
import { createSignal, Show } from "solid-js";
import {
  Button,
  Input,
  Select,
  SettingsBlock,
  SettingsPanel,
  SettingsRow,
  SettingsSection,
} from "@danil/ui";

export interface GeneralTabProps {
  name?: string;
  onSaveName?: (name: string) => void;
  projectDirectory?: string;
  onPickDirectory?: () => void;
  onResetDirectory?: () => void;
}

export function GeneralTab(props: GeneralTabProps) {
  const [userName, setUserName] = createSignal(props.name ?? "");
  const [permission, setPermission] = createSignal("balanced");
  const [agentLang, setAgentLang] = createSignal("es");

  return (
    <SettingsPanel>
      <SettingsSection title="Perfil">
        <SettingsRow
          label="Nombre"
          description="Cómo te llaman los agentes y cómo firmas los cambios."
        >
          <Input
            class="w-[260px]"
            aria-label="Nombre"
            value={userName()}
            placeholder="Tu nombre"
            onInput={(e) => setUserName(e.currentTarget.value)}
            onBlur={() => props.onSaveName?.(userName())}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Proyectos">
        <SettingsRow
          label="Carpeta de proyectos"
          description={
            <span class="break-all font-mono text-neutral-500">
              {props.projectDirectory ?? "~/danil-projects"}
            </span>
          }
        >
          <Button
            size="sm"
            variant="ghost"
            onClick={() => props.onResetDirectory?.()}
          >
            Restablecer
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => props.onPickDirectory?.()}
          >
            <FolderOpen size={15} class="mr-1.5" />
            Elegir carpeta
          </Button>
        </SettingsRow>

        <SettingsRow
          label="Permisos por defecto"
          description="Con este modo arrancan las tareas y los chats nuevos de este workspace."
        >
          <Select
            aria-label="Permisos por defecto"
            value={permission()}
            onChange={(e) => setPermission(e.currentTarget.value)}
          >
            <option value="balanced">Con confirmación (Recomendado)</option>
            <option value="autonomous">Autónomo (Sin confirmaciones)</option>
            <option value="strict">Supervisado (Confirmar cada orden)</option>
          </Select>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Lengua">
        <SettingsRow
          label="Lengua de la app"
          description="Idioma de los menús, avisos y etiquetas."
        >
          <Select aria-label="Lengua de la app" value="es" disabled>
            <option value="es">Español</option>
            <option value="en">English</option>
          </Select>
        </SettingsRow>

        <SettingsRow
          label="Lengua del agente"
          description="En qué lengua prefieres que respondan los asistentes."
        >
          <Select
            aria-label="Lengua del agente"
            value={agentLang()}
            onChange={(e) => setAgentLang(e.currentTarget.value)}
          >
            <option value="es">Responder en español</option>
            <option value="en">Responder en inglés</option>
            <option value="agent">Como el agente</option>
          </Select>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Contexto y fuentes">
        <SettingsRow
          label="Raíz del contexto"
          description="Material disponible por omisión en todas las tareas."
        >
          <Button variant="secondary" size="sm">
            <Files size={15} class="mr-1.5" />
            Elegir material
          </Button>
        </SettingsRow>
        <SettingsBlock>
          <p class="m-0 text-xs text-neutral-500">
            No hay fuentes secundarias vinculadas en este workspace.
          </p>
        </SettingsBlock>
      </SettingsSection>
    </SettingsPanel>
  );
}
