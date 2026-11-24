import { t } from "../../../ui/src/lib/i18n";
import type { createUsage } from "../shell/usage";
import { sameSite } from "../../../ui/src/lib/panels";
import { type Layout, type PanelGroup, type PanelSite as SitioDePanel, type Side as PanelSide } from "../../../ui/src/lib/panels-types.ts";
import { type DragPoint } from "../../../ui/src/lib/pointer-drag.ts";
import { moviendoHueco } from "../../../ui/src/lib/sites";
import {    type TaskTab } from "../../../ui/src/lib/tabs-types.ts";
import { type TaskFilesPanel, type TaskFilesSide, type TaskSideMode } from "../../../ui/src/lib/taskFiles.ts";
import { cn } from "../../../ui/src/lib/utils";
import SearchPanel from "../../../features/chat/src/components/SearchPanel";
import {  DelegatedPanel, type DelegatedPanelModel } from "../../../features/projects/src/screens/DelegatedTasks";
import { type SearchSurface } from "../../../features/chat/src/screens/ThreadSearch.tsx";
import { taskFilesWidth } from "../../../features/code/src/screens/TaskFilesRow";
import { TaskSide, TaskSideShell } from "../../../features/code/src/screens/TaskSide";
import { type SessionRow } from "../../../features/projects/src/screens/Sessions.tsx";
import { DragOverlay } from "../../../features/tabs/src";
import { BELOW_LOCATION } from "../../../host/src/window";
import { visoresDeCodigo } from "../featureSlots";
import { UsagePanel } from "../shell/UsageTool";
import { TaskFilesCard } from "./lazy-screens";
import { For,  Show, Suspense, createEffect, createMemo, createSignal, type Accessor, type JSX, type Setter } from "solid-js";


/** Lo que el bloque usaba del cuerpo de App. */
export type CeldasDeTareasDeps = { PanelDeChat: (pp: { sesion: string | null; proyecto?: string | null; soloLectura?: boolean; }) => JSX.Element; agent: Accessor<string>; anchoDeArchivos: Accessor<number>; anchoDelArbol: Accessor<number>; archivoBorrado: (session: string, arbol: string, ruta: string) => void; archivoMovido: (session: string, arbol: string, desde: string, hasta: string) => void; archivosDeTarea: { panel: (task: string) => TaskFilesPanel; setOpen: (task: string, open: boolean) => void; present: (task: string, mode: TaskSideMode) => void; toggle: (task: string) => void; setExpanded: (task: string, expanded: boolean) => void; setTree: (task: string, tree: boolean) => void; setSide: (task: string, side: TaskFilesSide) => void; open: (task: string, file: { tree: string; path: string; changes: boolean; changed?: boolean; pinned?: boolean; }) => void; pin: (task: string, id: string) => void; activate: (task: string, id: string) => void; setDirty: (task: string, id: string, dirty: boolean) => void; close: (task: string, ids: string[]) => string[]; renamed: (task: string, tree: string, from: string, to: string) => void; removed: (task: string, tree: string, path: string) => void; dirtyOf: (task: string) => string[]; forget: (task: string) => void; }; arrastrando: Accessor<string | null>; celdaDe: (id: string) => { "grid-column": string; "grid-row": string; } | undefined; compacta: Accessor<boolean>; consumo: ReturnType<typeof createUsage>; cursor: Accessor<DragPoint | null>; delegatedPanels: Accessor<Map<string, () => DelegatedPanelModel>>; donde: () => { folder: string | undefined; sitio: { col: number; fila: number; }; indice: number; zone?: undefined; } | { folder: string | undefined; sitio: { col: number; fila: number; }; zone: PanelSide | "center"; indice?: undefined; } | { sitio: SitioDePanel; indice: undefined; zone: undefined; folder: string; } | null; dropSide: () => PanelSide | null; editorDeletionLocked: (id: string) => boolean; estiloDeLaCelda: (sitio: SitioDePanel | null) => { "grid-column": string; "grid-row": string; } | undefined; exportarChat: (id: string, proyecto: string) => Promise<void>; filaDe: (id: string) => SessionRow | undefined; llevaTiraInterior: (sitio: SitioDePanel | null | undefined) => boolean; mandarVentana: (sitio: SitioDePanel) => void; montadas: Accessor<Set<string>>; paneles: { columns: Accessor<PanelGroup[][]>; widths: Accessor<number[]>; heights: Accessor<number[]>; rowCount: () => number; activeSite: Accessor<SitioDePanel>; sites: () => SitioDePanel[]; siteOf: (id: string) => SitioDePanel | null; groupAt: (site: SitioDePanel) => PanelGroup | null; groupCount: () => number; rowsPerColumn: () => number[]; isSplit: () => boolean; canSplit: () => boolean; tabsAt: (site: SitioDePanel) => string[]; activeTabAt: (site: SitioDePanel) => string | null; isVisible: (id: string) => boolean; focus(site: SitioDePanel): void; showDraft(): void; activate(id: string): void; renameTabs(pairs: [string, string][]): void; placeLikeStrip(ids: string[], strip: string[]): void; sync(ids: string[]): boolean; close(id: string): string | null; move: (id: string, a: SitioDePanel, index?: number) => boolean; split: (id: string) => boolean; canSplitAt: (id: string, reference: SitioDePanel, side: PanelSide, unplaced?: boolean) => boolean; splitAt: (id: string, reference: SitioDePanel, side: PanelSide) => boolean; join: () => boolean; resizeColumns(i: number, a: number, b: number): void; resizeRows(i: number, a: number, b: number): void; layout: () => Layout; restore(layout: Layout | null, live: readonly string[]): void; bindTo(workspace: string | null, space: string | null): void; reset(): void; }; proyectoDePestana: (id: string) => string; searchSurfaces: Accessor<Map<string, SearchSurface>>; setSettings: Setter<string | null>; tapadoPorElProyecto: (sitio: SitioDePanel | null | undefined) => boolean; tareasEnVentanas: Accessor<(Pick<TaskTab, "id" | "session"> & { workspace: string | null; })[]>; tituloDePestana: (id: string) => string; workspaceActivo: Accessor<string | null> };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 2292–2523, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createCeldasDeTareas(deps: CeldasDeTareasDeps) {
  const { PanelDeChat, agent, anchoDeArchivos, anchoDelArbol, archivoBorrado, archivoMovido, archivosDeTarea, arrastrando, celdaDe, compacta, consumo, cursor, delegatedPanels, donde, dropSide, editorDeletionLocked, estiloDeLaCelda, exportarChat, filaDe, llevaTiraInterior, mandarVentana, montadas, paneles, proyectoDePestana, searchSurfaces, setSettings, tapadoPorElProyecto, tareasEnVentanas, tituloDePestana, workspaceActivo } = deps;
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
