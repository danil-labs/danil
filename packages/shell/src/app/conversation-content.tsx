import { t } from "../../../ui/src/lib/i18n";
import type { createUsage } from "../shell/usage";
import { type Agent, type Project, type Source } from "../../../ui/src/lib/model.ts";
import { type CatalogosDeModelos } from "../../../ui/src/lib/models.ts";
import { sameSite } from "../../../ui/src/lib/panels";
import { type Layout, type PanelGroup, type PanelSite as SitioDePanel, type Side as PanelSide } from "../../../ui/src/lib/panels-types.ts";
import { moviendoHueco } from "../../../ui/src/lib/sites";
import { type Superficie } from "../../../ui/src/lib/surfaces.ts";
import { fileTabId, type ArtifactTab, type FileTab, type PluginTab, type ScreenTab, type SiteTab } from "../../../ui/src/lib/tabs";
import { type ContentTab, type Tab } from "../../../ui/src/lib/tabs-types.ts";
import { taskSideLayout, taskSideUsesSplitWidth, type TaskFiles } from "../../../ui/src/lib/taskFiles.ts";
import { cn } from "../../../ui/src/lib/utils";
import VisorDeArtefacto from "../../../features/artifacts/src/screens/ArtifactViewer";
import { type PermissionRequest } from "../../../features/chat/src/screens/Chat.tsx";
import { taskFilesWidth } from "../../../features/code/src/screens/TaskFilesRow";
import { createDockMotion, TaskSideShell } from "../../../features/code/src/screens/TaskSide";
import { type createSessionMutations as T_createSessionMutations } from "../../../features/projects/src";
import { type SessionRow } from "../../../features/projects/src/screens/Sessions.tsx";
import Sitio from "../../../features/sites/src/screens/Site";
import { openMachineScreen } from "../../../host/src/platform";
import { BELOW_LOCATION } from "../../../host/src/window";
import { materialDeProyecto, visoresDeCodigo } from "../featureSlots";
import PluginFrame from "../shell/PluginFrame";
import { UsagePanel } from "../shell/UsageTool";
import { createFreeRouterConsent, renderImage, renderPdf, renderTable } from "./chatSlots";
import { Screen, TaskFilesCard, VisorDeArchivo, VistaDeProyecto } from "./lazy-screens";
import { For, Index, Match, Show, Suspense, Switch, createEffect, createSignal, type Accessor, type JSX, type Setter } from "solid-js";


/** Lo que el bloque usaba del cuerpo de App. */
export type CeldasDeContenidoDeps = { PanelDeChat: (pp: { sesion: string | null; proyecto?: string | null; soloLectura?: boolean; inline?: boolean; }) => JSX.Element; abrirSesion: (proyecto: string, id: string, activar?: string, propagateError?: boolean) => Promise<void>; adjuntarAlProyecto: (id: string, source: string) => Promise<void>; agent: Accessor<string>; agents: Accessor<Agent[]>; anchoDeArchivos: Accessor<number>; anchoDelArbol: Accessor<number>; archivosDeTarea: TaskFiles; carpetaDelProyecto: () => string | null; carpetaEditable: (id: string, dir: string | null) => Promise<void>; celdaDe: (id: string) => { "grid-column": string; "grid-row": string; } | undefined; cerrarPestanasYa: (ids: string[]) => void; claveAbierta: () => string; compacta: Accessor<boolean>; consumo: ReturnType<typeof createUsage>; deleteTask: (project: string, id: string, members?: number) => void; draftBases: Accessor<Record<string, string>>; editorDeletionLocked: (id: string) => boolean; estiloDeLaCelda: (sitio: SitioDePanel | null) => { "grid-column": string; "grid-row": string; } | undefined; etaparSesion: ReturnType<typeof T_createSessionMutations>["etaparSesion"]; fijarSesion: (proyecto: string, id: string, pinned: boolean) => Promise<void>; hablarConEncargado: (enProyecto: string, name: string) => void; idsDeContenido: Accessor<string[]>; llaveDeBorrador: (proyecto: string | undefined) => string; llevaTiraInterior: (sitio: SitioDePanel | null | undefined) => boolean; mandarVentana: (sitio: SitioDePanel) => void; materialPedido: Accessor<string | null>; modelosParaAgentes: Accessor<{ superficies: Superficie[]; catalogos: CatalogosDeModelos; }>; moverSesion: (de: string, id: string, a: string) => Promise<void>; nuevaSesion: (enProyecto?: string) => void; paneles: { columns: Accessor<PanelGroup[][]>; widths: Accessor<number[]>; heights: Accessor<number[]>; rowCount: () => number; activeSite: Accessor<SitioDePanel>; sites: () => SitioDePanel[]; siteOf: (id: string) => SitioDePanel | null; groupAt: (site: SitioDePanel) => PanelGroup | null; groupCount: () => number; rowsPerColumn: () => number[]; isSplit: () => boolean; canSplit: () => boolean; tabsAt: (site: SitioDePanel) => string[]; activeTabAt: (site: SitioDePanel) => string | null; isVisible: (id: string) => boolean; focus(site: SitioDePanel): void; showDraft(): void; activate(id: string): void; renameTabs(pairs: [string, string][]): void; placeLikeStrip(ids: string[], strip: string[]): void; sync(ids: string[]): boolean; close(id: string): string | null; move: (id: string, a: SitioDePanel, index?: number) => boolean; split: (id: string) => boolean; canSplitAt: (id: string, reference: SitioDePanel, side: PanelSide, unplaced?: boolean) => boolean; splitAt: (id: string, reference: SitioDePanel, side: PanelSide) => boolean; join: () => boolean; resizeColumns(i: number, a: number, b: number): void; resizeRows(i: number, a: number, b: number): void; layout: () => Layout; restore(layout: Layout | null, live: readonly string[]): void; bindTo(workspace: string | null, space: string | null): void; reset(): void; }; permissions: Accessor<PermissionRequest[]>; pestanas: { pinned: Accessor<ReadonlySet<string>>; isPinned: (id: string) => boolean; pin: (id: string) => void; restorable: () => string[]; replacePreviews(groups: readonly (readonly string[])[], visible: readonly (string | null)[]): void; open: Accessor<Tab[]>; active: Accessor<string | null>; activeTab: () => Tab | null; load(ws: string | null, desk?: string | null): string | null; ensure(p: { id: string; project: string; titulo: string; }): void; commitDraft(draft: string, p: { id: string; project: string; titulo: string; }): void; openScreen(machine: string, title: string): void; openContent(p: ContentTab): void; activate: (id: string | null) => void; close: (id: string) => Tab | null; closeMany: (ids: readonly string[], opts?: { remember?: boolean; }) => Tab | null; canReopen: () => boolean; reopen(alive: (p: Tab) => boolean): Tab | null; attachPreviewFiles: (project: string, session: string, tree: string) => [string, string][]; renameFiles: (session: string, tree: string, from: string, end: string) => [string, string][]; navigate(id: string, url: string): void; moveToProject(session: string, project: string): void; markChanged: (id: string) => void; dirty: Accessor<ReadonlySet<string>>; setDirty: (id: string, dirty: boolean) => void; registerSaver: (id: string, save: (() => Promise<boolean>) | null) => void; dirtyTabsToClose: (ids: string | readonly string[]) => FileTab[]; saveFiles: (ids: string[]) => Promise<boolean>; sync(find: (id: string) => { project: string; titulo: string; } | null): string[]; }; project: Accessor<string>; projectList: Accessor<Project[]>; proyectoDeLaVista: () => Project | null; quitarDelProyecto: (id: string, source: string) => Promise<void>; renombrarSesion: (proyecto: string, id: string, title: string) => Promise<boolean>; sesionesConEstado: () => { [k: string]: SessionRow[]; }; sessionId: Accessor<string | null>; setMaterialPedido: Setter<string | null>; setSettings: Setter<string | null>; sitiosEnBlanco: () => SitioDePanel[]; sources: Accessor<Source[]>; tapadoPorElProyecto: (sitio: SitioDePanel | null | undefined) => boolean; vivas: Accessor<string[]>; workspaceActivo: Accessor<string | null> };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 2001–2291, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createCeldasDeContenido(deps: CeldasDeContenidoDeps) {
  const { PanelDeChat, abrirSesion, adjuntarAlProyecto, agent, agents, anchoDeArchivos, anchoDelArbol, archivosDeTarea, carpetaDelProyecto, carpetaEditable, celdaDe, cerrarPestanasYa, claveAbierta, compacta, consumo, deleteTask, draftBases, editorDeletionLocked, estiloDeLaCelda, etaparSesion, fijarSesion, hablarConEncargado, idsDeContenido, llaveDeBorrador, llevaTiraInterior, mandarVentana, materialPedido, modelosParaAgentes, moverSesion, nuevaSesion, paneles, permissions, pestanas, project, projectList, proyectoDeLaVista, quitarDelProyecto, renombrarSesion, sesionesConEstado, sessionId, setMaterialPedido, setSettings, sitiosEnBlanco, sources, tapadoPorElProyecto, vivas, workspaceActivo } = deps;
  const CeldasDeContenido = () => (
    <>
      {/* Toda ventana enseña algo: su pestaña de delante, o la conversación
          en blanco. La vista de proyecto ocupa la activa; una ventana sin
          pestaña delante pinta el blanco en su propia celda. */}

      {/* El blanco es de la celda, no de la ventana activa: `paneles.blanquear()`
          deja la ventana con sus pestañas y sin ninguna delante, y la celda
          hace la pregunta —no una señal global— para que enfocar otra
          ventana no se lleve el blanco con ella. */}

      {/* Dos ventanas en blanco del mismo proyecto comparten borrador y solo
          escribe la que manda. Proyectos distintos conservan borradores
          distintos. */}

      {/* El `For` de arriba pinta una conversación por tarea abierta: sin
          tareas no pinta ninguna. Sin este bloque, cerrar la última pestaña
          deja la ventana en negro sin que `tsc` lo detecte. */}
      <Show when={proyectoDeLaVista()}>
        {(p) => (
          <div
            class="flex min-h-0 min-w-0 flex-col"
            classList={{ "pt-8": llevaTiraInterior(paneles.activeSite()) }}
            style={estiloDeLaCelda(paneles.activeSite())}
            data-ventana={`${paneles.activeSite().col},${paneles.activeSite().fila}`}
          >
            <Suspense fallback={<div class="flex flex-1 items-center justify-center text-sm text-neutral-500" role="status">{t("projects.view.opening")}</div>}>
            <VistaDeProyecto material={materialDeProyecto}
              proyecto={p()}
              materialPedido={materialPedido() === p().id}
              onMaterialVisto={() => setMaterialPedido(null)}
              workspace={workspaceActivo()}
              modelos={modelosParaAgentes()} createFreeRouterConsent={createFreeRouterConsent}
              sources={sources()}
              agents={agents()}
              sessions={sesionesConEstado()[p().id] ?? []}
              current={sessionId()}
              vivas={vivas()}
              aprobando={permissions().map((x) => x.session)}
              destinos={projectList()
                .filter((x) => x.id !== p().id)
                .map((x) => ({ id: x.id, name: x.name }))}
              onNueva={() => nuevaSesion(p().id)}
              onAbrir={(id) => void abrirSesion(p().id, id)}
              onHablarCon={(name) => hablarConEncargado(p().id, name)}
              onDelete={(id, members) => void deleteTask(p().id, id, members)}
              onMove={(id, a) => void moverSesion(p().id, id, a)}
              onEtapa={(id, etapa) => void etaparSesion(p().id, id, etapa)}
              onPin={(id, pinned) => fijarSesion(p().id, id, pinned)}
              onRenombrar={(id, title) =>
                void renombrarSesion(p().id, id, title)
              }
              onAdjuntar={(source) => adjuntarAlProyecto(p().id, source)}
              onQuitar={(source) => quitarDelProyecto(p().id, source)}
              onCarpetaEditable={(dir) => carpetaEditable(p().id, dir)}
            />
            </Suspense>
          </div>
        )}
      </Show>

      {/* `Index` y no `For`: la lista son sitios, y `sitios()` construye
          objetos nuevos en cada lectura. Con `For` —que compara por
          referencia— activar una pestaña en OTRA ventana volvería a montar
          este blanco, perdiendo foco y punto de inserción del cursor.
          `Index` va por posición y reutiliza el nodo mientras la cuenta de
          ventanas en blanco no cambie. */}
      <Index each={sitiosEnBlanco()}>
        {(sitio) => (
          <div
            class="flex min-h-0 min-w-0 flex-col"
            classList={{ "pt-8": llevaTiraInterior(sitio()) }}
            style={estiloDeLaCelda(sitio())}
            data-ventana={`${sitio().col},${sitio().fila}`}
            onPointerDown={() => mandarVentana(sitio())}
          >
            <PanelDeChat
              sesion={null}
              soloLectura={!sameSite(sitio(), paneles.activeSite())}
            />
          </div>
        )}
      </Index>

      {/* Los archivos base de la carpeta, antes de que exista la tarea: el mismo panel acoplado con animación fluida. */}
      <Index each={sitiosEnBlanco()}>
        {(sitio) => {
          const llave = () => (carpetaDelProyecto() ? llaveDeBorrador(project()) : "");
          const panel = () => archivosDeTarea.panel(llave());
          const [usado, setUsado] = createSignal(false);
          createEffect(() => { if (llave() && panel().dock !== "none") setUsado(true); });
          const narrow = () => paneles.isSplit() || compacta();
          const layout = () => (llave() ? taskSideLayout(panel(), narrow()) : "closed");
          const tabVisible = () => !tapadoPorElProyecto(sitio());
          const visible = () => layout() !== "closed" && tabVisible();
          const renderedDock = createDockMotion(() => panel().dock, visible);
          const isFiles = () => renderedDock() === "files";
          const isFullWidth = () => layout() === "files-expanded" || layout() === "panel-full";
          const ancho = () => {
            if (!visible()) return "0px";
            if (isFullWidth()) return "100%";
            return taskFilesWidth(taskSideUsesSplitWidth(panel()), anchoDeArchivos(), anchoDelArbol());
          };
          return (
            <div
              data-task-side-drawer=""
              data-open={visible() ? "true" : "false"}
              aria-hidden={!visible() ? "true" : undefined}
              class={cn(
                "pointer-events-none z-10 flex min-h-0 min-w-0 justify-self-end overflow-hidden",
                isFiles() ? BELOW_LOCATION : "pt-[38px]",
                visible() ? "translate-x-0 opacity-100 *:pointer-events-auto" : "translate-x-3 opacity-0",
                !tabVisible() && "hidden",
                llevaTiraInterior(sitio()) && "mt-[30px]",
                !moviendoHueco() && "transition-[width,opacity,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              )}
              style={{ ...estiloDeLaCelda(sitio()), width: ancho() }}
              onPointerDown={() => mandarVentana(sitio())}
            >
              <Show when={usado() && project()}>
                {(proyecto) => (
                  <TaskSideShell
                    dock={renderedDock()}
                    layout={layout()}
                    onDismiss={() => { if (llave()) archivosDeTarea.closeDock(llave()); }}
                    subtaskSlot={null}
                    delegatedSlot={<p class="m-0 px-3 py-3 text-xs text-neutral-500">{t("chat.delegation.none")}</p>}
                    usageSlot={
                      <UsagePanel
                        usage={consumo}
                        agent={agent()}
                        onManage={() => { if (llave()) archivosDeTarea.closeDock(llave()); setSettings("proveedores-ia"); }}
                        onClose={() => { if (llave()) archivosDeTarea.closeDock(llave()); }}
                      />
                    }
                  >
                    <Suspense fallback={null}>
                      <TaskFilesCard visores={visoresDeCodigo} project={proyecto()} session="" panelKey={llave()} preview={{ baseRef: draftBases()[claveAbierta()] }}
                        files={archivosDeTarea} visible={visible() && panel().dock === "files"}
                        expandedOnly={narrow()}
                        onSaved={() => {}} onExportChat={async () => {}}
                        onMoved={() => {}} onRemoved={() => {}} />
                    </Suspense>
                  </TaskSideShell>
                )}
              </Show>
            </div>
          );
        }}
      </Index>

      {/* Cada documento queda montado, escondido cuando no es el que se
          está mirando: cambiar de pestaña y volver no vuelve a pedir el
          archivo, no pierde qué vista se había elegido ni el borrador sin
          guardar. */}

      {/* Se montan todos, no solo los de la tarea abierta: la tira es una,
          y activar el archivo de otra tarea abre esa tarea detrás
          (`activarPestana`); su visor sigue vivo mientras su pestaña
          exista. */}
      <For each={idsDeContenido()}>
        {(id) => {
          const p = () => pestanas.open().find((x) => x.id === id) ?? null;
          /**
           * En qué panel se enseña este documento, `-1` si en ninguno. No es
           * `id === pestanaActiva()`: con un solo panel son lo mismo, pero con
           * la pantalla partida un documento del panel de al lado se ve sin
           * ser la activa, y esa pregunta lo dejaría escondido.
           */
          const celda = () => celdaDe(id);
          const visible = () => celda() !== undefined;
          return (
            <Show when={p()}>
              {(abierta) => (
                <div
                  class="min-h-0 min-w-0"
                  classList={{
                    "overflow-y-auto": abierta().clase !== "plugin",
                    "overflow-hidden": abierta().clase === "plugin",
                    hidden: !visible() || tapadoPorElProyecto(paneles.siteOf(id)),
                    "pt-8": llevaTiraInterior(paneles.siteOf(id)),
                  }}
                  style={celda()}
                  data-ventana={(() => {
                    const d = paneles.siteOf(id);
                    return d ? `${d.col},${d.fila}` : undefined;
                  })()}
                  onPointerDown={() => {
                    const d = paneles.siteOf(id);
                    if (d) mandarVentana(d);
                  }}
                >
                  {/* `Switch` y no dos `Show` anidados: con tres clases,
                      el `fallback` de un `Show` deja de significar «la otra»
                      y pasa a significar «alguna de las otras dos». Aquí
                      cada clase se nombra. */}
                  <Switch>
                    {/* El estrechamiento va en el `when`, no dentro del
                        hijo: aquí el cuerpo corre una vez y lo que decide qué
                        se pinta es la expresión reactiva (`SYSTEM.md` § Las
                        reglas de Solid · 7). Con el `as` dentro del hijo, la
                        rama del archivo se construía también para una pestaña
                        de sitio, con `arbol` y `ruta` en `undefined`. */}
                    <Match
                      when={
                        abierta().clase === "archivo"
                          ? (abierta() as FileTab)
                          : null
                      }
                    >
                      {(a) => (
                        <Suspense fallback={null}><VisorDeArchivo visores={visoresDeCodigo}
                          project={a().project}
                          session={a().session}
                          readOnly={editorDeletionLocked(a().session)}
                          base={a().base}
                          arbol={a().arbol}
                          ruta={a().ruta}
                          cambiado={a().cambiado}
                          visible={visible()}
                          onSucio={(sucio) => pestanas.setDirty(id, sucio)}
                          onGuardador={(guardar) => pestanas.registerSaver(id, guardar)}
                          onBorrado={() => cerrarPestanasYa([id])}
                          onAbrirOtro={(ruta) =>
                            pestanas.openContent({
                              clase: "archivo",
                              id: fileTabId({ project: a().project, session: a().session, arbol: a().arbol, ruta }),
                              project: a().project,
                              session: a().session,
                              arbol: a().arbol,
                              ruta,
                              cambiado: false,
                            })
                          }
                          onGuardado={() => {
                            // Guardar convierte el archivo en uno cambiado: su
                            // pestaña gana la vista de cambios y el árbol
                            // relee su estado, que es de donde la pestaña saca
                            // su letra de git.
                            pestanas.markChanged(id);
                            window.dispatchEvent(
                              new CustomEvent("harness:copia"),
                            );
                          }}
                        /></Suspense>
                      )}
                    </Match>
                    <Match
                      when={
                        abierta().clase === "sitio"
                          ? (abierta() as SiteTab)
                          : null
                      }
                    >
                      {(s) => (
                        <Sitio
                          url={s().url}
                          visible={visible()}
                          navegador={s().navegador}
                          onNavego={(url) => s().navegador && pestanas.navigate(id, url)}
                        />
                      )}
                    </Match>
                    <Match
                      when={
                        abierta().clase === "artefacto"
                          ? (abierta() as ArtifactTab)
                          : null
                      }
                    >
                      {(a) => (
                        <Show
                          when={a().codigo}
                          fallback={<VisorDeArtefacto path={a().path} rel={a().rel} kind={a().kind} session={a().session} renderPdf={renderPdf} renderImage={renderImage} renderTable={renderTable} />}
                        >
                          <Suspense fallback={null}><VisorDeArchivo visores={visoresDeCodigo}
                            project={a().project}
                            session={a().session}
                            arbol=""
                            ruta={a().path}
                            suelto
                            cambiado={false}
                            visible={visible()}
                            onSucio={() => {}}
                            onGuardador={() => {}}
                            onGuardado={() => {}}
                          /></Suspense>
                        </Show>
                      )}
                    </Match>
                    <Match
                      when={
                        abierta().clase === "plugin"
                          ? (abierta() as PluginTab)
                          : null
                      }
                    >
                      {(pl) => (
                        <PluginFrame
                          pluginId={pl().pluginId}
                          title={pl().titulo}
                          url={pl().url}
                        />
                      )}
                    </Match>
                  </Switch>
                </div>
              )}
            </Show>
          );
        }}
      </For>

      <For each={pestanas.open().filter((p): p is ScreenTab => p.clase === "pantalla")}>
        {(p) => {
          return (
            <div
              class="min-h-0 min-w-0"
              classList={{ hidden: celdaDe(p.id) === undefined || tapadoPorElProyecto(paneles.siteOf(p.id)), "pt-8": llevaTiraInterior(paneles.siteOf(p.id)) }}
              style={celdaDe(p.id)}
            >
              <Suspense fallback={null}><Screen open={() => openMachineScreen(p.machine)} /></Suspense>
            </div>
          );
        }}
      </For>

    </>
  );
  return { CeldasDeContenido };
}
