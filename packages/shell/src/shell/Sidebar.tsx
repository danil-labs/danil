import { SignalDot } from "../../../ui/src/SignalDot";
import History from "lucide-solid/icons/history";
import SquarePen from "lucide-solid/icons/square-pen";
import { createEffect, createSignal, lazy, on, onCleanup, Show, Suspense } from "solid-js";
import { puntoDelArrastre, tareaEnVuelo } from "../../../ui/src/lib/drag";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { ariaDeAtajo } from "../../../../apps/desktop/src/lib/shortcuts";
import { KeyedList } from "../../../ui/src/KeyedList";
import { TeclaDeAtajo } from "../../../ui/src/Shortcut";
import {
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  Sidebar as SidebarShell,
} from "../../../ui/src/sidebar";
import { groupKey } from "../../../../apps/desktop/src/lib/sidebarView";
import { LazyPart, retryableLazy } from "../../../ui/src/LazyPart";
import { createTareasDelRiel } from "./sidebar-groups";
import { createDockDelRiel } from "./sidebar-dock";
import { createFilas, type SidebarProps } from "./sidebar-rows";

export { createSidebar } from "./sidebar-state";

const NewAgent = retryableLazy(() => import("../../../features/projects/src/screens/NewAgent"));

// Fuera de la carga inicial: el botón y el dock llegan un instante después de la lista.
const AgentDock = lazy(() => import("./AgentDock"));


/* El ancho vive en `ColumnaLateral`, que es la columna que envuelve a esta
   barra. Aquí había cuatro constantes —expandido, mínimo, máximo y el riel— que
   existían para alimentar un panel redimensionable; ese panel se fue, y con él
   la única razón de que el ancho fuera un número en este archivo. */

/**
 * La columna izquierda, montada sobre el shell de `ui/sidebar.tsx`.
 *
 * **Las tareas de todas las carpetas, por carpeta salvo que se elija otra
 * agrupación.** Por carpeta, una sin tareas también tiene su cabecera: la
 * recién agregada se ve. Sin agrupar, la carpeta es un dato de cada fila.
 */
export default function Sidebar(props: SidebarProps) {
  const [creatingAgentIn, setCreatingAgentIn] = createSignal<{ id: string; name: string } | null>(null);
  let listViewport: HTMLDivElement | undefined;
  // Colapsado, el historial no desaparece: se abre al lado del riel.
  const [desplegado, setDesplegado] = createSignal(false);
  let riel: HTMLDivElement | undefined;

  // Expandir vuelve redundante el desplegable: la lista ya está a la vista.
  createEffect(
    on(
      () => props.collapsed,
      (c) => {
        if (!c) setDesplegado(false);
      },
    ),
  );

  createEffect(
    on(desplegado, (abierto) => {
      if (!abierto) return;
      const alPulsar = (e: PointerEvent) => {
        if (!riel?.contains(e.target as Node)) setDesplegado(false);
      };
      const alTeclear = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setDesplegado(false);
        }
      };
      document.addEventListener("pointerdown", alPulsar);
      window.addEventListener("keydown", alTeclear, true);
      onCleanup(() => {
        document.removeEventListener("pointerdown", alPulsar);
        window.removeEventListener("keydown", alTeclear, true);
      });
    }),
  );

  const tareas = createTareasDelRiel(props);
  const { vista, cambiarVista, nombreDe, todas, grupos, hayCarpetasVacias } = tareas;
  const { carpetaActual, agentesDelDock, carpetasDelAgente, gruposDelDock, rosterListo, perfilDe } = createDockDelRiel(props, tareas);
  const { FilaDeClon, Grupo } = createFilas(props, tareas, { setDesplegado, setCreatingAgentIn });

  /** La misma lista, montada en dos sitios: expandida y en el desplegable. */
  const Lista = () => (
    <div data-sidebar-tasks class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 rounded-[14px]">
      <Show when={props.clon}>{(c) => <FilaDeClon clon={c()} />}</Show>

      <Show when={todas().length === 0 && !hayCarpetasVacias()}>
        <Show
          when={props.projects.length === 0}
          fallback={<p class="m-0 px-2 pt-1 text-xs text-neutral-500" data-sidebar-empty="">{t("shell.sidebar.empty")}</p>}
        >
          <Show when={props.escritorio}>
            <p class="m-0 px-2 pt-1 text-xs text-neutral-500" data-desk-empty="">
              {t("spaces.rail.empty", { name: props.escritorio ?? "" })}
            </p>
          </Show>
        </Show>
      </Show>

      <Show when={todas().length > 0 && grupos().every((g) => g.tasks.length === 0)}>
        <p class="m-0 px-2 pt-1 text-xs text-neutral-500" data-sidebar-filtered-empty="">{t("shell.sidebar.filter_empty")}</p>
      </Show>

      <KeyedList each={grupos()} by={groupKey}>{(g) => <Grupo grupo={g()} />}</KeyedList>
    </div>
  );

  return (
    <div
      ref={riel}
      // El borde que separa esta región del chat lo dibuja `ColumnaLateral`, y
      // no aquí: es la frontera **entre** las dos columnas, así que tiene que
      // irse cuando la columna se va. Con el borde en este div, cerrarla lo
      // recortaba a la vez que el contenido; con el mismo borde en las dos
      // columnas habría dos definiciones de la misma línea.
      //
      // `w-full min-w-0`: sin eso el contenido no se entera del ancho del
      // contenedor —`overflow-visible` hace falta para el menú del pie y para
      // el desplegable— así que los títulos largos lo estiraban y empujaban
      // fuera de la vista lo que estuviera a la derecha, como el «+».
      class="relative z-40 h-full min-h-0 w-full min-w-0 overflow-hidden"
    >
      <Show when={creatingAgentIn()}>{project => <LazyPart><NewAgent
        abierto onAbrir={open => { if (!open) setCreatingAgentIn(null); }}
        project={project().id}
        modelos={props.modelos}
        createFreeRouterConsent={props.createFreeRouterConsent}
        onCreado={() => setCreatingAgentIn(null)}
      /></LazyPart>}</Show>
      <SidebarShell
        state={props.collapsed ? "collapsed" : "expanded"}
        // Sin cabecera ni pie: la lista se estira y Agentes queda pegado al fondo.
        class="h-full w-full min-w-0 grid-rows-[minmax(0,1fr)_auto]"
        aria-label={t("shell.sidebar.label")}
      >
        {/* Sin cabecera, el pie cae en la fila `1fr` de las tres que reparte
            `ui/sidebar.tsx`: se pega debajo de la lista y se va con lo que ésta
            crezca. */}

        <SidebarContent class="gap-2 px-2 pt-2 pb-0">
          <SidebarMenu class="gap-1.5">

            <SidebarMenuItem>
              {/* Nueva tarea es la acción principal, negra y sólida.
                  `primary` queda reservado para las acciones del agente. */}
              <SidebarMenuButton
                class="bg-neutral-950 font-bold text-neutral-50 hover:bg-neutral-950"
                aria-keyshortcuts={ariaDeAtajo("newTask")}
                aria-label={t("shell.sidebar.new_task")}
                onClick={() => {
                  props.onNew();
                  setDesplegado(false);
                }}
              >
                <SquarePen size={14} aria-hidden="true" />
                <Show when={!props.collapsed}>
                  <span>{t("shell.sidebar.new_task")}</span>
                  <TeclaDeAtajo accion="newTask" />
                </Show>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <Show when={props.collapsed}>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={desplegado()}
                  tooltip={t("shell.sidebar.tasks")}
                  aria-label={t("shell.sidebar.tasks")}
                  aria-expanded={desplegado()}
                  onClick={() => setDesplegado((v) => !v)}
                >
                  <History size={15} />
                  {/* Con la lista escondida, el riel sigue diciendo que hay una
                      sesión abierta: sin esto el estado se comunicaría solo al
                      desplegar. */}
                  <Show when={props.current}>
                    <SignalDot tone="working" class="ui-sidebar-menu-badge absolute top-1 right-1" />
                  </Show>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </Show>
          </SidebarMenu>

          <Show when={!props.collapsed}>
            {/* **`overflow-y-auto` y NO `overflow-auto`.** Aquél es de los dos
                ejes: los títulos llegaban al borde sin puntos suspensivos y lo
                de la derecha quedaba fuera de la vista. */}
            {/* `data-arrastre-scroll`: con la lista larga, arrastrar una tarea
                hasta un grupo que está fuera de la vista exige que el panel
                se desplace solo al llegar a sus bordes (`lib/drag.ts`). */}
            <div
              ref={listViewport}
              class="-mr-2 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pr-2"
              data-arrastre-scroll=""
            >
              <Lista />
            </div>
          </Show>
        </SidebarContent>

        {/* La banda de agentes se queda siempre: con o sin agentes. Antes
            desaparecía al quedar sin roster, y quien miraba perdía el sitio
            donde estaban. Vacía enseña el rótulo y el alta. */}
        <Show when={!props.collapsed}>
          <Suspense>
            <AgentDock
              agents={agentesDelDock()}
              selected={vista().agent}
              foldersOf={carpetasDelAgente}
              currentFolder={carpetaActual()}
              currentFolderName={carpetaActual() ? nombreDe(carpetaActual()!) ?? null : null}
              groups={gruposDelDock()}
              loading={!rosterListo()}
              onTalk={props.onHablarCon}
              onShowTasks={(agent) => cambiarVista({ ...vista(), agent })}
              onProfile={props.onAgentProfile}
              onSeeAll={() => props.onSettings("agentes")}
              onNewAgent={() => setCreatingAgentIn({ id: carpetaActual() ?? "", name: "" })}
              profileOf={perfilDe}
            />
          </Suspense>
        </Show>
      </SidebarShell>

      {/* El historial colapsado no desaparece: se abre al lado del riel. Este SÍ
          lleva borde y sombra: flota de verdad sobre lo que hay debajo, que es
          para lo que el sistema reserva la elevación. */}
      <Show when={props.collapsed && desplegado()}>
        <div class="absolute top-12 left-full z-40 ml-2 flex max-h-[min(60vh,420px)] w-70 flex-col overflow-hidden rounded-lg border border-border bg-surface-raised shadow-md">
          <div
            ref={listViewport}
            class="min-w-0 overflow-x-hidden overflow-y-auto p-2"
            data-arrastre-scroll=""
          >
            <Lista />
          </div>
        </div>
      </Show>

      {/* Lo que va en la mano mientras se arrastra una tarea.

          **Sin esto el gesto no se ve.** El puntero cambia de forma y el
          grupo de debajo se enciende, pero nada dice QUÉ se está moviendo.

          `pointer-events-none` no es cosmético: `lib/drag.ts` resuelve el
          destino con `elementFromPoint`, y un nodo pegado al puntero sería
          siempre lo que hay debajo del puntero. */}
      <Show when={tareaEnVuelo()}>
        {(enVuelo) => (
          <div
            aria-hidden="true"
            class="pointer-events-none fixed z-[90] max-w-64 truncate rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-neutral-950 shadow-md"
            style={{
              left: `${puntoDelArrastre().x + 12}px`,
              top: `${puntoDelArrastre().y + 10}px`,
            }}
          >
            {enVuelo().titulo}
          </div>
        )}
      </Show>
    </div>
  );
}
