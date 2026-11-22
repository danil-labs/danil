import { t } from "../../../../apps/desktop/src/lib/i18n";
import { panelReadingOrder, sameSite, type PanelSite as SitioDePanel } from "../../../../apps/desktop/src/lib/panels";
import { type Layout, type PanelGroup, type Side } from "../../../../apps/desktop/src/lib/panels-types.ts";
import { destinoDePestana, type NavegacionDePestanas } from "../../../../apps/desktop/src/lib/shortcuts";
import { isContentTab, isTaskTab, screenTabId, type Tab } from "../../../../apps/desktop/src/lib/tabs";
import { type ContentTab, type FileTab } from "../../../../apps/desktop/src/lib/tabs-types.ts";
import { machineName } from "../../../features/machines/src/queries/store";
import { type createDeskStrip as T_createDeskStrip } from "../../../features/projects/src";
import { type SessionRow } from "../../../features/projects/src/screens/Sessions.tsx";
import { batch, type Accessor, type Setter } from "solid-js";


/** Lo que el bloque usaba del cuerpo de App. */
export type WindowsDeps = { abrirSesion: (proyecto: string, id: string, activar?: string, propagateError?: boolean) => Promise<void>; carpetaDelEscritorio: (pedido: string) => string; drafts: ReturnType<typeof T_createDeskStrip>["drafts"]; filaDe: (id: string) => SessionRow | undefined; irAlBlanco: (enProyecto?: string) => void; olvidarPestana: (session: string) => void; paginaDeAgente: () => boolean; paneles: { columns: Accessor<PanelGroup[][]>; widths: Accessor<number[]>; heights: Accessor<number[]>; rowCount: () => number; activeSite: Accessor<SitioDePanel>; sites: () => SitioDePanel[]; siteOf: (id: string) => SitioDePanel | null; groupAt: (site: SitioDePanel) => PanelGroup | null; groupCount: () => number; rowsPerColumn: () => number[]; isSplit: () => boolean; canSplit: () => boolean; tabsAt: (site: SitioDePanel) => string[]; activeTabAt: (site: SitioDePanel) => string | null; isVisible: (id: string) => boolean; focus(site: SitioDePanel): void; showDraft(): void; activate(id: string): void; renameTabs(pairs: [string, string][]): void; placeLikeStrip(ids: string[], strip: string[]): void; sync(ids: string[]): boolean; close(id: string): string | null; move: (id: string, a: SitioDePanel, index?: number) => boolean; split: (id: string) => boolean; canSplitAt: (id: string, reference: SitioDePanel, side: Side, unplaced?: boolean) => boolean; splitAt: (id: string, reference: SitioDePanel, side: Side) => boolean; join: () => boolean; resizeColumns(i: number, a: number, b: number): void; resizeRows(i: number, a: number, b: number): void; layout: () => Layout; restore(layout: Layout | null, live: readonly string[]): void; bindTo(workspace: string | null, space: string | null): void; reset(): void; }; pestanaActiva: () => string | null; pestanas: { pinned: Accessor<ReadonlySet<string>>; isPinned: (id: string) => boolean; pin: (id: string) => void; restorable: () => string[]; replacePreviews(groups: readonly (readonly string[])[], visible: readonly (string | null)[]): void; open: Accessor<Tab[]>; active: Accessor<string | null>; activeTab: () => Tab | null; load(ws: string | null, desk?: string | null): string | null; ensure(p: { id: string; project: string; titulo: string; }): void; commitDraft(draft: string, p: { id: string; project: string; titulo: string; }): void; openObservability(title: string): void; openScreen(machine: string, title: string): void; openContent(p: ContentTab): void; activate: (id: string | null) => void; close: (id: string) => Tab | null; closeMany: (ids: readonly string[], opts?: { remember?: boolean; }) => Tab | null; canReopen: () => boolean; reopen(alive: (p: Tab) => boolean): Tab | null; attachPreviewFiles: (project: string, session: string, tree: string) => [string, string][]; renameFiles: (session: string, tree: string, from: string, end: string) => [string, string][]; navigate(id: string, url: string): void; moveToProject(session: string, project: string): void; markChanged: (id: string) => void; dirty: Accessor<ReadonlySet<string>>; setDirty: (id: string, dirty: boolean) => void; registerSaver: (id: string, save: (() => Promise<boolean>) | null) => void; dirtyTabsToClose: (ids: string | readonly string[]) => FileTab[]; saveFiles: (ids: string[]) => Promise<boolean>; sync(find: (id: string) => { project: string; titulo: string; } | null): string[]; }; project: Accessor<string>; sessionId: Accessor<string | null>; setProyectoAbierto: Setter<string | null>; soltarHilo: (session: string) => void; vivas: Accessor<string[]> };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 486–650, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createWindows(deps: WindowsDeps) {
  const { carpetaDelEscritorio, drafts, filaDe, paginaDeAgente, paneles, pestanaActiva, pestanas, project, sessionId, setProyectoAbierto, soltarHilo, vivas } = deps;
  const abrirSesion: WindowsDeps["abrirSesion"] = (...a: Parameters<WindowsDeps["abrirSesion"]>) => deps.abrirSesion(...a);
  const irAlBlanco: WindowsDeps["irAlBlanco"] = (...a: Parameters<WindowsDeps["irAlBlanco"]>) => deps.irAlBlanco(...a);
  const olvidarPestana: WindowsDeps["olvidarPestana"] = (...a: Parameters<WindowsDeps["olvidarPestana"]>) => deps.olvidarPestana(...a);
  function cerrarPestanasYa(ids: string[]) {
    const pedidas = new Set(ids);
    const cerradas = pestanas.open().filter((x) => pedidas.has(x.id));
    if (cerradas.length === 0) return;
    const activaAntes = pestanaActiva();
    const vecina = pestanas.closeMany(ids, { remember: true });
    // Closing a task also removes its documents, which can empty several panels.
    paneles.sync(pestanas.open().map((x) => x.id));
    // El borrador y el hilo son de la tarea: cerrar un archivo o un
    // artefacto suyo no los toca, la tarea sigue abierta detrás.
    for (const p of cerradas.filter(isTaskTab)) {
      drafts.drop(p.id);
      olvidarPestana(p.id);
      if (!vivas().includes(p.id)) soltarHilo(p.id);
    }
    // Se pregunta si el cierre se llevó lo que se estaba mirando, no si
    // el id cerrado era el activo: una tarea arrastra sus archivos, y
    // cerrándola con uno delante, comparar ids da «no era la activa» y
    // no carga nada —la tira marca la vecina y el chat sigue enseñando
    // la tarea recién cerrada.
    if (activaAntes === null) return;
    if (pestanas.open().some((x) => x.id === activaAntes)) return;
    if (vecina) void activarPestana(vecina);
    else {
      const owner = cerradas.find((p) => isContentTab(p) && p.session !== "" && !cerradas.some((x) => isTaskTab(x) && x.id === p.session));
      if (owner) void abrirSesion(owner.project, owner.session);
      else irAlBlanco(carpetaDelEscritorio(project()));
    }
  }

  /**
   * Lo último que se cerró a mano vuelve a la tira, salvo lo que ya no existe:
   * una tarea borrada mientras tanto no reaparece como pestaña rota.
   */
  function reabrirPestana() {
    const antes = new Set(pestanas.open().map((x) => x.id));
    const p = pestanas.reopen((x) => x.session === "" || filaDe(x.session) !== undefined);
    if (!p) return;
    // La tira que se pinta es la de la ventana: sin colocarlas, volverían al final.
    const tira = pestanas.open().map((x) => x.id);
    paneles.sync(tira);
    paneles.placeLikeStrip(tira.filter((id) => !antes.has(id)), tira);
    void activarPestana(p);
  }

  /**
   * Poner una pestaña delante, sea de lo que sea. Toda pestaña lleva su
   * tarea dentro: activar el archivo de otra tarea abre esa tarea detrás.
   * `abrirSesion` no relee nada cuando ya es la abierta: pasar de un
   * archivo a su conversación no cuesta un viaje al disco.
   */
  async function activarPestana(p: Tab) {
    // La ventana que la tiene pasa a mandar, y la enseña. Es lo que ata las
    // tres cosas que decide el mando —la caja, la columna derecha y dónde caen
    // las pestañas nuevas— a un solo gesto (`lib/panels.ts`).
    paneles.activate(p.id);
    setProyectoAbierto(null);
    // El navegador del «+» tampoco cuelga de ninguna tarea: detrás no se
    // abre nada.
    if (p.clase === "observabilidad" || p.clase === "pantalla" || (p.clase === "sitio" && p.navegador)) {
      pestanas.activate(p.id);
      return;
    }
    // Un archivo abierto antes de que la tarea existiera no cuelga de ninguna:
    // detrás queda la conversación en blanco de su proyecto, que es la que
    // decide de qué commit se lee.
    if (p.session === "") {
      if (project() !== p.project || sessionId() !== null) irAlBlanco(p.project);
      paneles.activate(p.id);
      pestanas.activate(p.id);
      return;
    }
    await abrirSesion(p.project, p.session, p.id);
  }

  /**
   * El atajo de teclado, sobre la tira de la ventana activa y no sobre la
   * tira entera: partida la pantalla, cada ventana lleva la suya y el número
   * cuenta lo que se ve (`lib/panels.ts`).
   */
  function irAPestanaDe(nav: NavegacionDePestanas) {
    const sitio = paneles.activeSite();
    const id = destinoDePestana(
      nav,
      paneles.tabsAt(sitio),
      paneles.activeTabAt(sitio),
    );
    const p = id ? pestanas.open().find((x) => x.id === id) : null;
    if (p) void activarPestana(p);
  }

  /**
   * Cambiar de ventana con el teclado, que es lo que el ratón hace pulsando
   * en ella. Con la ventana estrecha solo se pinta la activa, y esto es lo
   * único que llega a lo que hay en las demás.
   */
  function irAVentanaVecina(salto: 1 | -1) {
    const recorrido = panelReadingOrder(paneles.rowsPerColumn());
    if (recorrido.length < 2) return;
    const i = recorrido.findIndex((s) => sameSite(s, paneles.activeSite()));
    mandarVentana(recorrido[(i + salto + recorrido.length) % recorrido.length]);
  }

  function abrirObservabilidad() {
    setProyectoAbierto(null);
    pestanas.openObservability(t("observability.tab"));
  }

  /** La pantalla de una computadora, en una ventana al lado de la conversación. */
  function abrirPantalla(machine: string) {
    const id = screenTabId(machine);
    const nueva = !pestanas.open().some((p) => p.id === id);
    const conversacion = pestanas.active();
    // Sin batch la pantalla pasa un instante delante de la conversación: esta se
    // desmonta, vuelve al dividir y su barra de ubicación parpadea mientras relee.
    batch(() => {
      setProyectoAbierto(null);
      pestanas.openScreen(machine, t("screen.tab", { name: machineName(machine) }));
      paneles.sync(pestanas.open().map((x) => x.id));
      paneles.activate(id);
      if (nueva && !paneles.isSplit()) paneles.split(id);
      // La pantalla se mira al lado; el mando sigue en la conversación, que
      // sin él queda de solo lectura y sin caja de escritura.
      const suya = conversacion ? paneles.siteOf(conversacion) : null;
      const pantalla = paneles.siteOf(id);
      if (conversacion && suya && pantalla && !sameSite(suya, pantalla)) {
        pestanas.activate(conversacion);
        paneles.activate(conversacion);
      }
    });
  }

  /**
   * Pone una ventana al mando pulsando en cualquier sitio de ella, no
   * solo en una pestaña, y abre lo que tiene delante: columna derecha y
   * caja de escritura cuelgan de la sesión abierta, y enfocar sin abrir
   * dejaría el mando en una ventana y el contexto en otra.
   */
  function mandarVentana(sitio: SitioDePanel) {
    if (sameSite(sitio, paneles.activeSite())) return;
    paneles.focus(sitio);
    const id = paneles.activeTabAt(sitio);
    const p = id ? pestanas.open().find((x) => x.id === id) : null;
    if (p) void activarPestana(p);
  }

  // Separar conserva la vista y deja disponible su celda de origen.
  function partirLaActiva() {
    partirVentana(paneles.activeSite());
  }

  /**
   * Parte esa ventana, no la que esté al mando. Un botón en la fila de
   * título no pertenece a ninguna ventana —con la rejilla, no diría cuál
   * partir—; puesto en la tira de cada una, es de su ventana. El atajo de
   * teclado sigue partiendo la activa: ahí sí es la única respuesta.
   */
  function partirVentana(sitio: SitioDePanel) {
    const id = paneles.activeTabAt(sitio);
    if (!id) return;
    if (paneles.split(id)) pestanas.pin(id);
  }

  const puedeSepararseDe = (sitio: SitioDePanel) =>
    !paginaDeAgente() && paneles.activeTabAt(sitio) !== null && paneles.canSplit();
  return { abrirObservabilidad, abrirPantalla, activarPestana, cerrarPestanasYa, irAPestanaDe, irAVentanaVecina, mandarVentana, partirLaActiva, partirVentana, puedeSepararseDe, reabrirPestana };
}
