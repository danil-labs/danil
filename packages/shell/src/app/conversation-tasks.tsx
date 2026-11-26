import type { createUsage } from "../shell/usage";
import { sameSite } from "../../../ui/src/lib/panels";
import { type Layout, type PanelGroup, type PanelSite as SitioDePanel, type Side as PanelSide } from "../../../ui/src/lib/panels-types.ts";
import { type DragPoint } from "../../../ui/src/lib/pointer-drag.ts";
import { moviendoHueco } from "../../../ui/src/lib/sites";
import { type TaskTab } from "../../../ui/src/lib/tabs-types.ts";
import { taskSideLayout, taskSideUsesSplitWidth, type TaskFiles } from "../../../ui/src/lib/taskFiles.ts";
import { cn } from "../../../ui/src/lib/utils";
import SearchPanel from "../../../features/chat/src/components/SearchPanel";
import { DelegatedPanel, type DelegatedPanelModel } from "../../../features/projects/src/screens/DelegatedTasks";
import { type SearchSurface } from "../../../features/chat/src/screens/ThreadSearch.tsx";
import { taskFilesWidth } from "../../../features/code/src/screens/TaskFilesRow";
import { createDockMotion, TaskSideShell } from "../../../features/code/src/screens/TaskSide";
import { type SessionRow } from "../../../features/projects/src/screens/Sessions.tsx";
import { DragOverlay } from "../../../features/tabs/src";
import { BELOW_LOCATION } from "../../../host/src/window";
import { visoresDeCodigo } from "../featureSlots";
import { UsagePanel } from "../shell/UsageTool";
import { TaskFilesCard } from "./lazy-screens";
import SubtaskSidePanel from "./SubtaskSidePanel";
import { For, Show, Suspense, createEffect, createMemo, createSignal, type Accessor, type JSX, type Setter } from "solid-js";


/** Lo que el bloque usaba del cuerpo de App. */
export type CeldasDeTareasDeps = { PanelDeChat: (pp: { sesion: string | null; proyecto?: string | null; soloLectura?: boolean; inline?: boolean; }) => JSX.Element; abrirSesion: (proyecto: string, id: string, activar?: string, propagateError?: boolean) => Promise<void>; agent: Accessor<string>; anchoDeArchivos: Accessor<number>; anchoDelArbol: Accessor<number>; archivoBorrado: (session: string, arbol: string, ruta: string) => void; archivoMovido: (session: string, arbol: string, desde: string, hasta: string) => void; archivosDeTarea: TaskFiles; arrastrando: Accessor<string | null>; celdaDe: (id: string) => { "grid-column": string; "grid-row": string; } | undefined; compacta: Accessor<boolean>; consumo: ReturnType<typeof createUsage>; cursor: Accessor<DragPoint | null>; delegatedPanels: Accessor<Map<string, () => DelegatedPanelModel>>; donde: () => { folder: string | undefined; sitio: { col: number; fila: number; }; indice: number; zone?: undefined; } | { folder: string | undefined; sitio: { col: number; fila: number; }; zone: PanelSide | "center"; indice?: undefined; } | { sitio: SitioDePanel; indice: undefined; zone: undefined; folder: string; } | null; dropSide: () => PanelSide | null; editorDeletionLocked: (id: string) => boolean; estiloDeLaCelda: (sitio: SitioDePanel | null) => { "grid-column": string; "grid-row": string; } | undefined; exportarChat: (id: string, proyecto: string) => Promise<void>; filaDe: (id: string) => SessionRow | undefined; llevaTiraInterior: (sitio: SitioDePanel | null | undefined) => boolean; mandarVentana: (sitio: SitioDePanel) => void; montadas: Accessor<Set<string>>; paneles: { columns: Accessor<PanelGroup[][]>; widths: Accessor<number[]>; heights: Accessor<number[]>; rowCount: () => number; activeSite: Accessor<SitioDePanel>; sites: () => SitioDePanel[]; siteOf: (id: string) => SitioDePanel | null; groupAt: (site: SitioDePanel) => PanelGroup | null; groupCount: () => number; rowsPerColumn: () => number[]; isSplit: () => boolean; canSplit: () => boolean; tabsAt: (site: SitioDePanel) => string[]; activeTabAt: (site: SitioDePanel) => string | null; isVisible: (id: string) => boolean; focus(site: SitioDePanel): void; showDraft(): void; activate(id: string): void; renameTabs(pairs: [string, string][]): void; placeLikeStrip(ids: string[], strip: string[]): void; sync(ids: string[]): boolean; close(id: string): string | null; move: (id: string, a: SitioDePanel, index?: number) => boolean; split: (id: string) => boolean; canSplitAt: (id: string, reference: SitioDePanel, side: PanelSide, unplaced?: boolean) => boolean; splitAt: (id: string, reference: SitioDePanel, side: PanelSide) => boolean; join: () => boolean; resizeColumns(i: number, a: number, b: number): void; resizeRows(i: number, a: number, b: number): void; layout: () => Layout; restore(layout: Layout | null, live: readonly string[]): void; bindTo(workspace: string | null, space: string | null): void; reset(): void; }; proyectoDePestana: (id: string) => string; searchSurfaces: Accessor<Map<string, SearchSurface>>; setSettings: Setter<string | null>; tapadoPorElProyecto: (sitio: SitioDePanel | null | undefined) => boolean; tareasEnVentanas: Accessor<(Pick<TaskTab, "id" | "session" | "mountKey"> & { workspace: string | null; })[]>; tituloDePestana: (id: string) => string; vivas: Accessor<string[]>; workspaceActivo: Accessor<string | null> };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 2292–2523, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createCeldasDeTareas(deps: CeldasDeTareasDeps) {
  const { PanelDeChat, agent, anchoDeArchivos, anchoDelArbol, archivoBorrado, archivoMovido, archivosDeTarea, arrastrando, celdaDe, compacta, consumo, cursor, delegatedPanels, donde, dropSide, editorDeletionLocked, estiloDeLaCelda, exportarChat, filaDe, llevaTiraInterior, mandarVentana, montadas, paneles, proyectoDePestana, searchSurfaces, setSettings, tapadoPorElProyecto, tareasEnVentanas, tituloDePestana, vivas, workspaceActivo } = deps;
  const clavesDeTareas = createMemo(
    () => tareasEnVentanas().map((p) => p.mountKey ?? p.id),
    [],
    { equals: (a, b) => a.length === b.length && a.every((k, i) => k === b[i]) },
  );
  const tareaPorClave = (clave: string) => tareasEnVentanas().find((p) => (p.mountKey ?? p.id) === clave);
  const CeldasDeTareas = () => (
    <>

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

      {/* Una conversación por tarea abierta, con clave estable al promover de
          provisional a id real: así no se desmonta el composer al nacer la tarea. */}
      <For each={clavesDeTareas()}>
        {(clave) => {
          const id = () => tareaPorClave(clave)?.id ?? clave;
          const session = () => tareaPorClave(clave)?.session ?? clave;
          const sitio = () => paneles.siteOf(id());
          /** Se ve si su ventana la tiene delante y esa ventana se pinta. */
          const celda = () => celdaDe(id());
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
              <Show when={montadas().has(id())}>
                <PanelDeChat
                  sesion={session()}
                  proyecto={proyectoDePestana(id())}
                  soloLectura={!manda()}
                />
              </Show>
            </div>
          );
        }}
      </For>

      {/* Unified docked side panel below the fixed top bar: smoothly pushes the main chat (zero overlays). */}
      <For each={tareasEnVentanas()}>
        {(p) => {
          const sitio = () => paneles.siteOf(p.id);
          const celda = () => celdaDe(p.id);
          const placement = createMemo<ReturnType<typeof celda>>(previous => celda() ?? previous);
          const panel = () => archivosDeTarea.panel(p.session);
          const [usado, setUsado] = createSignal(false);
          createEffect(() => { if (panel().dock !== "none") setUsado(true); });
          const narrow = () => paneles.isSplit() || compacta();
          const layout = () => taskSideLayout(panel(), narrow());
          const tabVisible = () => celda() !== undefined && !tapadoPorElProyecto(sitio());
          const visible = () => layout() !== "closed" && tabVisible();
          const renderedDock = createDockMotion(() => panel().dock, visible);
          const isFiles = () => renderedDock() === "files";
          const isFullWidth = () => layout() === "files-expanded" || layout() === "subtask-full" || layout() === "panel-full";
          const ancho = () => {
            if (!visible()) return "0px";
            if (isFullWidth()) return "100%";
            return taskFilesWidth(taskSideUsesSplitWidth(panel()), anchoDeArchivos(), anchoDelArbol());
          };
          const delegatedModel = () => delegatedPanels().get(`${workspaceActivo()}/${p.session}`)?.();
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
              style={{ ...placement(), width: ancho() }}
              onPointerDown={() => { const d = sitio(); if (d) mandarVentana(d); }}
            >
              <Show when={usado()}>
                <TaskSideShell
                  dock={renderedDock()}
                  layout={layout()}
                  onDismiss={() => archivosDeTarea.closeDock(p.session)}
                  subtaskSlot={
                    <SubtaskSidePanel
                      model={delegatedModel}
                      subtask={panel().subtask}
                      live={vivas()}
                      filaDe={filaDe}
                      onClose={() => archivosDeTarea.closeDock(p.session)}
                      renderThread={(target) => <PanelDeChat sesion={target.session} proyecto={target.project} inline />}
                    />
                  }
                  searchSlot={searchSurfaces().get(p.session) ? <SearchPanel surface={searchSurfaces().get(p.session)!} /> : undefined}
                  delegatedSlot={
                    <DelegatedPanel
                      model={delegatedModel}
                      onOpenSubtask={(folder, id) => archivosDeTarea.openSubtask(p.session, { project: folder, session: id })}
                    />
                  }
                  usageSlot={
                    <UsagePanel
                      usage={consumo}
                      agent={sameSite(paneles.siteOf(p.id) ?? null, paneles.activeSite()) ? agent() : (filaDe(p.session)?.agent ?? agent())}
                      onManage={() => { archivosDeTarea.closeDock(p.session); setSettings("proveedores-ia"); }}
                      onClose={() => archivosDeTarea.closeDock(p.session)}
                    />
                  }
                >
                  <Suspense fallback={null}>
                    <TaskFilesCard visores={visoresDeCodigo} project={proyectoDePestana(p.id)} session={p.session} files={archivosDeTarea}
                      visible={visible() && panel().dock === "files"} readOnly={editorDeletionLocked(p.session)}
                      expandedOnly={narrow()}
                      onSaved={() => window.dispatchEvent(new CustomEvent("harness:copia"))}
                      onExportChat={() => exportarChat(p.session, proyectoDePestana(p.id))}
                      onMoved={archivoMovido} onRemoved={archivoBorrado} />
                  </Suspense>
                </TaskSideShell>
              </Show>
            </div>
          );
        }}
      </For>
    </>
  );
  return { CeldasDeTareas };
}
