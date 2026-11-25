import type { createUsage } from "../shell/usage";
import { sameSite } from "../../../ui/src/lib/panels";
import { type Layout, type PanelGroup, type PanelSite as SitioDePanel, type Side as PanelSide } from "../../../ui/src/lib/panels-types.ts";
import { type DragPoint } from "../../../ui/src/lib/pointer-drag.ts";
import { moviendoHueco } from "../../../ui/src/lib/sites";
import { type TaskTab } from "../../../ui/src/lib/tabs-types.ts";
import { taskSideUsesSplitWidth, type TaskFiles } from "../../../ui/src/lib/taskFiles.ts";
import SearchPanel from "../../../features/chat/src/components/SearchPanel";
import { type DelegatedPanelModel } from "../../../features/projects/src/screens/DelegatedTasks";
import { type SearchSurface } from "../../../features/chat/src/screens/ThreadSearch.tsx";
import { taskFilesWidth } from "../../../features/code/src/screens/TaskFilesRow";
import { TaskSide, TaskSideShell } from "../../../features/code/src/screens/TaskSide";
import { type SessionRow } from "../../../features/projects/src/screens/Sessions.tsx";
import { DragOverlay } from "../../../features/tabs/src";
import { visoresDeCodigo } from "../featureSlots";
import { UsagePanel } from "../shell/UsageTool";
import { TaskFilesCard } from "./lazy-screens";
import SubtaskSidePanel from "./SubtaskSidePanel";
import { For, Show, Suspense, createEffect, createMemo, createSignal, type Accessor, type JSX, type Setter } from "solid-js";


/** Lo que el bloque usaba del cuerpo de App. */
export type CeldasDeTareasDeps = { PanelDeChat: (pp: { sesion: string | null; proyecto?: string | null; soloLectura?: boolean; inline?: boolean; toolbar?: () => JSX.Element; }) => JSX.Element; abrirSesion: (proyecto: string, id: string, activar?: string, propagateError?: boolean) => Promise<void>; agent: Accessor<string>; anchoDeArchivos: Accessor<number>; anchoDelArbol: Accessor<number>; archivoBorrado: (session: string, arbol: string, ruta: string) => void; archivoMovido: (session: string, arbol: string, desde: string, hasta: string) => void; archivosDeTarea: TaskFiles; arrastrando: Accessor<string | null>; celdaDe: (id: string) => { "grid-column": string; "grid-row": string; } | undefined; compacta: Accessor<boolean>; consumo: ReturnType<typeof createUsage>; cursor: Accessor<DragPoint | null>; delegatedPanels: Accessor<Map<string, () => DelegatedPanelModel>>; donde: () => { folder: string | undefined; sitio: { col: number; fila: number; }; indice: number; zone?: undefined; } | { folder: string | undefined; sitio: { col: number; fila: number; }; zone: PanelSide | "center"; indice?: undefined; } | { sitio: SitioDePanel; indice: undefined; zone: undefined; folder: string; } | null; dropSide: () => PanelSide | null; editorDeletionLocked: (id: string) => boolean; estiloDeLaCelda: (sitio: SitioDePanel | null) => { "grid-column": string; "grid-row": string; } | undefined; exportarChat: (id: string, proyecto: string) => Promise<void>; filaDe: (id: string) => SessionRow | undefined; llevaTiraInterior: (sitio: SitioDePanel | null | undefined) => boolean; mandarVentana: (sitio: SitioDePanel) => void; montadas: Accessor<Set<string>>; paneles: { columns: Accessor<PanelGroup[][]>; widths: Accessor<number[]>; heights: Accessor<number[]>; rowCount: () => number; activeSite: Accessor<SitioDePanel>; sites: () => SitioDePanel[]; siteOf: (id: string) => SitioDePanel | null; groupAt: (site: SitioDePanel) => PanelGroup | null; groupCount: () => number; rowsPerColumn: () => number[]; isSplit: () => boolean; canSplit: () => boolean; tabsAt: (site: SitioDePanel) => string[]; activeTabAt: (site: SitioDePanel) => string | null; isVisible: (id: string) => boolean; focus(site: SitioDePanel): void; showDraft(): void; activate(id: string): void; renameTabs(pairs: [string, string][]): void; placeLikeStrip(ids: string[], strip: string[]): void; sync(ids: string[]): boolean; close(id: string): string | null; move: (id: string, a: SitioDePanel, index?: number) => boolean; split: (id: string) => boolean; canSplitAt: (id: string, reference: SitioDePanel, side: PanelSide, unplaced?: boolean) => boolean; splitAt: (id: string, reference: SitioDePanel, side: PanelSide) => boolean; join: () => boolean; resizeColumns(i: number, a: number, b: number): void; resizeRows(i: number, a: number, b: number): void; layout: () => Layout; restore(layout: Layout | null, live: readonly string[]): void; bindTo(workspace: string | null, space: string | null): void; reset(): void; }; proyectoDePestana: (id: string) => string; searchSurfaces: Accessor<Map<string, SearchSurface>>; setSettings: Setter<string | null>; tapadoPorElProyecto: (sitio: SitioDePanel | null | undefined) => boolean; tareasEnVentanas: Accessor<(Pick<TaskTab, "id" | "session" | "mountKey"> & { workspace: string | null; })[]>; tituloDePestana: (id: string) => string; toolbarForTask: (session: () => string, site: () => SitioDePanel | null, visible: () => boolean) => JSX.Element; vivas: Accessor<string[]>; workspaceActivo: Accessor<string | null> };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 2292–2523, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createCeldasDeTareas(deps: CeldasDeTareasDeps) {
  const { PanelDeChat, abrirSesion, agent, anchoDeArchivos, anchoDelArbol, archivoBorrado, archivoMovido, archivosDeTarea, arrastrando, celdaDe, compacta, consumo, cursor, delegatedPanels, donde, dropSide, editorDeletionLocked, estiloDeLaCelda, exportarChat, filaDe, llevaTiraInterior, mandarVentana, montadas, paneles, proyectoDePestana, searchSurfaces, setSettings, tapadoPorElProyecto, tareasEnVentanas, tituloDePestana, toolbarForTask, vivas, workspaceActivo } = deps;
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
                  toolbar={() => toolbarForTask(session, sitio, () => celda() !== undefined && !tapadoPorElProyecto(sitio()))}
                />
              </Show>
            </div>
          );
        }}
      </For>

      {/* The right-side split pane of each open task: full-height beside the main chat with a matching 38 px header. */}
      <For each={tareasEnVentanas()}>
        {(p) => {
          const sitio = () => paneles.siteOf(p.id);
          const celda = () => celdaDe(p.id);
          const placement = createMemo<ReturnType<typeof celda>>(previous => celda() ?? previous);
          const panel = () => archivosDeTarea.panel(p.session);
          const [usado, setUsado] = createSignal(false);
          createEffect(() => { if (panel().open) setUsado(true); });
          const cubre = () => (panel().expanded && panel().mode === "files") || paneles.isSplit() || compacta();
          const visible = () => panel().open && celda() !== undefined && !tapadoPorElProyecto(sitio());
          const ancho = () => (cubre() ? undefined : taskFilesWidth(taskSideUsesSplitWidth(panel()), anchoDeArchivos(), anchoDelArbol()));
          return (
            <Show when={usado()}>
              <div class="pointer-events-none z-10 flex min-h-0 min-w-0 justify-self-end *:pointer-events-auto"
                classList={{ hidden: !visible(), "w-full pt-[38px]": cubre(), "mt-[30px]": llevaTiraInterior(sitio()), "transition-[width] duration-200 ease-out": !moviendoHueco() }}
                style={{ ...placement(), width: ancho() }}
                onPointerDown={() => { const d = sitio(); if (d) mandarVentana(d); }}>
                <TaskSideShell mode={panel().mode} covers={cubre()} side={<TaskSide mode={panel().mode}
                  searchSlot={searchSurfaces().get(p.session) ? <SearchPanel surface={searchSurfaces().get(p.session)!} /> : undefined}
                  usageSlot={<UsagePanel usage={consumo} agent={sameSite(paneles.siteOf(p.id) ?? null, paneles.activeSite()) ? agent() : (filaDe(p.session)?.agent ?? agent())} onManage={() => { archivosDeTarea.setOpen(p.session, false); setSettings("proveedores-ia"); }} onClose={() => archivosDeTarea.setOpen(p.session, false)} />}
                  delegatedSlot={
                    <SubtaskSidePanel
                      model={() => delegatedPanels().get(`${workspaceActivo()}/${p.session}`)?.()}
                      subtask={panel().subtask}
                      live={vivas()}
                      filaDe={filaDe}
                      onOpenSubtask={(folder, id) => archivosDeTarea.openSubtask(p.session, { project: folder, session: id })}
                      onShowOverview={() => archivosDeTarea.showSubtaskList(p.session)}
                      onOpenInTab={(folder, id) => { archivosDeTarea.setOpen(p.session, false); void abrirSesion(folder, id); }}
                      onClose={() => archivosDeTarea.setOpen(p.session, false)}
                      renderThread={(target) => <PanelDeChat sesion={target.session} proyecto={target.project} inline />}
                    />
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
