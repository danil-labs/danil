import Key from "lucide-solid/icons/key";
import Plus from "lucide-solid/icons/plus";
import { For, Show } from "solid-js";
import {
  Badge,
  Button,
  SettingsBlock,
  SettingsPanel,
  SettingsRow,
  SettingsSection,
} from "@danil/ui";

export interface SecretItem {
  name: string;
  hint: string;
  updatedAt?: string;
}

export interface SecretsTabProps {
  secrets?: SecretItem[];
  onAddSecret?: () => void;
  onChangeSecret?: (name: string) => void;
  onDeleteSecret?: (name: string) => void;
}

export function SecretsTab(props: SecretsTabProps) {
  const secretsList = () => props.secrets ?? [];

  return (
    <SettingsPanel data-secrets-tab="">
      <SettingsSection
        title="Secretos del espacio de trabajo"
        description="Variables de entorno y claves secretas cifradas disponibles para los agentes en sus ejecuciones."
        aside={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => props.onAddSecret?.()}
          >
            <Plus size={14} class="mr-1" />
            Nuevo secreto
          </Button>
        }
      >
        <Show
          when={secretsList().length > 0}
          fallback={
            <SettingsBlock>
              <div class="py-8 text-center text-sm text-neutral-500">
                <Key size={28} class="mx-auto mb-2 text-neutral-400" />
                <p class="m-0 font-medium text-neutral-800">No hay secretos guardados</p>
                <p class="m-0 text-xs text-neutral-500 mt-1">
                  Los secretos se almacenan sellados con WebCrypto y se inyectan como variables de entorno seguras.
                </p>
              </div>
            </SettingsBlock>
          }
        >
          <For each={secretsList()}>
            {(s) => (
              <SettingsRow
                lead={<Key size={16} class="text-neutral-500" />}
                label={<span class="font-mono">{s.name}</span>}
                description={
                  s.updatedAt ? `Actualizado ${s.updatedAt}` : "Variable de entorno sellada"
                }
              >
                <div class="flex items-center gap-2">
                  <Badge forma="dato">{`••••${s.hint}`}</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => props.onChangeSecret?.(s.name)}
                  >
                    Cambiar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    class="text-error-strong hover:bg-error/10"
                    onClick={() => props.onDeleteSecret?.(s.name)}
                  >
                    Borrar
                  </Button>
                </div>
              </SettingsRow>
            )}
          </For>
        </Show>
      </SettingsSection>
    </SettingsPanel>
  );
}
