/**
 * Tipos y estado compartido del workspace: el cliente del que cuelgan
 * proyectos, sesiones, artefactos, consumo y token. No pinta nada; lo consumen
 * la columna de workspaces, el panel de administrar y `App.tsx`.
 *
 * No puede llamarse `workspaces.ts`: al lado vive `Workspaces.tsx`, en macOS el
 * sistema de archivos no distingue mayúsculas y `tsc` falla con TS1261 — en
 * Linux no, así que el CI de Ubuntu daría verde.
 */
import { createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { callEngine } from "../../../../engine-client/src/client.ts";
import { createNavigationOrder } from "../../../../ui/src/lib/navigation-order";
import { activeWorkspaceContext, workspaceContextOptions } from "../../../../session/src/workspace-context.ts";
import { asFailure, type Failure } from "../../../../ui/src/Failure";
import type { Workspace, MemoriaProveedor, Startup } from "../../../../ui/src/lib/workspace-startup.ts"; export type { Workspace, MemoriaProveedor, Startup };

/**
 * Avisa al resto de la app de que cambió el workspace: lo que hay en pantalla
 * es de otro cliente y no puede quedarse. El evento es una mudanza y solo lo
 * emite quien muda; quien escucha tira la conversación abierta. Para «cambió el
 * material» está `harness:sources`, que recarga sin cerrar nada.
 */
export function anunciarMudanza() {
  window.dispatchEvent(new CustomEvent("harness:workspace"));
}

/**
 * Avisa de que un workspace se llama de otra forma. Quien escucha relee la
 * lista y no cierra nada: `harness:workspace` tira la conversación abierta, y
 * cambiar un nombre no muda de cliente.
 */
export function anunciarRenombrado() {
  window.dispatchEvent(new CustomEvent("harness:workspace-name"));
}

/**
 * La consulta en vuelo, si la hay: una sola ida a Rust aunque la columna
 * y el panel de Configuración monten a la vez. No es una caché — se suelta al
 * llegar la respuesta; cachearla dejaría viejo uno de los dos paneles al
 * cambiar de workspace.
 */
let enVuelo: Promise<Startup> | null = null;

function pedirEspacios(): Promise<Startup> {
  enVuelo ??= callEngine<Startup>("list_workspaces").finally(() => {
    enVuelo = null;
  });
  return enVuelo;
}

/**
 * Estado que comparten los montajes —la columna, el riel y el selector de
 * Configuración—: la lista, cuál está activo y cómo se cambia.
 *
 * Cambiar con una tarea contestando es válido: el turno captura su workspace al
 * arrancar y su transcripción y consumo aterrizan donde salieron
 * (`chat::Cierre`).
 */
export function createWorkspaces() {
  const [lista, setLista] = createSignal<Workspace[] | null>(null);
  const order = createNavigationOrder(() => "workspaces.order");
  const orderedList = createMemo(() => {
    const items = lista();
    return items === null ? null : order.arrange(items);
  });
  const [activo, setActivo] = createSignal<string | null>(null);
  const [cargando, setCargando] = createSignal(true);
  const [fallo, setFallo] = createSignal<Failure | null>(null);

  async function cargar() {
    setCargando(true);
    try {
      const a = await pedirEspacios();
      setLista(a.workspaces);
      setActivo(a.active);
      setFallo(null);
    } catch (e) {
      // Cargando, vacío y error son tres estados distintos: en un refresco
      // posterior conservamos la última lista conocida para no parpadear logos ni el selector.
      if (lista() === null) setLista(null);
      setFallo(asFailure(e));
    } finally {
      setCargando(false);
    }
  }

  onMount(() => {
    void cargar();

    // Los montajes existen a la vez —la columna, el riel y el panel abierto—,
    // así que cambiar en uno tiene que verse en el otro sin recargar nada.
    const alMudar = () => void cargar();
    window.addEventListener("harness:workspace", alMudar);
    window.addEventListener("harness:workspace-name", alMudar);
    onCleanup(() => {
      window.removeEventListener("harness:workspace", alMudar);
      window.removeEventListener("harness:workspace-name", alMudar);
    });
  });

  async function cambiarA(id: string | null, context?: string) {
    if (id === activo() && (context ?? null) === activeWorkspaceContext()) return;
    try {
      await callEngine("set_active_workspace", { id }, workspaceContextOptions(context ?? null));
      // Una lista pedida antes del cambio trae el anterior como activo; los
      // demás montajes la heredarían y un clic de vuelta a él no haría nada.
      enVuelo = null;
      setActivo(id);
      setFallo(null);
      anunciarMudanza();
    } catch (e) {
      setFallo(asFailure(e));
    }
  }

  return {
    lista: orderedList,
    reorder: order.save,
    activo,
    activoContexto: activeWorkspaceContext,
    actual: () => lista()?.find((w) => w.id === activo()) ?? null,
    cargando,
    fallo,
    setFallo,
    cargar,
    cambiarA,
    clearActive: () => cambiarA(null),
  };
}

export { cerrarConEscape } from "../model/workspace-menu-escape.ts";
