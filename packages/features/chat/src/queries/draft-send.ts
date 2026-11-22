import { type OpcionDeModelo } from "../../../../../apps/desktop/src/lib/models";
import { type ContentTab, type FileTab, type Tab } from "../../../../../apps/desktop/src/lib/tabs.ts";
import { createEffect, createSignal, on, type Accessor, type Setter } from "solid-js";


/** Lo que el bloque usaba del cuerpo de App. */
export type DraftSendDeps = { activarPestana: (p: Tab) => Promise<void>; cerrarPestanasYa: (ids: string[]) => void; cierreSinGuardar: Accessor<{ ids: string[]; archivos: string[]; sucios: string[]; } | null>; claveAbierta: () => string; pestanas: { pinned: Accessor<ReadonlySet<string>>; isPinned: (id: string) => boolean; pin: (id: string) => void; restorable: () => string[]; replacePreviews(groups: readonly (readonly string[])[], visible: readonly (string | null)[]): void; open: Accessor<Tab[]>; active: Accessor<string | null>; activeTab: () => Tab | null; load(ws: string | null, desk?: string | null): string | null; ensure(p: { id: string; project: string; titulo: string; }): void; commitDraft(draft: string, p: { id: string; project: string; titulo: string; }): void; openObservability(title: string): void; openScreen(machine: string, title: string): void; openContent(p: ContentTab): void; activate: (id: string | null) => void; close: (id: string) => Tab | null; closeMany: (ids: readonly string[], opts?: { remember?: boolean; }) => Tab | null; canReopen: () => boolean; reopen(alive: (p: Tab) => boolean): Tab | null; attachPreviewFiles(project: string, session: string, tree: string): [string, string][]; renameFiles(session: string, tree: string, from: string, end: string): [string, string][]; navigate(id: string, url: string): void; moveToProject(session: string, project: string): void; markChanged(id: string): void; dirty: Accessor<ReadonlySet<string>>; setDirty(id: string, dirty: boolean): void; registerSaver(id: string, save: (() => Promise<boolean>) | null): void; dirtyTabsToClose(ids: string | readonly string[]): FileTab[]; saveFiles(ids: string[]): Promise<boolean>; sync(find: (id: string) => { project: string; titulo: string; } | null): string[]; }; sessionId: Accessor<string | null>; setCierreSinGuardar: Setter<{ ids: string[]; archivos: string[]; sucios: string[]; } | null> };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 3739–3760, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createDraftSend(deps: DraftSendDeps) {
  const { activarPestana, cerrarPestanasYa, cierreSinGuardar, claveAbierta, pestanas, sessionId, setCierreSinGuardar } = deps;
  /** El cambio de CLI con el que se está a punto de mandar el siguiente turno. */
  const [traspasoPendiente, setTraspasoPendiente] = createSignal<
    { clave: string; sesion: string; desde: string; opcion: OpcionDeModelo } | null
  >(null);
  // Cambiar de tarea o de borrador cancela la confirmación: lo que se aplique
  // tiene que ser de la tarea que está delante.
  createEffect(on([sessionId, claveAbierta], () => {
    if (traspasoPendiente()) setTraspasoPendiente(null);
  }));

  async function resolverCierre(decision: "guardar" | "descartar") {
    const cierre = cierreSinGuardar();
    if (!cierre) return;
    setCierreSinGuardar(null);
    // Si guardar falla, no se cierra y se trae delante el archivo que falló: su
    // visor enseña el fallo y el borrador sigue en su editor.
    if (decision === "guardar" && !(await pestanas.saveFiles(cierre.sucios))) {
      const pendiente = pestanas.dirtyTabsToClose(cierre.ids)[0];
      if (pendiente) void activarPestana(pendiente);
      return;
    }
    cerrarPestanasYa(cierre.ids);
  }
  return { resolverCierre, setTraspasoPendiente, traspasoPendiente };
}
