import Monitor from "lucide-solid/icons/monitor";
import Plus from "lucide-solid/icons/plus";
import { Show, type JSX } from "solid-js";
import {
  Badge,
  Button,
  SettingsBlock,
  SettingsPanel,
  SettingsRow,
  SettingsSection,
} from "@danil/ui";

export interface MachinesTabProps {
  slot?: JSX.Element;
  onConnectMachine?: () => void;
}

export function MachinesTab(props: MachinesTabProps) {
  return (
    <Show when={props.slot} fallback={<FallbackMachinesTab {...props} />}>
      {props.slot}
    </Show>
  );
}

function FallbackMachinesTab(props: MachinesTabProps) {
  return (
    <SettingsPanel data-machines-tab="">
      <SettingsSection
        title="Tus máquinas"
        description="Máquinas virtuales y entornos de cómputo vinculados a tu cuenta."
        aside={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => props.onConnectMachine?.()}
          >
            <Plus size={14} class="mr-1" />
            Conectar máquina
          </Button>
        }
      >
        <SettingsRow
          lead={<Monitor size={18} class="text-neutral-500" />}
          label="Esta máquina"
          description="Entorno local de ejecución para agentes y proyectos."
        >
          <div class="flex items-center gap-2">
            <Badge forma="dato">activa</Badge>
          </div>
        </SettingsRow>
      </SettingsSection>
    </SettingsPanel>
  );
}
