import { t } from "../../../../apps/desktop/src/lib/i18n";
import type { createUsage } from "../shell/usage";
import { sameSite } from "../../../../apps/desktop/src/lib/panels";
import { type Layout, type PanelGroup, type PanelSite as SitioDePanel, type Side as PanelSide } from "../../../../apps/desktop/src/lib/panels-types.ts";
import { type DragPoint } from "../../../../apps/desktop/src/lib/pointer-drag.ts";
import { moviendoHueco } from "../../../../apps/desktop/src/lib/sites";
import { type ContentTab, type FileTab, type Tab, type TaskTab } from "../../../../apps/desktop/src/lib/tabs-types.ts";
import { type TaskFilesPanel, type TaskFilesSide, type TaskSideMode } from "../../../../apps/desktop/src/lib/taskFiles.ts";
import { cn } from "../../../../apps/desktop/src/lib/utils";
import SearchPanel from "../../../features/chat/src/components/SearchPanel";
import { type PermissionRequest } from "../../../features/chat/src/screens/Chat.tsx";
import { DelegatedNone, DelegatedPanel, DelegatedToolbar } from "../../../features/chat/src/screens/DelegatedTasks";
import { type DelegatedPanelModel } from "../../../features/chat/src/screens/DelegatedTasks.tsx";
import { ThreadSearch } from "../../../features/chat/src/screens/ThreadSearch";
import { type SearchSurface, type ThreadSearchTarget } from "../../../features/chat/src/screens/ThreadSearch.tsx";
import { taskFilesWidth } from "../../../features/code/src/screens/TaskFilesRow";
import { TaskSide, TaskSideShell } from "../../../features/code/src/screens/TaskSide";
import { type SessionRow } from "../../../features/projects/src/screens/Sessions.tsx";
import TabStrip from "../../../features/projects/src/screens/Tabs";
import { DragOverlay } from "../../../features/tabs/src";
import { BELOW_LOCATION } from "../../../host/src/window";
import { Button } from "../../../ui/src/Button";
import { visoresDeCodigo } from "../featureSlots";
import UsageTool, { UsagePanel } from "../shell/UsageTool";
import { TaskFilesCard } from "./lazy-screens";
import Columns2 from "lucide-solid/icons/columns-2";
import { For, Index, Show, Suspense, createEffect, createMemo, createSignal, type Accessor, type JSX, type Setter } from "solid-js";


/** Lo que el bloque usaba del cuerpo de App. */
export type CeldasDeTareasDeps = { PanelDeChat: (pp: { sesion: string | null; proyecto?: string | null; soloLectura?: boolean; }) => JSX.Element; activarPestana: (p: Tab) => Promise<void>; agent: Accessor<string>; alta: Accessor<boolean>; anchoDeArchivos: Accessor<number>; anchoDelArbol: Accessor<number>; archivoBorrado: (session: string, arbol: string, ruta: string) => void; archivoMovido: (session: string, arbol: string, desde: string, hasta: string) => void; archivosDeTarea: { panel: (task: string) => TaskFilesPanel; setOpen: (task: string, open: boolean) => void; present: (task: string, mode: TaskSideMode) => void; toggle: (task: string) => void; setExpanded: (task: string, expanded: boolean) => void; setTree: (task: string, tree: boolean) => void; setSide: (task: string, side: TaskFilesSide) => void; open: (task: string, file: { tree: string; path: string; changes: boolean; changed?: boolean; pinned?: boolean; }) => void; pin: (task: string, id: string) => void; activate: (task: string, id: string) => void; setDirty: (task: string, id: string, dirty: boolean) => void; close: (task: string, ids: string[]) => string[]; renamed: (task: string, tree: string, from: string, to: string) => void; removed: (task: string, tree: string, path: string) => void; dirtyOf: (task: string) => string[]; forget: (task: string) => void; }; arrastrando: Accessor<string | null>; arrastrarPestana: (id: string, event: PointerEvent) => void; botonDeArchivos: (sesion: () => string) => JSX.Element; botonDelArbol: () => JSX.Element; carpetaDelProyecto: () => string | null; celdaDe: (id: string) => { "grid-column": string; "grid-row": string; } | undefined; cerrarBorrador: (sitio: SitioDePanel) => void; cerrarPestana: (id: string) => void; cerrarPestanas: (ids: string[]) => void; compacta: Accessor<boolean>; consumo: ReturnType<typeof createUsage>; cursor: Accessor<DragPoint | null>; delegatedPanels: Accessor<Map<string, () => DelegatedPanelModel>>; donde: () => { folder: string | undefined; sitio: { col: number; fila: number; }; indice: number; zone?: undefined; } | { folder: string | undefined; sitio: { col: number; fila: number; }; zone: PanelSide | "center"; indice?: undefined; } | { sitio: SitioDePanel; indice: undefined; zone: undefined; folder: string; } | null; dropSide: () => PanelSide | null; editorDeletionLocked: (id: string) => boolean; enBorrador: (sitio: SitioDePanel) => boolean; estiloDeLaCelda: (sitio: SitioDePanel | null) => { "grid-column": string; "grid-row": string; } | undefined; exportarChat: (id: string, proyecto: string) => Promise<void>; filaDe: (id: string) => SessionRow | undefined; llaveDeBorrador: (proyecto: string | undefined) => string; llevaTiraInterior: (sitio: SitioDePanel | null | undefined) => boolean; mandarVentana: (sitio: SitioDePanel) => void; marcaDe: (sitio: SitioDePanel) => number | null; montadas: Accessor<Set<string>>; muestra: (id: string, mode: TaskSideMode) => boolean; nombreDeSeparar: (sitio: SitioDePanel) => string; paginaDeAgente: () => boolean; paneles: { columns: Accessor<PanelGroup[][]>; widths: Accessor<number[]>; heights: Accessor<number[]>; rowCount: () => number; activeSite: Accessor<SitioDePanel>; sites: () => SitioDePanel[]; siteOf: (id: string) => SitioDePanel | null; groupAt: (site: SitioDePanel) => PanelGroup | null; groupCount: () => number; rowsPerColumn: () => number[]; isSplit: () => boolean; canSplit: () => boolean; tabsAt: (site: SitioDePanel) => string[]; activeTabAt: (site: SitioDePanel) => string | null; isVisible: (id: string) => boolean; focus(site: SitioDePanel): void; showDraft(): void; activate(id: string): void; renameTabs(pairs: [string, string][]): void; placeLikeStrip(ids: string[], strip: string[]): void; sync(ids: string[]): boolean; close(id: string): string | null; move: (id: string, a: SitioDePanel, index?: number) => boolean; split: (id: string) => boolean; canSplitAt: (id: string, reference: SitioDePanel, side: PanelSide, unplaced?: boolean) => boolean; splitAt: (id: string, reference: SitioDePanel, side: PanelSide) => boolean; join: () => boolean; resizeColumns(i: number, a: number, b: number): void; resizeRows(i: number, a: number, b: number): void; layout: () => Layout; restore(layout: Layout | null, live: readonly string[]): void; bindTo(workspace: string | null, space: string | null): void; reset(): void; }; partirVentana: (sitio: SitioDePanel) => void; permissions: Accessor<PermissionRequest[]>; pestanaDelanteEn: (sitio: SitioDePanel) => string | null; pestanas: { pinned: Accessor<ReadonlySet<string>>; isPinned: (id: string) => boolean; pin: (id: string) => void; restorable: () => string[]; replacePreviews(groups: readonly (readonly string[])[], visible: readonly (string | null)[]): void; open: Accessor<Tab[]>; active: Accessor<string | null>; activeTab: () => Tab | null; load(ws: string | null, desk?: string | null): string | null; ensure(p: { id: string; project: string; titulo: string; }): void; commitDraft(draft: string, p: { id: string; project: string; titulo: string; }): void; openObservability(title: string): void; openScreen(machine: string, title: string): void; openContent(p: ContentTab): void; activate: (id: string | null) => void; close: (id: string) => Tab | null; closeMany: (ids: readonly string[], opts?: { remember?: boolean; }) => Tab | null; canReopen: () => boolean; reopen(alive: (p: Tab) => boolean): Tab | null; attachPreviewFiles: (project: string, session: string, tree: string) => [string, string][]; renameFiles: (session: string, tree: string, from: string, end: string) => [string, string][]; navigate(id: string, url: string): void; moveToProject(session: string, project: string): void; markChanged: (id: string) => void; dirty: Accessor<ReadonlySet<string>>; setDirty: (id: string, dirty: boolean) => void; registerSaver: (id: string, save: (() => Promise<boolean>) | null) => void; dirtyTabsToClose: (ids: string | readonly string[]) => FileTab[]; saveFiles: (ids: string[]) => Promise<boolean>; sync(find: (id: string) => { project: string; titulo: string; } | null): string[]; }; pestanasDe: (sitio: SitioDePanel) => Tab[]; preguntadas: Accessor<string[]>; project: Accessor<string>; proyectoDePestana: (id: string) => string; puedeSepararseDe: (sitio: SitioDePanel) => boolean; reabrirPestana: () => void; searchSurfaces: Accessor<Map<string, SearchSurface>>; setSearchSurfaces: Setter<Map<string, SearchSurface>>; setSettings: Setter<string | null>; settings: Accessor<string | null>; tapadoPorElProyecto: (sitio: SitioDePanel | null | undefined) => boolean; tareasEnVentanas: Accessor<(Pick<TaskTab, "id" | "session"> & { workspace: string | null; })[]>; threadSearchTargets: Accessor<Map<string, ThreadSearchTarget>>; tituloDePestana: (id: string) => string; ventanas: () => SitioDePanel[]; vivas: Accessor<string[]>; vueltaDelBorrador: (sitio: SitioDePanel) => string | null; workspaceActivo: Accessor<string | null> };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 2292–2523, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createCeldasDeTareas(deps: CeldasDeTareasDeps) {
  const { PanelDeChat, activarPestana, agent, alta, anchoDeArchivos, anchoDelArbol, archivoBorrado, archivoMovido, archivosDeTarea, arrastrando, arrastrarPestana, botonDeArchivos, botonDelArbol, carpetaDelProyecto, celdaDe, cerrarBorrador, cerrarPestana, cerrarPestanas, compacta, consumo, cursor, delegatedPanels, donde, dropSide, editorDeletionLocked, enBorrador, estiloDeLaCelda, exportarChat, filaDe, llaveDeBorrador, llevaTiraInterior, mandarVentana, marcaDe, montadas, muestra, nombreDeSeparar, paginaDeAgente, paneles, partirVentana, permissions, pestanaDelanteEn, pestanas, pestanasDe, preguntadas, project, proyectoDePestana, puedeSepararseDe, reabrirPestana, searchSurfaces, setSearchSurfaces, setSettings, settings, tapadoPorElProyecto, tareasEnVentanas, threadSearchTargets, tituloDePestana, ventanas, vivas, vueltaDelBorrador, workspaceActivo } = deps;
  const CeldasDeTareas = () => (
    <>
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
              onSurface={(id, surface) => setSearchSurfaces(previous => {
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

      {/* La pestaña que se está llevando, pegada al cursor: sin ella el
          gesto no dice que lleve nada. El arrastre nativo del navegador
          pinta este fantasma solo; el nuestro es por puntero
          (`arrastrarPestana`) y hay que pintarlo aquí, no en la tira, que
          no sabe dónde acabó el cursor. */}
      <DragOverlay
        dragging={arrastrando() !== null}
        cursor={cursor()}
        title={tituloDePestana(arrastrando()!)}
        split={paneles.isSplit()}
        hasDestination={donde() !== null}
        targetStyle={estiloDeLaCelda(donde()!.sitio)}
        side={dropSide()}
      />

      {/* Una conversación por tarea abierta, no por ventana: la clave es la
          tarea. Arrastrarla a otra ventana solo le cambia la celda —no se
          desmonta, no se vuelve a pedir el hilo, no se pierde lo escrito sin
          mandar. Con una por ventana, arrastrar costaría las tres cosas. */}

      {/* Se lee y no se escribe salvo en la activa (`PanelDeChat` ·
          `soloLectura`): la caja de escritura es una sola y vive donde está
          el mando, evitando que dos cajas manden con el agente y el modelo
          que eligió una (`lib/panels.ts`). */}
      <For each={tareasEnVentanas()}>
        {(p) => {
          const sitio = () => paneles.siteOf(p.id);
          /** Se ve si su ventana la tiene delante y esa ventana se pinta. */
          const celda = () => celdaDe(p.id);
          const placement = createMemo<ReturnType<typeof celda>>(previous => celda() ?? previous);
          const manda = () => sameSite(sitio(), paneles.activeSite())
            && celda() !== undefined && !tapadoPorElProyecto(sitio());
          return (
            <div
              class="flex min-h-0 min-w-0 flex-col"
              classList={{
                hidden: celda() === undefined || tapadoPorElProyecto(sitio()),
                "pt-8": llevaTiraInterior(sitio()),
              }}
              style={placement()}
              data-ventana={
                sitio() ? `${sitio()!.col},${sitio()!.fila}` : undefined
              }
              onPointerDown={() => {
                const d = sitio();
                if (d) mandarVentana(d);
              }}
            >
              <Show when={montadas().has(p.id)}>
                <PanelDeChat
                  sesion={p.session}
                  proyecto={proyectoDePestana(p.id)}
                  soloLectura={!manda()}
                />
              </Show>
            </div>
          );
        }}
      </For>

      {/* The files card of each open task: a sibling of its chat, kept mounted while the chat is not. */}
      <For each={tareasEnVentanas()}>
        {(p) => {
          const sitio = () => paneles.siteOf(p.id);
          const celda = () => celdaDe(p.id);
          const placement = createMemo<ReturnType<typeof celda>>(previous => celda() ?? previous);
          const panel = () => archivosDeTarea.panel(p.session);
          const [usado, setUsado] = createSignal(false);
          createEffect(() => { if (panel().open) setUsado(true); });
          const cubre = () => panel().expanded || paneles.isSplit() || compacta();
          const visible = () => panel().open && celda() !== undefined && !tapadoPorElProyecto(sitio());
          const ancho = () => (cubre() ? undefined : taskFilesWidth(panel().tabs.length > 0, anchoDeArchivos(), anchoDelArbol()));
          return (
            <Show when={usado()}>
              {/* The padding clears the location row (8 px of air plus the 30 px box)
                  instead of covering it: only the card takes the pointer. */}
              <div class={cn("pointer-events-none z-10 flex min-h-0 min-w-0 justify-self-end pr-2 pb-2 *:pointer-events-auto", BELOW_LOCATION)}
                classList={{ hidden: !visible(), "w-full pl-2": cubre(), "mt-[30px]": llevaTiraInterior(sitio()), "transition-[width] duration-200 ease-out": !moviendoHueco() }}
                style={{ ...placement(), width: ancho() }}
                onPointerDown={() => { const d = sitio(); if (d) mandarVentana(d); }}>
                <TaskSideShell mode={panel().mode} side={<TaskSide mode={panel().mode}
                  searchSlot={searchSurfaces().get(p.session) ? <SearchPanel surface={searchSurfaces().get(p.session)!} /> : undefined}
                  usageSlot={<UsagePanel usage={consumo} agent={sameSite(paneles.siteOf(p.id) ?? null, paneles.activeSite()) ? agent() : (filaDe(p.session)?.agent ?? agent())} onManage={() => { archivosDeTarea.setOpen(p.session, false); setSettings("proveedores-ia"); }} />}
                  delegatedSlot={
                    <Show when={delegatedPanels().get(`${workspaceActivo()}/${p.session}`)?.()} fallback={<p class="m-0 px-3 py-3 text-xs text-neutral-500">{t("chat.delegation.none")}</p>}>
                      <DelegatedPanel model={() => delegatedPanels().get(`${workspaceActivo()}/${p.session}`)?.()} />
                    </Show>
                  } />}>
                  <Suspense fallback={null}>
                    <TaskFilesCard visores={visoresDeCodigo} project={proyectoDePestana(p.id)} session={p.session} files={archivosDeTarea}
                      visible={visible()} readOnly={editorDeletionLocked(p.session)}
                      expandedOnly={paneles.isSplit() || compacta()}
                      onSaved={() => window.dispatchEvent(new CustomEvent("harness:copia"))}
                      onExportChat={() => exportarChat(p.session, proyectoDePestana(p.id))}
                      onMoved={archivoMovido} onRemoved={archivoBorrado} />
                  </Suspense>
                </TaskSideShell>
              </div>
            </Show>
          );
        }}
      </For>
    </>
  );
  return { CeldasDeTareas };
}
