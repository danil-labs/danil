import SquarePen from "lucide-solid/icons/square-pen";
import { lazy, Show, Suspense } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { Button } from "../../../../ui/src/Button";
import { EmptyState } from "../../../../ui/src/EmptyState";
import { PANEL } from "../../../../ui/src/Panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../../ui/src/Tabs";
import Sessions from "./Sessions";
import { createVistaDeProyecto, type VistaDeProyectoProps } from "./project-view-state";
import { createPanelDeAgentes } from "./project-view-agents";
import { createPanelDeCarpeta } from "./project-view-workdir";
import { createPanelDeFuentes } from "./project-view-sources";


// Fuera de la carga inicial: la memoria solo se pinta en Configuración y trae el cliente de la cuenta.
const Memoria = lazy(() => import("../components/Memoria"));

/**
 * El proyecto abierto en el panel principal: su carpeta de trabajo, sus fuentes
 * y sus tareas.
 *
 * La carpeta de trabajo es el `cwd` del agente en toda tarea del proyecto: si
 * trae `.git` es un repositorio y el agente trabaja ahí como un desarrollador;
 * si no, es donde queda lo que las tareas produzcan (`projects::Project::working_directory`).
 * Las fuentes son lo que el agente lee además, con `--add-dir`: no forman parte
 * de la carpeta. La raíz de gobierno del workspace se lista y no se quita desde
 * aquí: la leen todos los proyectos y se cambia en Configuración.
 *
 * La vista abre en las tareas, y la configuración de la carpeta va en su propia
 * pestaña: una lista larga de tareas no la deja fuera de alcance ni al revés.
 */
export default function VistaDeProyecto(props: VistaDeProyectoProps) {
  const vista = createVistaDeProyecto(props);
  const { pestana, setPestana, encargados } = vista;
  const { PanelDeAgentes } = createPanelDeAgentes(props, vista);
  const { PanelDeCarpeta } = createPanelDeCarpeta(props, vista);
  const { PanelDeFuentes } = createPanelDeFuentes(props, vista);

  return (
    <div class="min-h-0 flex-1 overflow-y-auto">
      <Tabs
        value={pestana()}
        onChange={setPestana}
        class="mx-auto grid w-full max-w-[860px] gap-3 px-6 pt-4 pb-10"
      >
        <div class={cn(PANEL, "grid gap-3 px-4 pt-3")}>
          <header class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <h1 class="m-0 min-w-0 truncate text-xl font-display font-bold tracking-[-0.02em] text-neutral-950">
              {props.proyecto.name}
            </h1>
            <Button size="sm" onClick={props.onNueva}>
              <SquarePen size={14} />
              {t("projects.view.new_task")}
            </Button>
          </header>
          <TabsList>
            <TabsTrigger value="tasks">{t("projects.view.tasks_title")}</TabsTrigger>
            <TabsTrigger value="agents">{t("projects.view.agents_title")}</TabsTrigger>
            <TabsTrigger value="settings">{t("projects.view.settings_title")}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="tasks" class="min-w-0 outline-none">
          {/* La misma lista que el historial del sidebar, y a propósito: sus
              filas ya llevan el estado de cada tarea —trabajando, preguntó,
              espera aprobación— y su menú de mover y borrar. Dos listas de lo
              mismo divergen. */}
          <Show
            when={props.sessions.length > 0}
            fallback={
              <EmptyState class="bg-surface" title={t("projects.view.tasks_empty")} />
            }
          >
            <section class={cn(PANEL, "p-2")}>
              <Sessions
                sessions={props.sessions}
                groupByHandler
                current={props.current}
                vivas={props.vivas}
                aprobando={props.aprobando}
                destinos={props.destinos}
                de={props.proyecto.id}
                onPick={props.onAbrir}
                onDelete={props.onDelete}
                onMove={props.onMove}
                onEtapa={props.onEtapa}
                onRenombrar={props.onRenombrar}
                onPin={props.onPin}
              />
            </section>
          </Show>
        </TabsContent>

        <TabsContent value="agents" class="grid min-w-0 gap-3 outline-none">
          <PanelDeAgentes />
        </TabsContent>

        <TabsContent value="settings" class="grid min-w-0 gap-3 outline-none">
          <PanelDeCarpeta />

          <PanelDeFuentes />

          <Suspense>
            <Memoria
              project={props.proyecto.id}
              workspace={props.workspace}
              agents={props.agents}
              encargados={encargados().agents.map((e) => e.name)}
            />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}