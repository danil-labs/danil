import { type OpcionDeModelo } from "../../../../ui/src/lib/models";
import { type Tab } from "../../../../ui/src/lib/tabs.ts";
import { createEffect, createSignal, on, type Accessor, type Setter } from "solid-js";
import type { createTabs } from "../../../../ui/src/lib/tabs.ts";


/** Lo que el bloque usaba del cuerpo de App. */
export type DraftSendDeps = { activarPestana: (p: Tab) => Promise<void>; cerrarPestanasYa: (ids: string[]) => void;
  cierreSinGuardar: Accessor<{ ids: string[]; archivos: string[]; sucios: string[]; } | null>; claveAbierta: () => string; pestanas: ReturnType<typeof createTabs>; sessionId: Accessor<string | null>;
  setCierreSinGuardar: Setter<{ ids: string[]; archivos: string[]; sucios: string[]; } | null>; };

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
