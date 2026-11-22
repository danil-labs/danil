import type { MaquinasDeAjustes } from "../model/machines-port";
import { For, Show, Suspense, createSignal, lazy } from "solid-js";
import { removeWorkspace, renameWorkspace } from "../queries/engine-workspaces";
import Pencil from "lucide-solid/icons/pencil";
import Trash2 from "lucide-solid/icons/trash-2";
import { Button } from "../../../../ui/src/Button";
import { Input } from "../../../../ui/src/Input";
import { FailureNote, asFailure } from "../../../../ui/src/Failure";
import { Skeleton } from "../../../../ui/src/Skeleton";
import { enfocarYSeleccionar } from "../../../../../apps/desktop/src/lib/focus";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { anunciarMudanza, anunciarRenombrado, createWorkspaces, type Workspace } from "../queries/workspaces-store";
import { capabilities } from "../../../../host/src/platform";
import { NavigationListRow, NAV_LIST_ROW_TRIPLE_LAYOUT, GlifoDeWorkspace, CarpetaDeCopias } from "./WorkspacesRow";
import { LogoDelWorkspace } from "./WorkspacesLogo";
import { Proyectos } from "./WorkspacesProjects";

// Chunk aparte: la cuenta de Danil del workspace solo pesa al abrir esta pantalla.
const WorkspaceAccount = lazy(() => import("./WorkspaceAccount"));

export default function Workspaces(props: { maquinas: MaquinasDeAjustes }) {
  const ws = createWorkspaces();

  const [editando, setEditando] = createSignal<string | null>(null);
  const [borrador, setBorrador] = createSignal("");
  const [porBorrar, setPorBorrar] = createSignal<string | null>(null);

  function empezarARenombrar(w: Workspace) {
    setPorBorrar(null);
    setBorrador(w.name);
    setEditando(w.id);
  }

  async function guardar(w: Workspace) {
    const name = borrador().trim();
    setEditando(null);
    if (!name || name === w.name) return;
    try {
      await renameWorkspace({ id: w.id, name });
      // Se relee en vez de parchear la fila: el conteo de tareas se deriva del
      // disco.
      await ws.cargar();
      anunciarRenombrado();
    } catch (e) {
      ws.setFallo(asFailure(e));
    }
  }

  /**
   * El campo del renombrado en línea. Cancelar cancela: Escape y salir del
   * campo cierran sin guardar, y guardar es Enter.
   */
  const CampoDeNombre = (props: { w: Workspace }) => (
    <Input
      ref={enfocarYSeleccionar}
      class="min-h-8 flex-1"
      data-owns-escape
      value={borrador()}
      aria-label={t("settings.workspaces.rename_label", { name: props.w.name })}
      onInput={(e) => setBorrador(e.currentTarget.value)}
      onBlur={() => setEditando(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") void guardar(props.w);
        if (e.key === "Escape") {
          // Kobalte cierra el diálogo con el Escape que escucha en `document`:
          // sin frenarlo aquí, cancelar el nombre cierra Configuración entera.
          e.stopImmediatePropagation();
          setEditando(null);
        }
      }}
    />
  );

  const BotonDeRenombrar = (props: { w: Workspace }) => (
    <Button
      variant="ghost"
      size="icon"
      class="size-8 shrink-0"
      onClick={() => empezarARenombrar(props.w)}
      aria-label={t("settings.workspaces.rename", { name: props.w.name })}
      title={t("settings.workspaces.rename_title")}
    >
      <Pencil size={15} />
    </Button>
  );

  /* Aquí se elegía la fuente de contexto del workspace, y se fue a
     **Configuración → General → Contexto**. Esta pantalla administra los
     espacios de trabajo de esta máquina —cuáles hay, cómo se llaman, cuál se
     borra—; con qué material trabaja el activo es una preferencia suya, no una
     propiedad de la lista. */

  async function borrar(id: string) {
    setPorBorrar(null);
    try {
      await removeWorkspace({ id });
      await ws.cargar();
      anunciarMudanza();
    } catch (e) {
      ws.setFallo(asFailure(e));
    }
  }

  return (
    <Show when={!ws.cargando()} fallback={<Skeleton filas={3} />}>
      <Show
        when={!(ws.fallo() && !ws.lista())}
        fallback={<FailureNote f={ws.fallo()!} />}
      >
        <div class="grid gap-2">
          <ul class="m-0 grid list-none gap-0.5 p-0">
            <For each={ws.lista() ?? []}>
              {(w) => (
                <Show
                  when={w.id === ws.activo()}
                  fallback={
                    // Sin seleccionar: pulsar la fila cambia a ella, y
                    // renombrarla es el botón de al lado — dos gestos que no
                    // pueden compartir el mismo clic.
                    <li class="flex items-center gap-1">
                      <Show
                        when={editando() === w.id}
                        fallback={
                          <NavigationListRow
                            class={`${NAV_LIST_ROW_TRIPLE_LAYOUT} min-w-0 flex-1`}
                            onClick={() => {
                              setEditando(null);
                              setPorBorrar(null);
                              void ws.cambiarA(w.id);
                            }}
                          >
                            <GlifoDeWorkspace w={w} />
                            {/* Sin contador de tareas. Administrar un espacio es
                                renombrarlo, cambiar a él o borrarlo, y cuántas
                                tareas guarda no cambia ninguna de las tres. Donde sí cambia la
                                decisión es antes de borrar, y ahí sigue. */}
                            <span class="min-w-0 truncate text-left">{w.name}</span>
                          </NavigationListRow>
                        }
                      >
                        <div class="flex min-w-0 flex-1 items-center gap-3 px-2.5 py-2">
                          <GlifoDeWorkspace w={w} />
                          <CampoDeNombre w={w} />
                        </div>
                      </Show>
                      <BotonDeRenombrar w={w} />
                    </li>
                  }
                >
                  {/* Seleccionado: la misma tarjeta que levanta la selección en
                      el sistema visual, con sus proyectos dentro. */}
                  <li class="grid gap-1 rounded-md bg-surface-raised px-2.5 py-2 shadow-sm">
                    <div class="flex items-center gap-3">
                      <GlifoDeWorkspace w={w} />
                      <Show
                        when={editando() === w.id}
                        fallback={
                          <span class="min-w-0 flex-1 truncate px-1 py-1">
                            {w.name}
                          </span>
                        }
                      >
                        <CampoDeNombre w={w} />
                      </Show>
                      <BotonDeRenombrar w={w} />
                      <Show
                        when={porBorrar() === w.id}
                        fallback={
                          <Button
                            variant="ghost"
                            size="icon"
                            class="size-8 shrink-0 text-error-strong"
                            disabled={ws.turnosVivos() > 0}
                            onClick={() => setPorBorrar(w.id)}
                            aria-label={t("settings.workspaces.delete")}
                            title={
                              ws.bloqueado() ?? t("settings.workspaces.delete_title")
                            }
                          >
                            <Trash2 size={15} />
                          </Button>
                        }
                      >
                        <Button
                          variant="danger"
                          size="sm"
                          class="shrink-0"
                          onClick={() => void borrar(w.id)}
                        >
                          {w.sessions === 0
                            ? t("settings.workspaces.delete_now")
                            : t("settings.workspaces.delete_with", {
                                count: w.sessions,
                              })}
                        </Button>
                      </Show>
                    </div>

                    {/* Qué se lleva, dicho antes y no después. Borrar un
                        workspace no es quitar una entrada de una lista: se va la
                        carpeta del cliente con todo dentro, y el token del
                        llavero con ella. Un contador de tareas no lo dice —lo
                        que más duele perder suele ser lo que no se contó—. */}
                    <Show when={porBorrar() === w.id}>
                      <p class="m-0 pl-[27px] text-xs text-error-strong">
                        {t("settings.workspaces.delete_warning", {
                          sole:
                            (ws.lista()?.length ?? 0) <= 1
                              ? ` ${t("settings.workspaces.delete_sole")}`
                              : "",
                        })}
                      </p>
                    </Show>

                    <LogoDelWorkspace workspace={w} onCambio={() => void ws.cargar()} />

                    <CarpetaDeCopias workspace={w} onCambio={() => void ws.cargar()} />

                    <Show when={capabilities().danilAccount}>
                      <Suspense fallback={null}>
                        <WorkspaceAccount workspace={w.id} name={w.name} maquinas={props.maquinas} />
                      </Suspense>
                    </Show>

                    {/* Sus proyectos. Aquí y no en el selector de la caja porque
                        son dos actos distintos: elegir con cuál trabajar es de
                        todos los días y está a un clic; renombrar y borrar es de
                        una vez y va detrás de la puerta que le toca — el mismo
                        reparto que el workspace de arriba. */}
                    <Proyectos
                      onCambio={async () => {
                        await ws.cargar();
                        // **Y avisar fuera, que es lo que faltaba.** Sin esto,
                        // borrar un proyecto lo quita del disco y lo deja en el
                        // historial de la ventana de atrás, con sus tareas y
                        // todo: se puede abrir una que ya no existe.
                        anunciarMudanza();
                      }}
                    />
                  </li>
                </Show>
              )}
            </For>
          </ul>


          <Show when={ws.fallo()}>{(f) => <FailureNote f={f()} />}</Show>

          {/* Lo que una migración no pudo mover **no se pinta aquí**, y se quitó
              después de verlo en uso. La idea era buena —perder una tarea en
              silencio no es una opción— y aun así el resultado era un recuadro
              rojo permanente sobre algo ocurrido meses antes, que declaraba en
              su propio texto que nada se había perdido y no dejaba nada por
              hacer. El dueño del producto abrió la pantalla y preguntó qué era:
              esa es la medida de que sobra. El historial vive en
              `migrations.json`, que se sigue escribiendo. */}
        </div>
      </Show>
    </Show>
  );
}
