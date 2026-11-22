import { t } from "../../../../apps/desktop/src/lib/i18n";
import { MIN_PANEL_HEIGHT, MIN_PANEL_WIDTH, gridTracks, sameSite } from "../../../../apps/desktop/src/lib/panels";
import { type Layout, type PanelGroup, type PanelSite as SitioDePanel, type Side as PanelSide } from "../../../../apps/desktop/src/lib/panels-types.ts";
import { type ContentTab, type FileTab, type Tab } from "../../../../apps/desktop/src/lib/tabs-types.ts";
import { cn } from "../../../../apps/desktop/src/lib/utils";
import { type PermissionRequest } from "../../../features/chat/src/screens/Chat.tsx";
import { type SessionRow } from "../../../features/projects/src/screens/Sessions.tsx";
import TabStrip from "../../../features/projects/src/screens/Tabs";
import { HEADER_HEIGHT, toggleMaximizeFromHeader } from "../../../host/src/window";
import { Button } from "../../../ui/src/Button";
import Paneles from "../shell/Panels";
import Columns2 from "lucide-solid/icons/columns-2";
import { type Accessor, For, Index, type JSX, type Setter, Show } from "solid-js";

import { DelegatedNone, type DelegatedPanelModel, DelegatedToolbar } from "../../../features/projects/src/screens/DelegatedTasks";
import { type SearchSurface, ThreadSearch, type ThreadSearchTarget } from "../../../features/chat/src/screens/ThreadSearch";
import UsageTool, {  } from "../shell/UsageTool";
import { type TaskFilesPanel, type TaskFilesSide, type TaskSideMode } from "../../../../apps/desktop/src/lib/taskFiles.ts";
import type { createUsage } from "../shell/usage";

/** Lo que el bloque usaba del cuerpo de App. */
export type ConversacionDeps = { CeldasDeContenido: () => JSX.Element; CeldasDeTareas: () => JSX.Element; activarPestana: (p: Tab) => Promise<void>; agent: Accessor<string>; alta: Accessor<boolean>; altosEnPantalla: () => number[]; anchosEnPantalla: () => number[]; archivosDeTarea: { panel: (task: string) => TaskFilesPanel; setOpen: (task: string, open: boolean) => void; present: (task: string, mode: TaskSideMode) => void; toggle: (task: string) => void; setExpanded: (task: string, expanded: boolean) => void; setTree: (task: string, tree: boolean) => void; setSide: (task: string, side: TaskFilesSide) => void; open: (task: string, file: { tree: string; path: string; changes: boolean; changed?: boolean; pinned?: boolean; }) => void; pin: (task: string, id: string) => void; activate: (task: string, id: string) => void; setDirty: (task: string, id: string, dirty: boolean) => void; close: (task: string, ids: string[]) => string[]; renamed: (task: string, tree: string, from: string, to: string) => void; removed: (task: string, tree: string, path: string) => void; dirtyOf: (task: string) => string[]; forget: (task: string) => void; }; arrastrarPestana: (id: string, event: PointerEvent) => void; botonDeArchivos: (sesion: () => string) => JSX.Element; botonDeNuevaPestana: () => JSX.Element; botonDelArbol: () => JSX.Element; cabeceraDeConversacion: HTMLDivElement | undefined; carpetaDelProyecto: () => string | null; cerrarBorrador: (sitio: SitioDePanel) => void; cerrarPestana: (id: string) => void; cerrarPestanas: (ids: string[]) => void; consumo: ReturnType<typeof createUsage>; controlesDerechos: HTMLDivElement | undefined; controlesIzquierdos: HTMLDivElement | undefined; delegatedPanels: Accessor<Map<string, () => DelegatedPanelModel>>; enBorrador: (sitio: SitioDePanel) => boolean; estiloDeLaCelda: (sitio: SitioDePanel | null) => { "grid-column": string; "grid-row": string; } | undefined; filaDe: (id: string) => SessionRow | undefined; filasEnPantalla: () => number[]; llaveDeBorrador: (proyecto: string | undefined) => string; llevaTiraInterior: (sitio: SitioDePanel | null | undefined) => boolean; mandarVentana: (sitio: SitioDePanel) => void; marcaDe: (sitio: SitioDePanel) => number | null; muestra: (id: string, mode: TaskSideMode) => boolean; nombreDeSeparar: (sitio: SitioDePanel) => string; paginaDeAgente: () => boolean; paneles: { columns: Accessor<PanelGroup[][]>; widths: Accessor<number[]>; heights: Accessor<number[]>; rowCount: () => number; activeSite: Accessor<SitioDePanel>; sites: () => SitioDePanel[]; siteOf: (id: string) => SitioDePanel | null; groupAt: (site: SitioDePanel) => PanelGroup | null; groupCount: () => number; rowsPerColumn: () => number[]; isSplit: () => boolean; canSplit: () => boolean; tabsAt: (site: SitioDePanel) => string[]; activeTabAt: (site: SitioDePanel) => string | null; isVisible: (id: string) => boolean; focus(site: SitioDePanel): void; showDraft(): void; activate(id: string): void; renameTabs(pairs: [string, string][]): void; placeLikeStrip(ids: string[], strip: string[]): void; sync(ids: string[]): boolean; close(id: string): string | null; move: (id: string, a: SitioDePanel, index?: number) => boolean; split: (id: string) => boolean; canSplitAt: (id: string, reference: SitioDePanel, side: PanelSide, unplaced?: boolean) => boolean; splitAt: (id: string, reference: SitioDePanel, side: PanelSide) => boolean; join: () => boolean; resizeColumns(i: number, a: number, b: number): void; resizeRows(i: number, a: number, b: number): void; layout: () => Layout; restore(layout: Layout | null, live: readonly string[]): void; bindTo(workspace: string | null, space: string | null): void; reset(): void; }; partirVentana: (sitio: SitioDePanel) => void; permissions: Accessor<PermissionRequest[]>; pestanaDelanteEn: (sitio: SitioDePanel) => string | null; pestanas: { pinned: Accessor<ReadonlySet<string>>; isPinned: (id: string) => boolean; pin: (id: string) => void; restorable: () => string[]; replacePreviews(groups: readonly (readonly string[])[], visible: readonly (string | null)[]): void; open: Accessor<Tab[]>; active: Accessor<string | null>; activeTab: () => Tab | null; load(ws: string | null, desk?: string | null): string | null; ensure(p: { id: string; project: string; titulo: string; }): void; commitDraft(draft: string, p: { id: string; project: string; titulo: string; }): void; openObservability(title: string): void; openScreen(machine: string, title: string): void; openContent(p: ContentTab): void; activate: (id: string | null) => void; close: (id: string) => Tab | null; closeMany: (ids: readonly string[], opts?: { remember?: boolean; }) => Tab | null; canReopen: () => boolean; reopen(alive: (p: Tab) => boolean): Tab | null; attachPreviewFiles: (project: string, session: string, tree: string) => [string, string][]; renameFiles: (session: string, tree: string, from: string, end: string) => [string, string][]; navigate(id: string, url: string): void; moveToProject(session: string, project: string): void; markChanged: (id: string) => void; dirty: Accessor<ReadonlySet<string>>; setDirty: (id: string, dirty: boolean) => void; registerSaver: (id: string, save: (() => Promise<boolean>) | null) => void; dirtyTabsToClose: (ids: string | readonly string[]) => FileTab[]; saveFiles: (ids: string[]) => Promise<boolean>; sync(find: (id: string) => { project: string; titulo: string; } | null): string[]; }; pestanasDe: (sitio: SitioDePanel) => Tab[]; preguntadas: Accessor<string[]>; project: Accessor<string>; puedeSepararseDe: (sitio: SitioDePanel) => boolean; reabrirPestana: () => void; reservaDerechaDeTiras: Accessor<number>; reservaIzquierdaDeTiras: Accessor<number>; setSearchSurfaces: Setter<Map<string, SearchSurface>>; settings: Accessor<string | null>; tapadoPorElProyecto: (sitio: SitioDePanel | null | undefined) => boolean; threadSearchTargets: Accessor<Map<string, ThreadSearchTarget>>; ventanas: () => SitioDePanel[]; vivas: Accessor<string[]>; vueltaDelBorrador: (sitio: SitioDePanel) => string | null; workspaceActivo: Accessor<string | null> };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 2525–2665, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createConversacion(deps: ConversacionDeps) {
  const { CeldasDeContenido, CeldasDeTareas, activarPestana, agent, alta, altosEnPantalla, anchosEnPantalla, archivosDeTarea, arrastrarPestana, botonDeArchivos, botonDeNuevaPestana, botonDelArbol, carpetaDelProyecto, cerrarBorrador, cerrarPestana, cerrarPestanas, consumo, delegatedPanels, enBorrador, estiloDeLaCelda, filaDe, filasEnPantalla, llaveDeBorrador, llevaTiraInterior, mandarVentana, marcaDe, muestra, nombreDeSeparar, paginaDeAgente, paneles, partirVentana, permissions, pestanaDelanteEn, pestanas, pestanasDe, preguntadas, project, puedeSepararseDe, reabrirPestana, reservaDerechaDeTiras, reservaIzquierdaDeTiras, setSearchSurfaces, settings, tapadoPorElProyecto, threadSearchTargets, ventanas, vivas, vueltaDelBorrador, workspaceActivo } = deps;
  const Conversacion = () => (
    <section class="relative flex h-full min-h-0 flex-col overflow-hidden">
      {/* Sin línea divisora y sin rótulo de sección: arriba va DE QUÉ es esta
          conversación y el único control que abre algo. El selector de agente no
          vive aquí: con qué agente corre un mensaje se decide al escribirlo. */}

      {/* El mismo eje que la cabecera del historial —el del semáforo,
          ver `lib/window.ts`— y con su hueco cuando la esquina superior
          izquierda es suya: al colapsar el historial a ancho cero, esta
          fila lleva el conmutador para traerlo de vuelta. Antes flotaba
          con `position: absolute`, sin compartir eje con nada. */}
      <Show when={paneles.isSplit()}>
      <div
        ref={deps.cabeceraDeConversacion}
        class={cn("tab-veil flex shrink-0 items-center gap-3 pr-4",
          HEADER_HEIGHT,
          "pl-4",
        )}
        data-tauri-drag-region=""
        onDblClick={toggleMaximizeFromHeader}
      >
        <div ref={deps.controlesIzquierdos} class="relative z-40 flex shrink-0 items-center gap-3">
        </div>
        {/* Las pestañas, donde estaba el título de la conversación: con
            una se ve como el título de siempre; con varias, las tareas
            a mano. El historial de la izquierda sigue siendo el
            historial entero; esto son las abiertas. Con el split, las
            de abajo llevan su tira en la cuadrícula, sin pagar una
            fila propia. */}

        {/* Sin partir hay una sola ventana y una sola tira. Su envoltorio y
            el «+» quedan fuera del `For`, que vuelve a montar la tira al
            abrir una tarea: así el «+» no cuesta nodos en cada apertura. */}
        {/* Partida, las tiras se alinean por las pistas reales de las
            ventanas: `pistas(anchosEnPantalla())`, igual que `Paneles`. */}
        <Show when={paneles.isSplit()}>
          <div
            class="pointer-events-none absolute inset-0 z-30 grid"
            style={{ "grid-template-columns": gridTracks(anchosEnPantalla()) }}
          >
            <For each={ventanas().filter((sitio) => sitio.fila === 0)}>
              {(sitio) => (
                <div
                  class="pointer-events-auto flex h-[30px] min-w-0 items-center px-2"
                  style={{
                    "grid-column": `${sitio.col * 2 + 1}`,
                    "padding-left":
                      sitio.col === 0
                        ? `${Math.max(8, reservaIzquierdaDeTiras())}px`
                        : undefined,
                    "padding-right":
                      sitio.col === anchosEnPantalla().length - 1
                        ? `${Math.max(8, reservaDerechaDeTiras())}px`
                        : undefined,
                  }}
                  data-tira=""
                  data-ventana={`${sitio.col},${sitio.fila}`}
                  onPointerDown={() => mandarVentana(sitio)}
                >
                  <TabStrip
                    session={filaDe}
                    tabs={pestanasDe(sitio)}
                  pinnedIds={pestanas.pinned()}
                  onPin={pestanas.pin}
                    activeId={pestanaDelanteEn(sitio)}
                    draftLabel={enBorrador(sitio) ? t("projects.tabs.draft") : undefined}
                    onCloseDraft={vueltaDelBorrador(sitio) !== null ? () => cerrarBorrador(sitio) : undefined}
                    liveIds={vivas()}
                    approvingIds={permissions().map((p) => p.session)}
                    waitingIds={preguntadas()}
                    onPick={(id) => {
                      const p = pestanas.open().find((x) => x.id === id);
                      if (p) void activarPestana(p);
                    }}
                    onClose={cerrarPestana}
                    dirtyIds={pestanas.dirty()}
                    onCloseMany={cerrarPestanas}
                    canReopen={pestanas.canReopen()}
                    onReopen={reabrirPestana}
                    onDrag={arrastrarPestana}
                    dropIndex={marcaDe(sitio)}
                  />
                  {botonDeNuevaPestana()}
                  <span class="flex-1" />
                  <Show when={pestanas.open().find(p => p.id === paneles.activeTabAt(sitio))?.clase !== "tarea"}>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="size-6 shrink-0 text-neutral-500"
                    disabled={!puedeSepararseDe(sitio)}
                    onClick={() => partirVentana(sitio)}
                    aria-label={nombreDeSeparar(sitio)}
                    title={nombreDeSeparar(sitio)}
                  >
                    <Columns2 size={14} />
                  </Button>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
        <div ref={deps.controlesDerechos} class="relative z-40 ml-auto flex shrink-0 items-center gap-3">
        </div>
      </div>
      </Show>


      {/* La columna del árbol de trabajo no reemplaza al chat: lo angosta. La
          vista de proyecto sí, y es la única cosa que lo hace: es lo que
          ocupa el panel cuando lo que se está mirando no es una conversación. */}

      {/* La conversación se esconde, no se desmonta, cuando hay un documento
          delante: un archivo y un artefacto son pestañas del mismo sitio que
          las tareas y ocupan este hueco; volver a la conversación devuelve
          el hilo donde iba y lo escrito sin mandar. Desmontarla tiraría las
          dos cosas. */}

      {/* Esa misma propiedad sostiene la cuadrícula: separar una pestaña no
          mueve estos nodos a otro padre, les asigna una celda con
          `grid-column`/`grid-row` dentro de la misma cuadrícula
          (`features/shell/Panels.tsx`). Cambia dónde se pinta cada uno y
          cuál está escondido, no quién lo pintó. */}
      <Paneles
        anchos={anchosEnPantalla()}
        altos={altosEnPantalla()}
        filasPorColumna={filasEnPantalla()}
        minimoAncho={MIN_PANEL_WIDTH}
        minimoAlto={MIN_PANEL_HEIGHT}
        etiquetaAncho={t("projects.split.divider")}
        etiquetaAlto={t("projects.split.divider_rows")}
        onRepartirAncho={paneles.resizeColumns}
        onRepartirAlto={paneles.resizeRows}
      >
      <Index each={ventanas()}>{site => {
        const task = () => pestanas.open().find(p => p.id === paneles.activeTabAt(site()) && p.clase === "tarea");
        const target = () => threadSearchTargets().get(task()?.session ?? "");
        // La ventana activa responde con lo elegido en el composer; las demás, con el agente de su tarea.
        const agenteDeLaVentana = () => sameSite(site(), paneles.activeSite())
          ? agent()
          : (filaDe(task()?.session ?? "")?.agent ?? agent());
        const idDePanel = () => task()?.session || (carpetaDelProyecto() ? llaveDeBorrador(project()) : "");
        const herramientas = () => <ThreadSearch conversation={task()?.session ?? ""} active={sameSite(site(), paneles.activeSite()) && settings() === null && !alta()}
              disabled={!task()?.session}
              open={muestra(task()?.session ?? "", "search")}
              messages={target()?.messages() ?? []} thread={() => target()?.thread()}
              onJump={block => target()?.jump(block)}
              onMove={delta => target()?.move(delta)}
              onToggle={() => { const id = task()?.session; if (id) archivosDeTarea.present(id, "search"); }}
              onShow={() => { const id = task()?.session; if (id && !muestra(id, "search")) archivosDeTarea.present(id, "search"); }}
              onClose={() => { const id = task()?.session; if (id) archivosDeTarea.setOpen(id, false); }}
              onSurface={(id, surface) => setSearchSurfaces((previous) => {
                if (surface) return new Map(previous).set(id, surface);
                if (!previous.has(id)) return previous;
                const next = new Map(previous);
                next.delete(id);
                return next;
              })}
              tools={<>
                <Show when={delegatedPanels().get(`${workspaceActivo()}/${task()?.session ?? ""}`)} fallback={<DelegatedNone />}>
                  {(read) => <DelegatedToolbar model={read()()} pressed={muestra(task()?.session ?? "", "delegated")} onClick={() => { const id = task()?.session; if (id) archivosDeTarea.present(id, "delegated"); }} />}
                </Show>
                <UsageTool usage={consumo} agent={agenteDeLaVentana()} pressed={muestra(idDePanel(), "usage")} onToggle={() => { const id = idDePanel(); if (id) archivosDeTarea.present(id, "usage"); }} />
                <Show when={task()?.session} fallback={<Show when={!paginaDeAgente()}>{botonDelArbol()}</Show>}>
                  {botonDeArchivos(() => task()?.session ?? "")}
                </Show>
              </>} />;
        // Centrada con la fila de máquina, proyecto y rama de la tarea (`TaskLocation`).
        // La tarea nueva (ventana sin pestaña) lleva la misma barra, con lo que aún no tiene apagado;
        // la página de un agente también es una ventana sin pestaña, y no es una tarea.
        return <Show when={(Boolean(task()) || (paneles.activeTabAt(site()) === null && !paginaDeAgente())) && !tapadoPorElProyecto(site())}>
          <div class="z-20 min-w-0 max-w-full self-start justify-self-end pt-2 pr-3" style={estiloDeLaCelda(site())}
            classList={{ "mt-[30px]": llevaTiraInterior(site()) }} onPointerDown={() => mandarVentana(site())}>
            {herramientas()}
          </div>
        </Show>;
      }}</Index>

      {/* Aquí solo viven las tiras de las filas inferiores: la primera usa
          la cabecera del chasis, que una fila inferior no comparte. Va
          encima de su celda con `align-self: start` y no en un contenedor
          propio: meter tira y contenido en un mismo padre por ventana los
          sacaría del padre común que arrastrar un visor necesita
          (`features/shell/Panels.tsx`). */}

      {/* Partir vive un nivel por debajo de las pestañas, a la derecha de
          su ventana, como en un terminal: pertenece al panel que va a
          partir, no a una fila compartida donde un botón único no diría
          cuál. Flota sobre la esquina (`self-start justify-self-end`) en
          vez de ocupar una fila propia de 30 px que separaría las
          pestañas del texto. */}

      {/* El icono son dos columnas y no una flecha: es una forma, no un
          movimiento. No es un conmutador —sin `aria-pressed`—: la vuelta
          atrás es cerrar la última pestaña de la ventana. */}
      <For each={ventanas().filter((sitio) => sitio.fila > 0 && pestanas.open().find(p => p.id === paneles.activeTabAt(sitio))?.clase !== "tarea")}>
        {(sitio) => (
          <div
            class="z-20 flex self-start justify-self-end p-1"
            style={estiloDeLaCelda(sitio)}
          >
            <Button
              variant="ghost"
              size="icon"
              class="size-6 text-neutral-500"
              disabled={!puedeSepararseDe(sitio)}
              onClick={() => partirVentana(sitio)}
              aria-label={nombreDeSeparar(sitio)}
              title={nombreDeSeparar(sitio)}
            >
              <Columns2 size={14} />
            </Button>
          </div>
        )}
      </For>

      <Show when={paneles.isSplit()}>
        <For each={ventanas().filter((sitio) => sitio.fila > 0)}>
          {(sitio) => (
            <div
              class="tab-veil z-30 flex h-[30px] min-w-0 items-center self-start px-2"
              style={estiloDeLaCelda(sitio)}
              // Cómo la encuentra el arrastre: `ventanaBajo` pregunta al
              // documento por estos dos atributos, que es lo que hace que soltar
              // valga tanto aquí como en el cuerpo del cuadrante.
              data-tira=""
              data-ventana={`${sitio.col},${sitio.fila}`}
              // Pulsar en cualquier sitio de la tira pone su ventana al mando,
              // aunque no se pulse una pestaña. Es lo que hace que la caja y la
              // columna derecha sigan al clic y no solo al cambio de pestaña.
              onPointerDown={() => mandarVentana(sitio)}
            >
              <TabStrip
                session={filaDe}
                tabs={pestanasDe(sitio)}
                  pinnedIds={pestanas.pinned()}
                  onPin={pestanas.pin}
                activeId={pestanaDelanteEn(sitio)}
                draftLabel={enBorrador(sitio) ? t("projects.tabs.draft") : undefined}
                onCloseDraft={vueltaDelBorrador(sitio) !== null ? () => cerrarBorrador(sitio) : undefined}
                liveIds={vivas()}
                approvingIds={permissions().map((p) => p.session)}
                waitingIds={preguntadas()}
                onPick={(id) => {
                  const p = pestanas.open().find((x) => x.id === id);
                  if (p) void activarPestana(p);
                }}
                onClose={cerrarPestana}
                dirtyIds={pestanas.dirty()}
                onCloseMany={cerrarPestanas}
                canReopen={pestanas.canReopen()}
                onReopen={reabrirPestana}
                onDrag={arrastrarPestana}
                dropIndex={marcaDe(sitio)}
              />
            </div>
          )}
        </For>
      </Show>
      <CeldasDeTareas />

      <CeldasDeContenido />
      </Paneles>

    </section>
  );
  return { Conversacion };
}
