import { listen } from "../../../../apps/desktop/src/lib/serviceEvents";
import ChartNoAxesCombined from "lucide-solid/icons/chart-no-axes-combined";
import { createSignal, onCleanup, Show } from "solid-js";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { invoke } from "../../../engine-client/src/client.ts";
import { sharedLazy } from "../../../../apps/desktop/src/lib/sharedLazy";
import PuertosAbiertos from "./OpenPorts";

const Almacenamiento = sharedLazy(() => import("./Storage"));

// Lo de la app que avisa de algo, al pie de la columna de organizaciones; tema, mantener despierta y bug viven en el perfil (`ProfileMenu`).

type AgentsViewStatus = { installed: boolean; enabled: boolean };

export default function AppTools(props: {
  workspace: string | null;
  busy: boolean;
  onAbrirSitio: (url: string, project: string, session: string) => void;
  onObservability: () => void;
  /** Para el panel de archivos: tareas con turno vivo y con pestaña. */
  trabajando: string[];
  conPestana: string[];
  onAbrirTarea: (project: string, session: string) => void;
  /** El título y la carpeta de una tarea, para la pestaña Memoria de «Máquinas». */
  lookup?: (session: string) => { title: string; project?: string } | undefined;
}) {
  const [observability, setObservability] = createSignal(false);

  let observabilityRequest = 0;
  const refreshObservability = () => {
    const request = ++observabilityRequest;
    setObservability(false);
    void invoke<AgentsViewStatus>("agentsview_status")
      .then((status) => {
        if (request === observabilityRequest) setObservability(status.installed && status.enabled);
      })
      .catch(() => {});
  };
  refreshObservability();
  window.addEventListener("harness:workspace", refreshObservability);
  const agentsview = listen<boolean>("agentsview-changed", refreshObservability);
  onCleanup(() => {
    observabilityRequest++;
    window.removeEventListener("harness:workspace", refreshObservability);
    void agentsview.then((unlisten) => unlisten());
  });

  return (
    <div class="flex shrink-0 flex-col items-center gap-1 text-xs" data-app-tools="">
      <Show when={observability()}>
        <button
          class="grid size-8 shrink-0 place-items-center rounded-md text-neutral-500 outline-none hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label={t("observability.tab")}
          title={t("observability.tab")}
          onClick={props.onObservability}
        >
          <ChartNoAxesCombined size={16} />
        </button>
      </Show>
      <PuertosAbiertos vertical busy={props.busy} onAbrirSitio={props.onAbrirSitio} />
      <Almacenamiento
        vertical
        workspace={props.workspace}
        trabajando={props.trabajando}
        conPestana={props.conPestana}
        onAbrirTarea={props.onAbrirTarea}
        lookup={props.lookup}
      />
    </div>
  );
}
