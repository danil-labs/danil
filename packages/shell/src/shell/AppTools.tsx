import { sharedLazy } from "../../../ui/src/lib/sharedLazy";
import PuertosAbiertos from "./OpenPorts";

const Almacenamiento = sharedLazy(() => import("./Storage"));

// Lo de la app que avisa de algo, al pie de la columna de organizaciones; tema, mantener despierta y bug viven en el perfil (`ProfileMenu`).

export default function AppTools(props: {
  workspace: string | null;
  busy: boolean;
  onAbrirSitio: (url: string, project: string, session: string) => void;
  /** Para el panel de archivos: tareas con turno vivo y con pestaña. */
  trabajando: string[];
  conPestana: string[];
  onAbrirTarea: (project: string, session: string) => void;
  /** El título y la carpeta de una tarea, para la pestaña Memoria de «Máquinas». */
  lookup?: (session: string) => { title: string; project?: string } | undefined;
}) {
  return (
    <div class="flex shrink-0 flex-col items-center gap-1 text-xs" data-app-tools="">
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
