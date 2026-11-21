import RefreshCw from "lucide-solid/icons/refresh-cw";
import { createSignal, Show } from "solid-js";
import {
  Button,
  Select,
  SettingsBlock,
  SettingsPanel,
  SettingsRow,
  SettingsSection,
} from "@danil/ui";

export function ActivityTab() {
  const [machine, setMachine] = createSignal("local");

  return (
    <SettingsPanel data-activity-logs="">
      <SettingsSection
        title="Actividad y órdenes"
        description="Registro cronológico de órdenes, llamadas técnicas y procesos ejecutados en las máquinas."
        aside={
          <Button size="compact" variant="ghost">
            <RefreshCw size={13} class="mr-1.5" />
            Actualizar
          </Button>
        }
      >
        <SettingsRow
          label="Máquina"
          description="Selecciona de qué máquina consultar el registro de actividad."
        >
          <Select
            aria-label="Máquina"
            value={machine()}
            onChange={(e) => setMachine(e.currentTarget.value)}
          >
            <option value="local">Esta máquina (local)</option>
          </Select>
        </SettingsRow>

        <SettingsBlock>
          <p class="m-0 py-4 text-center text-sm text-neutral-500">
            No hay órdenes ni actividad reciente en esta máquina.
          </p>
        </SettingsBlock>
      </SettingsSection>
    </SettingsPanel>
  );
}
