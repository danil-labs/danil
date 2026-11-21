import Plus from "lucide-solid/icons/plus";
import Sparkles from "lucide-solid/icons/sparkles";
import { For, Show, type JSX } from "solid-js";
import {
  Badge,
  Button,
  SettingsBlock,
  SettingsPanel,
  SettingsRow,
  SettingsSection,
} from "@danil/ui";

export interface AiAccountsSectionProps {
  slot?: JSX.Element;
  onAddAccount?: () => void;
}

interface ProviderItem {
  id: string;
  name: string;
  detail: string;
  status: "connected" | "disconnected";
}

const PROVIDERS: ProviderItem[] = [
  {
    id: "claude",
    name: "Claude Code",
    detail: "Anthropic Claude 3.5 Sonnet & Claude 3.7",
    status: "disconnected",
  },
  {
    id: "codex",
    name: "Codex (ChatGPT)",
    detail: "OpenAI GPT-4o & o1 reasoning models",
    status: "disconnected",
  },
  {
    id: "antigravity",
    name: "Gemini / Antigravity",
    detail: "Google DeepMind Gemini 2.5 Flash & Pro",
    status: "disconnected",
  },
  {
    id: "grok",
    name: "Grok",
    detail: "xAI Grok 2 & Grok 3",
    status: "disconnected",
  },
];

export function AiAccountsSection(props: AiAccountsSectionProps) {
  return (
    <Show when={props.slot} fallback={<FallbackAiAccounts {...props} />}>
      {props.slot}
    </Show>
  );
}

function FallbackAiAccounts(props: AiAccountsSectionProps) {
  return (
    <SettingsPanel data-ai-accounts="">
      <SettingsSection
        title="OpenCode & Modelos Danil"
        description="Modelos y asistentes disponibles para tareas sin configuración adicional."
      >
        <SettingsRow
          label="OpenCode"
          description="Modelos de pago y Go con enrutamiento automático."
        >
          <Badge>incluido</Badge>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Cuentas de proveedores de IA"
        description="Conecta tus cuentas personales o institucionales para usar tus cuotas directas."
        aside={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => props.onAddAccount?.()}
          >
            <Plus size={14} class="mr-1" />
            Agregar cuenta
          </Button>
        }
      >
        <For each={PROVIDERS}>
          {(p) => (
            <SettingsRow
              lead={<Sparkles size={16} class="text-neutral-500" />}
              label={p.name}
              description={p.detail}
            >
              <div class="flex items-center gap-2">
                <Badge forma="dato">
                  {p.status === "connected" ? "conectada" : "sin conectar"}
                </Badge>
                <Button size="sm" variant="outline">
                  Conectar
                </Button>
              </div>
            </SettingsRow>
          )}
        </For>
      </SettingsSection>
    </SettingsPanel>
  );
}
