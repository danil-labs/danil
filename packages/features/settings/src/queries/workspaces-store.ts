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
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { invoke } from "../../../../engine-client/src/client.ts";
import { createNavigationOrder } from "../../../../../apps/desktop/src/lib/navigation-order";
import { capabilities } from "../../../../host/src/platform";
import { activeWorkspaceContext, workspaceContextOptions } from "../../../../../apps/desktop/src/lib/workspace-context.ts";
import { asFailure, type Failure } from "../../../../ui/src/Failure";
import type { RailWorkspace } from "../../../../ui/src/lib/rail-workspace";
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
  enVuelo ??= invoke<Startup>("list_workspaces").finally(() => {
    enVuelo = null;
  });
  return enVuelo;
}

/**
 * Estado que comparten los montajes —la columna, el riel y el panel de
 * Configuración—: la lista, cuál está activo, si hay un turno vivo, y cómo se
 * cambia.
 *
 * Cambiar con una tarea contestando es válido: el turno captura su workspace al
 * arrancar y su transcripción y consumo aterrizan donde salieron
 * (`chat::Cierre`). `turnosVivos` solo bloquea BORRAR un workspace — la carpeta
 * donde el turno escribe dejaría de existir; `remove_workspace` lo niega en el
 * backend y aquí no se ofrece un clic que va a fallar.
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
  // Cuántas sesiones están contestando. Lo emite la pantalla del chat; aquí
  // solo decide no ofrecer el borrado.
  const [turnosVivos, setTurnosVivos] = createSignal(0);

  async function cargar() {
    setCargando(true);
    try {
      const a = await pedirEspacios();
      setLista(a.workspaces);
      setActivo(a.active);
      setFallo(null);
    } catch (e) {
      // Cargando, vacío y error son tres estados distintos: «vacío» es el
      // primer arranque, no un fallo.
      setLista(null);
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

    const alTurno = (e: Event) =>
      setTurnosVivos((e as CustomEvent<number>).detail ?? 0);
    window.addEventListener("harness:turn", alTurno);
    onCleanup(() => window.removeEventListener("harness:turn", alTurno));
  });

  async function cambiarA(id: string | null, context?: string) {
    if (id === activo() && (context ?? null) === activeWorkspaceContext()) return;
    try {
      await invoke("set_active_workspace", { id }, workspaceContextOptions(context ?? null));
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

  /** Por qué no se puede borrar ahora mismo, o `null` si sí se puede. */
  const bloqueado = () => {
    const n = turnosVivos();
    return n > 0
      ? t("settings.workspaces.blocked", { count: n })
      : null;
  };

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
    turnosVivos,
    bloqueado,
  };
}

/**
 * El riel: con el índice del motor (`state_machines`) la lista sale solo de él,
 * los de aquí y los que sirven las otras máquinas de la persona; sin él, de
 * `list_workspaces`, como Configuración. El abierto y cambiar de workspace son
 * los de siempre.
 */
export function createRail() {
  const ws = createWorkspaces();
  const order = createNavigationOrder(() => "workspaces.order");
  const [revision, setRevision] = createSignal(0);
  const bump = () => setRevision((n) => n + 1);
  onMount(() => {
    window.addEventListener("harness:workspace-name", bump);
    window.addEventListener("harness:workspace", bump);
    onCleanup(() => {
      window.removeEventListener("harness:workspace-name", bump);
      window.removeEventListener("harness:workspace", bump);
    });
  });
  const lista = createMemo((): RailWorkspace[] | null => {
    revision();
    const engine = capabilities().railWorkspaces?.() ?? null;
    if (!engine) return ws.lista();
    // El abierto se ve aunque el índice aún no lo traiga (recién creado, o de la cuenta sin máquina).
    const open = ws.activo();
    const extra = open && !engine.some((w) => w.id === open) ? (ws.lista() ?? []).filter((w) => w.id === open) : [];
    return order.arrange([...engine, ...extra]);
  });
  return { ...ws, lista };
}

export { cerrarConEscape } from "../model/workspace-menu-escape.ts";
