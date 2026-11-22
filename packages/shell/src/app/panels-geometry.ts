import { type Project } from "../../../../apps/desktop/src/lib/model.ts";
import { createPanels, gridCell, sameSite, type PanelSite as SitioDePanel } from "../../../../apps/desktop/src/lib/panels";
import { type SenderTask } from "../../../../apps/desktop/src/lib/recipients";
import { isTaskTab, type Tab, type createTabs } from "../../../../apps/desktop/src/lib/tabs";
import { captureWorkspaceContext } from "../../../engine-client/src/client.ts";
import { machineOf, setTaskRowMachine } from "../../../features/machines/src/queries/store";
import { esChatDeAgente } from "../../../features/projects/src/model/taskTree";
import { threadTitle } from "../../../features/projects/src/screens/Sessions";
import { type SessionRow } from "../../../features/projects/src/screens/Sessions.tsx";
import { capabilities } from "../../../host/src/platform";
import { createCompactViewport } from "../../../host/src/window";
import { batch, createEffect, createMemo, createSignal, on, onCleanup, onMount, type Accessor } from "solid-js";


/** Lo que el bloque usaba del cuerpo de App. */
export type PanelsGeometryDeps = { activarPestana: (p: Tab) => Promise<void>; cabeceraDeConversacion: HTMLDivElement | undefined; controlesDerechos: HTMLDivElement | undefined; controlesIzquierdos: HTMLDivElement | undefined; hablandoCon: Accessor<{ project: string; name: string; } | null>; naciendo: Accessor<{ project: string; row: SessionRow; }[]>; pestanas: ReturnType<typeof createTabs>; proyectoDeLaVista: () => Project | null; sesiones: Accessor<Record<string, SessionRow[]>>; sessionId: Accessor<string | null> };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 183–390, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createPanelsGeometry(deps: PanelsGeometryDeps) {
  const { hablandoCon, naciendo, pestanas, sesiones, sessionId } = deps;
  const activarPestana: PanelsGeometryDeps["activarPestana"] = (...a: Parameters<PanelsGeometryDeps["activarPestana"]>) => deps.activarPestana(...a);
  const proyectoDeLaVista: PanelsGeometryDeps["proyectoDeLaVista"] = (...a: Parameters<PanelsGeometryDeps["proyectoDeLaVista"]>) => deps.proyectoDeLaVista(...a);
  // Las pestañas separadas: fijas a la derecha, fuera de la tira
  // (`lib/panels.ts`). Sin ninguna, todo lo de abajo se comporta como si
  // esto no existiera. La tira gobierna el panel principal y nada más:
  // lo separado no está en la tira, y no hay que preguntarse en cuál de
  // los dos panes cae lo que se pulsa.
  const paneles = createPanels(pestanas.restorable);
  // Cuánto de la cabecera ocupan de verdad los controles de cada
  // plataforma, sin poder expresarse con un padding fijo: el semáforo
  // está a la izquierda en macOS, los controles a la derecha en Windows,
  // y el título de la rama solo existe en builds de desarrollo.
  const [reservaIzquierdaDeTiras, setReservaIzquierdaDeTiras] = createSignal(0);
  const [reservaDerechaDeTiras, setReservaDerechaDeTiras] = createSignal(0);
  const medirReservasDeTiras = () => {
    if (!deps.cabeceraDeConversacion || !deps.controlesIzquierdos || !deps.controlesDerechos)
      return;
    const cabecera = deps.cabeceraDeConversacion.getBoundingClientRect();
    const izquierda = deps.controlesIzquierdos.getBoundingClientRect();
    const derecha = deps.controlesDerechos.getBoundingClientRect();
    setReservaIzquierdaDeTiras(Math.max(0, izquierda.right - cabecera.left));
    setReservaDerechaDeTiras(Math.max(0, cabecera.right - derecha.left));
  };
  onMount(() => {
    medirReservasDeTiras();
    if (typeof ResizeObserver === "undefined") return;
    const ojo = new ResizeObserver(medirReservasDeTiras);
    if (deps.cabeceraDeConversacion) ojo.observe(deps.cabeceraDeConversacion);
    if (deps.controlesIzquierdos) ojo.observe(deps.controlesIzquierdos);
    if (deps.controlesDerechos) ojo.observe(deps.controlesDerechos);
    onCleanup(() => ojo.disconnect());
  });
  // Con la ventana estrecha se enseña solo el panel principal; lo
  // separado sigue separado. El corte es `COMPACT_VIEWPORT_QUERY` —900px
  // de ancho, 1100 en vertical—, ya definido por la app: a 900px, con el
  // historial en sus 260, quedan ~640 para el espacio principal, y el
  // divisor no cabe en dos mínimos de 320 (`lib/panels.ts`). Esconder en
  // vez de juntar es lo que devuelve el reparto al ensanchar.
  const compacta = createCompactViewport();
  const paginaDeAgente = () => !sessionId() && hablandoCon() !== null;
  // La página de un agente ocupa la pantalla entera: las demás ventanas
  // siguen repartidas y vuelven al abrir una tarea, como con la ventana estrecha.
  const unaSolaVentana = () => compacta() || paginaDeAgente();
  /**
   * Las pistas que se le pasan a `Paneles`. Con la ventana estrecha, **una sola
   * celda**: lo separado sigue separado, solo que no se enseña.
   */
  const anchosEnPantalla = () => (unaSolaVentana() ? [1] : paneles.widths());
  const altosEnPantalla = () => (unaSolaVentana() ? [1] : paneles.heights());
  const filasEnPantalla = () =>
    unaSolaVentana() ? [1] : paneles.rowsPerColumn();
  // En qué celda de la cuadrícula se pinta lo que está en `sitio`, o
  // `undefined` si no está a la vista. Quien lo pinta lo esconde además
  // con `hidden`: un hijo sin celda asignada se colaría en la primera
  // libre. Cómo se numeran las celdas está en `celda()`.
  const estiloDeLaCelda = (sitio: SitioDePanel | null) => {
    if (!sitio) return undefined;
    if (unaSolaVentana())
      return sameSite(sitio, paneles.activeSite())
        ? { "grid-column": "1", "grid-row": "1" }
        : undefined;
    return gridCell(sitio, paneles.rowsPerColumn()[sitio.col] ?? 1);
  };
  /** Las ventanas que se pintan. Con la ventana estrecha, solo la activa. */
  const ventanas = () =>
    unaSolaVentana() ? [paneles.activeSite()] : paneles.sites();
  /** Solo las filas bajo la primera llevan su tira dentro de la cuadrícula. */
  const llevaTiraInterior = (sitio: SitioDePanel | null | undefined) =>
    paneles.isSplit() && (sitio?.fila ?? 0) > 0;
  // Si una pestaña se está viendo ahora mismo: es la que su ventana
  // tiene delante, y esa ventana se está pintando. Con la ventana
  // estrecha solo se pinta la activa: lo que hay en las demás sigue
  // repartido pero no se enseña, y ensanchar devuelve el reparto que
  // había en vez de deshacerlo.
  const seVe = (id: string) => {
    const sitio = paneles.siteOf(id);
    if (!sitio || paneles.activeTabAt(sitio) !== id) return false;
    return !unaSolaVentana() || sameSite(sitio, paneles.activeSite());
  };
  /** Dónde se pinta una pestaña, o `undefined` si no se ve. */
  const celdaDe = (id: string) =>
    seVe(id) ? estiloDeLaCelda(paneles.siteOf(id)) : undefined;
  // La vista de proyecto ocupa la celda de la ventana activa, así que quien
  // caiga en esa celda tiene que apartarse: dos nodos con la misma celda se
  // apilan y se leen encima uno del otro. Función y no memo: `proyectoDeLaVista`
  // se declara más abajo, y memoizar lanzaba `ReferenceError` en el primer
  // pintado con la app en blanco.
  const tapadoPorElProyecto = (sitio: SitioDePanel | null | undefined) =>
    proyectoDeLaVista() !== null &&
    !!sitio &&
    sameSite(sitio, paneles.activeSite());
  /** La pestaña que se ve en `sitio`: ninguna cuando la página de un
   *  proyecto la tapa, aunque siga siendo la activa de su ventana. */
  const pestanaDelanteEn = (sitio: SitioDePanel) =>
    tapadoPorElProyecto(sitio) ? null : paneles.activeTabAt(sitio);
  /** Si `sitio` enseña la conversación en blanco: la tarea nueva sin lanzar. */
  const enBorrador = (sitio: SitioDePanel) =>
    paneles.activeTabAt(sitio) === null && !tapadoPorElProyecto(sitio);
  /** Sitios sin pestaña delante, restando el que ocupa la vista de proyecto. */
  const sitiosEnBlanco = () => paneles.sites().filter(enBorrador);
  // La pestaña que había delante al pasar al blanco: cerrar la tarea nueva vuelve a ella.
  const [antesDelBorrador, setAntesDelBorrador] = createSignal<string | null>(null);
  /** A qué pestaña de `sitio` vuelve cerrar la tarea nueva; sin ninguna, no se cierra. */
  const vueltaDelBorrador = (sitio: SitioDePanel) => {
    const suyas = paneles.tabsAt(sitio);
    const antes = antesDelBorrador();
    return antes !== null && suyas.includes(antes) ? antes : (suyas.at(-1) ?? null);
  };
  function cerrarBorrador(sitio: SitioDePanel) {
    const id = vueltaDelBorrador(sitio);
    const p = pestanas.open().find((x) => x.id === id);
    if (p) void activarPestana(p);
  }
  /** La fila del historial de una tarea, en el grupo que esté. */
  const filaDe = (id: string) => {
    for (const grupo of Object.values(sesiones())) {
      const fila = grupo.find((r) => r.id === id);
      if (fila) return fila;
    }
    return naciendo().find((n) => n.row.id === id)?.row;
  };
  /**
   * Las opciones de una orden sobre la tarea `id`: si corre en otra máquina, con
   * su cabecera. La máquina sale de su fila (o de la pestaña que aún no la
   * tiene), nunca de los demás argumentos (`features/machines/router.ts`).
   */
  // El árbol, el visor y kn piden por `machineOf` desde fuera de aquí: con la fila, no solo con el prefijo.
  setTaskRowMachine((id) => filaDe(id)?.machine);
  const deLaTarea = (id: string | null | undefined) => machineOf(id);
  /** La máquina de esa tarea o carpeta y su workspace, para lo que responde o actúa en ellas. */
  const opcionesDeLaTarea = (id: string | null | undefined, workspace: string | null | undefined) =>
    captureWorkspaceContext({ headers: { ...machineOf(id)?.headers, ...(workspace ? { "x-terminus-workspace": workspace } : {}) } });
  const enMaquina = (machine: string | undefined) => (machine ? { headers: { "x-terminus-machine": machine } } : undefined);
  // En qué máquina vive cada adjunto que no está en el motor de la ventana:
  // la imagen pegada recién guardada y su copia ya preparada.
  const pegadasEn = new Map<string, string>();
  const adjuntosEn = new Map<string, string>();
  /**
   * El space con que nace o sigue algo en `machine`. Uno de esta ventana viaja:
   * es de la cuenta, con el mismo id en todas (el router lo comparte antes si
   * hace falta). Uno que solo existe en otra máquina viaja solo a esa.
   */
  const espacioPara = (space: string | null | undefined, machine: string | null | undefined) => {
    if (!space || !machine) return space ?? null;
    const own = capabilities().taskMachine?.(space) ?? null;
    return own === null || own === machine ? space : null;
  };
  // Sin la carpeta no se puede abrir: `abrirSesion` la necesita para la pestaña.
  const tareaDelRiel = (id: string): SenderTask | null => {
    for (const [folder, filas] of Object.entries(sesiones())) {
      const fila = filas.find((r) => r.id === id);
      if (fila) return { folder, task: id, title: fila.title.trim() || id, provider: fila.provider };
    }
    return null;
  };
  /**
   * Lo que se pinta en cada pestaña: el título del historial cuando ya llegó,
   * y mientras tanto el que la pestaña se guardó la última vez.
   */
  const pestanasEnPantalla = createMemo<Tab[]>(() =>
    pestanas.open().map((p) => {
      if (!isTaskTab(p)) return p;
      const fila = filaDe(p.id);
      const titulo =
        fila && esChatDeAgente(fila) && !fila.agent_thread ? (fila.agent ?? p.titulo) : fila?.inbox ? threadTitle(fila) : (fila?.title ?? p.titulo);
      // La misma fila si el título no cambió, lo que arregla la ×: esto
      // devolvía `{ ...p }` siempre, y cualquier recálculo del memo —activar
      // una ventana lo dispara— daba filas NUEVAS. `Pestanas` las pinta con
      // `For`, que compara por referencia: filas nuevas destruye y
      // reconstruye el DOM de toda la tira.

      // Sin esto, cerrar una pestaña de una ventana que no manda no hace
      // nada la primera vez: el `pointerdown` sube al contenedor de la
      // ventana, que la pone al mando (`mandarVentana`), recalcula este
      // memo, y el botón × recién pulsado deja de existir antes de que
      // llegue el `click`.
      return titulo === p.titulo ? p : { ...p, titulo };
    }),
  );

  /**
   * Las pestañas de una ventana, ya con su título. Va aquí y no arriba:
   * un memo antes de `pestanasEnPantalla` la lee en su zona muerta
   * temporal —`ReferenceError`, ventana en blanco— que `tsc` no ve: la
   * referencia es legal para TypeScript.
   */
  const pestanasDe = (sitio: SitioDePanel) => {
    const suyas = paneles.tabsAt(sitio);
    const todas = pestanasEnPantalla();
    return suyas
      .map((id) => todas.find((p) => p.id === id))
      .filter((p): p is Tab => p !== undefined);
  };
  /**
   * El reparto se reconcilia con las pestañas que existen de verdad
   * (`lib/tabs.ts`). Es un efecto y no un memo: escribe. Abrir una cae en
   * la ventana activa; cerrar la última de una ventana se la lleva. Sin
   * esto, un archivo quedaría montado sin celda: invisible, sin error.
   */
  createEffect(
    on(
      () => [pestanas.open().map((p) => p.id), pestanas.active()] as const,
      ([ids, activa], previous) => {
        batch(() => {
          paneles.sync(ids);
          if (activa) paneles.activate(activa);
          const site = activa ? paneles.siteOf(activa) : null;
          if (activa && site && !pestanas.isPinned(activa) && activa !== previous?.[1]) {
            pestanas.replacePreviews([paneles.tabsAt(site)], [activa]);
          }
          paneles.sync(pestanas.open().map((p) => p.id));
        });
      },
    ),
  );
  return { adjuntosEn, altosEnPantalla, anchosEnPantalla, celdaDe, cerrarBorrador, compacta, deLaTarea, enBorrador, enMaquina, espacioPara, estiloDeLaCelda, filaDe, filasEnPantalla, llevaTiraInterior, opcionesDeLaTarea, paginaDeAgente, paneles, pegadasEn, pestanaDelanteEn, pestanasDe, pestanasEnPantalla, reservaDerechaDeTiras, reservaIzquierdaDeTiras, setAntesDelBorrador, sitiosEnBlanco, tapadoPorElProyecto, tareaDelRiel, ventanas, vueltaDelBorrador };
}
