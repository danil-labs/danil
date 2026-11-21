import { createSignal } from "solid-js";
import { Select, SettingsPanel, SettingsRow, SettingsSection } from "@danil/ui";

export function NotifyTab() {
  const [notify, setNotify] = createSignal("all");

  return (
    <SettingsPanel>
      <SettingsSection
        title="Avisos"
        description="Notificaciones al terminar turnos o requerir aprobación."
      >
        <SettingsRow
          label="Cuándo avisar"
          description="Cuándo avisa una tarea que se mira desde otro lado o con la ventana sin foco."
        >
          <Select
            aria-label="Cuándo avisar"
            value={notify()}
            onChange={(e) => setNotify(e.currentTarget.value)}
          >
            <option value="all">Todas las tareas</option>
            <option value="needs_you">Solo cuando te necesita</option>
            <option value="off">Desactivados</option>
          </Select>
        </SettingsRow>
      </SettingsSection>
    </SettingsPanel>
  );
}
