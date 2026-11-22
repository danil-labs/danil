import type { ArbolEnTarea, Source } from "../../../../../apps/desktop/src/lib/model.ts";
import type { ArtifactTab, SiteTab } from "../../../../../apps/desktop/src/lib/tabs.ts";
import type { ChatExportado } from "../../../../../apps/desktop/src/lib/project-block-types.ts";
export function createSessionMutationOpen(deps: { abrirBorradorDeAgente: (enProyecto: string, name: string) => void; abrirSesion: (proyecto: string, id: string, activar?: string, propagateError?: boolean) => Promise<void>; activeSpace: () => import("../../../../../apps/desktop/src/lib/spaces").Space | null; arbolesDe: (project: string, session: string) => Promise<ArbolEnTarea[]>; archivosDeTarea: { panel: (task: string) => import("../../../../../apps/desktop/src/lib/taskFiles").TaskFilesPanel; setOpen: (task: string, open: boolean) => void; present: (task: string, mode: import("../../../../../apps/desktop/src/lib/taskFiles").TaskSideMode) => void; toggle: (task: string) => void; setExpanded: (task: string, expanded: boolean) => void; setTree: (task: string, tree: boolean) => void; setSide: (task: string, side: import("../../../../../apps/desktop/src/lib/taskFiles").TaskFilesSide) => void; open: (task: string, file: { tree: string; path: string; changes: boolean; changed?: boolean; pinned?: boolean; }) => void; pin: (task: string, id: string) => void; activate: (task: string, id: string) => void; setDirty: (task: string, id: string, dirty: boolean) => void; close: (task: string, ids: string[]) => string[]; renamed: (task: string, tree: string, from: string, to: string) => void; removed: (task: string, tree: string, path: string) => void; dirtyOf: (task: string) => string[]; forget: (task: string) => void; }; artifactTabId: (a: { session: string; rel: string; }) => string; browserTabId: () => string; carpetasDelEscritorio: <P extends { id: string; }>(projects: readonly P[], desk: import("../../../../../apps/desktop/src/lib/spaces").Space | null, sesiones: Record<string, readonly (import("../../../../tasks/src/flat").LauncherRow & { id?: string; space?: string | null; archived?: boolean | null; pinned?: boolean | null; machine?: string | null; })[]>) => P[]; cerrarPestana: (id: string) => void; claveAbierta: () => string; contiene: (carpeta: string, absoluta: string) => boolean; deLaTarea: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; draftBases: import("solid-js").Accessor<Record<string, string>>; drafts: { peek: (key: string) => import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; current: () => import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; sourceIds: import("solid-js").Accessor<string[]>; excludedSourceIds: import("solid-js").Accessor<string[]>; attached: import("solid-js").Accessor<string[]>; pendingMaterial: import("solid-js").Accessor<Source[]>; context: import("solid-js").Accessor<Source[]>; input: () => string; files: () => string[]; changeText: (value: string, inputType?: string, change?: import("../../../../../apps/desktop/src/lib/taskMentions").TextEdit) => void; history: (redo: boolean) => boolean; addFiles: (paths: string[]) => Promise<void>; addSource: (id: string) => void; removeSource: (id: string) => void; recipient: (name: string, label: string, trigger: import("../../../../../apps/desktop/src/lib/mentions").Trigger) => void; reference: (target: import("../../../../../apps/desktop/src/lib/taskMentions").MentionTarget, label: string, trigger: import("../../../../../apps/desktop/src/lib/mentions").Trigger) => void; replaceFiles: (files: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; replaceAttached: (ids: string[]) => string[]; acceptSources: (ids: string[]) => string[]; configure: (configuration: import("../../../../../apps/desktop/src/lib/project-block-types.ts").DraftConfiguration, key?: string) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; handover: (provider: import("../../../../../apps/desktop/src/lib/project-block-types.ts").HandoverPending | null | undefined, key?: string) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; invalidateProvider: (key: string, provider: string) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft | { input: string; task_mentions?: import("../../../../../apps/desktop/src/lib/taskMentions").TaskMention[]; recipients?: import("../../../../../apps/desktop/src/lib/recipients").Recipient[]; mentionHistory?: { text: string; task_mentions?: import("../../../../../apps/desktop/src/lib/taskMentions").TaskMention[]; recipients?: import("../../../../../apps/desktop/src/lib/recipients").Recipient[]; }[]; mentionFuture?: { text: string; task_mentions?: import("../../../../../apps/desktop/src/lib/taskMentions").TaskMention[]; recipients?: import("../../../../../apps/desktop/src/lib/recipients").Recipient[]; }[]; sourceIds: string[]; excludedSourceIds: string[]; archivos: string[]; configuration?: import("../../../../../apps/desktop/src/lib/project-block-types.ts").DraftConfiguration; }; }; restoreSession: (key: string, excluded: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; retryText: (text: string, mentions?: import("../../../../../apps/desktop/src/lib/taskMentions").TaskMention[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; takeFiles: (key: string, files: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; restoreFailed: (key: string, message: { text: string; task_mentions?: import("../../../../../apps/desktop/src/lib/taskMentions").TaskMention[]; recipients?: import("../../../../../apps/desktop/src/lib/recipients").Recipient[]; }, files: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; sentSources: (key: string, ids: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; continueFrom: (prompt: string, path: string, sources: string[], excluded: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; promote: (from: string, to: string) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; drop: (key: string) => Record<string, import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft>; reset: () => void; dispose: () => void; }; esDeCodigo: (kind: string) => boolean; filaDe: (id: string) => import("../screens/Sessions").SessionRow | undefined; fileTabId: (a: { project: string; session: string; arbol: string; ruta: string; }) => string; folder: import("solid-js").Accessor<string | null>; invoke: <T>(command: string, args?: import("@tauri-apps/api/core").InvokeArgs, options?: import("@tauri-apps/api/core").InvokeOptions) => Promise<T>; machineOf: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; nuevaSesion: (enProyecto?: string) => void; paneles: { columns: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/panels").PanelGroup[][]>; widths: import("solid-js").Accessor<number[]>; heights: import("solid-js").Accessor<number[]>; rowCount: () => number; activeSite: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/panels").PanelSite>; sites: () => import("../../../../../apps/desktop/src/lib/panels").PanelSite[]; siteOf: (id: string) => import("../../../../../apps/desktop/src/lib/panels").PanelSite | null; groupAt: (site: import("../../../../../apps/desktop/src/lib/panels").PanelSite) => import("../../../../../apps/desktop/src/lib/panels").PanelGroup | null; groupCount: () => number; rowsPerColumn: () => number[]; isSplit: () => boolean; canSplit: () => boolean; tabsAt: (site: import("../../../../../apps/desktop/src/lib/panels").PanelSite) => string[]; activeTabAt: (site: import("../../../../../apps/desktop/src/lib/panels").PanelSite) => string | null; isVisible: (id: string) => boolean; focus(site: import("../../../../../apps/desktop/src/lib/panels").PanelSite): void; showDraft(): void; activate(id: string): void; renameTabs(pairs: [string, string][]): void; placeLikeStrip(ids: string[], strip: string[]): void; sync(ids: string[]): boolean; close(id: string): string | null; move(id: string, a: import("../../../../../apps/desktop/src/lib/panels").PanelSite, index?: number): boolean; split(id: string): boolean; canSplitAt: (id: string, reference: import("../../../../../apps/desktop/src/lib/panels").PanelSite, side: import("../../../../../apps/desktop/src/lib/panels").Side, unplaced?: boolean) => boolean; splitAt: (id: string, reference: import("../../../../../apps/desktop/src/lib/panels").PanelSite, side: import("../../../../../apps/desktop/src/lib/panels").Side) => boolean; join(): boolean; resizeColumns(i: number, a: number, b: number): void; resizeRows(i: number, a: number, b: number): void; layout: () => import("../../../../../apps/desktop/src/lib/panels").Layout; restore(layout: import("../../../../../apps/desktop/src/lib/panels").Layout | null, live: readonly string[]): void; bindTo(workspace: string | null, space: string | null): void; reset(): void; }; pestanas: { pinned: import("solid-js").Accessor<ReadonlySet<string>>; isPinned: (id: string) => boolean; pin: (id: string) => void; restorable: () => string[]; replacePreviews(groups: readonly (readonly string[])[], visible: readonly (string | null)[]): void; open: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/tabs").Tab[]>; active: import("solid-js").Accessor<string | null>; activeTab: () => import("../../../../../apps/desktop/src/lib/tabs").Tab | null; load(ws: string | null, desk?: string | null): string | null; ensure(p: { id: string; project: string; titulo: string; }): void; commitDraft(draft: string, p: { id: string; project: string; titulo: string; }): void; openObservability(title: string): void; openScreen(machine: string, title: string): void; openContent(p: import("../../../../../apps/desktop/src/lib/tabs").ContentTab): void; activate: (id: string | null) => void; close: (id: string) => import("../../../../../apps/desktop/src/lib/tabs").Tab | null; closeMany: (ids: readonly string[], opts?: { remember?: boolean; }) => import("../../../../../apps/desktop/src/lib/tabs").Tab | null; canReopen: () => boolean; reopen(alive: (p: import("../../../../../apps/desktop/src/lib/tabs").Tab) => boolean): import("../../../../../apps/desktop/src/lib/tabs").Tab | null; attachPreviewFiles(project: string, session: string, tree: string): [string, string][]; renameFiles(session: string, tree: string, from: string, end: string): [string, string][]; navigate(id: string, url: string): void; moveToProject(session: string, project: string): void; markChanged(id: string): void; dirty: import("solid-js").Accessor<ReadonlySet<string>>; setDirty(id: string, dirty: boolean): void; registerSaver(id: string, save: (() => Promise<boolean>) | null): void; dirtyTabsToClose(ids: string | readonly string[]): import("../../../../../apps/desktop/src/lib/tabs").FileTab[]; saveFiles(ids: string[]): Promise<boolean>; sync(find: (id: string) => { project: string; titulo: string; } | null): string[]; }; project: import("solid-js").Accessor<string>; projectList: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/model").Project[]>; prosaDe: (e: unknown, datos?: { [x: string]: string | number; }) => string; sesiones: import("solid-js").Accessor<Record<string, import("../screens/Sessions").SessionRow[]>>; sessionId: import("solid-js").Accessor<string | null>; setError: import("solid-js").Setter<string | null>; setProyectoAbierto: import("solid-js").Setter<string | null>; setRunOn: (workspace: string | null, id: string | null) => void; siteTabId: (a: { session: string; url: string; }) => string; t: (clave: string, datos?: Record<string, string | number>) => string; ubicar: (arboles: readonly ArbolEnTarea[], absoluta: string) => { arbol: ArbolEnTarea; rel: string; } | null; workspaceActivo: import("solid-js").Accessor<string | null> } & { _bridge: Record<string, any>; _live: Record<string, () => any> }) {
  const _bridge = deps._bridge;
  const _mk = (read: () => any): any => new Proxy(function () {} as any, { get(_t: any, p: any) { return read()[p]; }, apply(_t: any, _th: any, args: any[]) { return read()(...args); } });
  const _late: any = {};
  for (const [n, via] of [["adjuntarFuente",1],["materialTarget",1],["quitarFuente",1],["taskMaterialOptions",1],["maquinaDeLaVentana",0]] as [string, 0 | 1][]) _late[n] = _mk(() => via ? _bridge[n] : deps._live[n]());
  const { adjuntarFuente, materialTarget, quitarFuente, taskMaterialOptions, maquinaDeLaVentana } = _late;
  const { abrirBorradorDeAgente, abrirSesion, activeSpace, arbolesDe, archivosDeTarea, artifactTabId, browserTabId, carpetasDelEscritorio, cerrarPestana, claveAbierta, contiene, deLaTarea, draftBases, drafts, esDeCodigo, filaDe, fileTabId, folder, invoke, machineOf, nuevaSesion, paneles, pestanas, project, projectList, prosaDe, sesiones, sessionId, setError, setProyectoAbierto, setRunOn, siteTabId, t, ubicar, workspaceActivo } = deps;
  /**
   * Cambiar la rama de una fuente sustituyéndola: su identidad incluye la
   * rama (`context::repo_identity`), otra rama es otra fuente. La nueva entra
   * antes de que salga la anterior: un fallo de `add_repo_url` deja las dos,
   * y se ve.
   */
  const cambiarRama = async (fuente: Source, rama: string) => {
    if (fuente.kind !== "git" || fuente.branch === rama) return;
    const target = materialTarget();
    if (sessionId() && !taskMaterialOptions()) throw { what: t("projects.context.task_unavailable") };
    const machine = sessionId() ? filaDe(sessionId()!)?.machine : null;
    const options = machine ? { headers: { "x-terminus-machine": machine } } : taskMaterialOptions();
    const nueva = await invoke<{ id: string }>("add_repo_url", {
      cloneUrl: fuente.location,
      branch: rama,
    }, options);
    if (target !== materialTarget()) throw { what: t("projects.context.target_changed") };
    await adjuntarFuente(nueva.id);
    if (target !== materialTarget()) throw { what: t("projects.context.target_changed") };
    await quitarFuente(fuente.id);
    window.dispatchEvent(new CustomEvent("harness:sources"));
  };

  /**
   * Abrir un artefacto es abrir una pestaña del centro, con su propio
   * visor (`ArtifactViewer.tsx`). Llega por aquí lo que el hilo anunció
   * y la conversación exportada: lo que la tarea produjo, nunca un adjunto.
   */
  function abrirArtefacto(
    rel: string,
    path: string,
    kind: ArtifactTab["kind"] = "output",
    codigo = false,
  ) {
    const id = sessionId();
    if (!id) return;
    pestanas.openContent({
      clase: "artefacto",
      id: artifactTabId({ session: id, rel }),
      project: project(),
      session: id,
      rel,
      path,
      kind,
      ...(codigo ? { codigo } : {}),
    });
  }

  /**
   * Un archivo por su ruta absoluta. Dentro de un repositorio de la tarea abre
   * en su árbol, donde se escribe; fuera de todo árbol, en una tarea de código
   * se lee en la vista de código y en una documental como documento.
   */
  async function abrirRuta(path: string, rel = path.replaceAll("\\", "/")) {
    const id = sessionId();
    if (!id) return;
    const arboles = await arbolesDe(project(), id).catch(() => []);
    // Abrir después del await en otra tarea pondría esta ruta, editable, en el repositorio de aquella.
    if (sessionId() !== id) return;
    const dentro = ubicar(arboles, path);
    if (dentro && esDeCodigo(dentro.arbol.kind)) {
      return abrirArchivo(dentro.arbol.key, dentro.rel, false);
    }
    const f = folder();
    const enLaTarea = Boolean(dentro) || (f !== null && contiene(f, path));
    abrirArtefacto(
      rel,
      path,
      enLaTarea ? "output" : "external",
      !dentro && arboles.some((a) => esDeCodigo(a.kind)),
    );
  }

  /**
   * Un archivo del árbol de código, en su pestaña del centro. Sin tarea aún lo
   * mismo: la pestaña lee el commit base y el primer turno la reata
   * (`lib/tabs.ts`). Un archivo no se enseña de dos maneras según cuándo se
   * abra.
   */
  function abrirArchivo(arbol: string, ruta: string, cambiado: boolean) {
    const tarea = sessionId();
    if (tarea) { archivosDeTarea.open(tarea, { tree: arbol, path: ruta, changes: cambiado }); return; }
    const proyecto = project();
    const id = sessionId() ?? "";
    if (!proyecto && !id) return;
    pestanas.openContent({
      clase: "archivo",
      id: fileTabId({ project: proyecto, session: id, arbol, ruta }),
      project: proyecto,
      session: id,
      arbol,
      ruta,
      cambiado,
      ...(id ? {} : { base: draftBases()[claveAbierta()] }),
    });
  }

  function archivoMovido(session: string, arbol: string, desde: string, hasta: string) {
    archivosDeTarea.renamed(session, arbol, desde, hasta);
    paneles.renameTabs(pestanas.renameFiles(session, arbol, desde, hasta));
  }

  function archivoBorrado(session: string, arbol: string, ruta: string) {
    archivosDeTarea.removed(session, arbol, ruta);
    const fuera = pestanas
      .open()
      .filter(
        (p) =>
          p.clase === "archivo" &&
          p.session === session &&
          p.arbol === arbol &&
          (p.ruta === ruta || p.ruta.startsWith(`${ruta}/`)),
      );
    for (const p of fuera) cerrarPestana(p.id);
  }

  /**
   * Los archivos que se miraban antes del primer turno pasan a la tarea que ese
   * turno creó. La clave del árbol no se adivina: se pide, y es una
   * (`development::list_task_trees`).
   */
  async function reatarVistaPrevia(proyecto: string, session: string) {
    const sueltas = pestanas
      .open()
      .some((p) => p.clase === "archivo" && p.session === "" && p.project === proyecto);
    if (!sueltas) return;
    try {
      const arboles = await invoke<ArbolEnTarea[]>("list_task_trees", {
        project: proyecto,
        session,
      }, deLaTarea(session));
      const arbol = arboles[0]?.key;
      if (!arbol) return;
      paneles.renameTabs(pestanas.attachPreviewFiles(proyecto, session, arbol));
    } catch {
      // Sin clave de árbol las pestañas se quedan en el commit del que nació la
      // copia: enseñan el archivo, no un error.
    }
  }

  /**
   * El servidor que levantó una tarea, pestaña más del centro. Se abre
   * la tarea primero: `pestanas.abrir` mete la de contenido detrás de
   * las de su tarea, o dejaría un hueco al cerrarla (`lib/tabs.ts`).
   * El puerto puede ser de una tarea no abierta: pasa por `abrirSesion`.
   */

  /**
   * Un enlace, en una pestaña de esta ventana. Dos entradas y un solo
   * camino: el clic en un enlace del chat (evento `harness:abrir-sitio`)
   * y el guarda de navegación (`lib.rs` · `sitio-pedido`) —así el
   * «abrir enlace» del menú nativo acaba en el mismo sitio que un clic.
   */

  /**
   * Un sitio cuelga de una tarea (`lib/tabs.ts`): se cuelga de la que
   * esté delante. Sin ninguna se entrega al navegador del sistema: un
   * enlace que no hace nada se lee como que la app está rota.
   */
  async function abrirEnlace(url: string) {
    // `activa()` es el id, no la pestaña: se busca en las abiertas.
    const p = pestanas.open().find((x) => x.id === pestanas.active());
    // Delante hay un navegador suelto: no hay tarea de la que colgarlo, así
    // que va a otra pestaña de navegador.
    if (p?.clase === "sitio" && p.navegador) return abrirNavegador(url);
    if (p) return void abrirSitio(url, p.project, p.session);
    await invoke("open_external", { target: url }).catch(() => {});
  }

  /**
   * Una pestaña de navegador suelta, la del «+» de la tira. Sin dirección
   * abre vacía, con la barra lista para teclear (`features/sites/Site.tsx`).
   */
  function abrirNavegador(url = "") {
    setProyectoAbierto(null);
    pestanas.openContent({
      clase: "sitio",
      id: browserTabId(),
      project: "",
      session: "",
      url,
      navegador: true,
    });
  }

  /**
   * Las carpetas que ofrece el «+» de la tira: las del riel de este espacio.
   * Se calcula aquí y no con `proyectosDelRiel`, que se declara después de
   * la cabecera que lo usa.
   */
  const carpetasDelMas = () =>
    carpetasDelEscritorio(projectList(), activeSpace(), sesiones()).map((p) => ({
      id: p.id,
      name: p.name,
    }));
  async function abrirSitio(url: string, proyecto: string, session: string) {
    await abrirSesion(proyecto, session);
    const p: SiteTab = {
      clase: "sitio",
      id: siteTabId({ session, url }),
      project: proyecto,
      session,
      url,
    };
    pestanas.openContent(p);
  }

  /**
   * Abrir lo que el hilo anunció, por su ruta. La absoluta se arma con la
   * carpeta de hoy y no se guarda en la transcripción: la carpeta de datos
   * se mueve, y una ruta escrita envejece sin avisar. Sin carpeta se abre
   * la columna en vez de un error.
   */
  function abrirPorRel(rel: string) {
    const f = folder();
    if (!f) {
      return;
    }
    // El separador es el de la carpeta: `rel` viaja con barras normales.
    const sep = f.includes("\\") ? "\\" : "/";
    void abrirRuta(f + sep + rel.split("/").join(sep), rel);
  }

  /** El árbol recuenta por `harness:copia`, como al guardar un archivo desde su pestaña. */
  async function exportarChat(id: string, proyecto: string) {
    try {
      const salida = await invoke<ChatExportado>("export_chat", { project: proyecto, id }, deLaTarea(id));
      abrirArtefacto(salida.rel, salida.path);
      window.dispatchEvent(new CustomEvent("harness:copia"));
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  async function forkDesde(turno: string, mode: "full" | "focused", encargado: string | null) {
    const workspace = workspaceActivo();
    const id = sessionId();
    const proyecto = project();
    if (!id) return;
    const context = await invoke<{
      path: string; last_prompt: string; last_reply: string;
      sources: string[]; excluded_sources: string[];
    }>("prepare_session_continuation", { project: proyecto, id, turno }, deLaTarea(id))
      .catch((e) => { throw prosaDe(e); });
    if (workspace !== workspaceActivo() || id !== sessionId() || proyecto !== project()) return;
    const prompt = mode === "full"
      ? t("chat.continuation.full_prompt", { path: context.path })
      : t("chat.continuation.focused_prompt", {
          path: context.path, prompt: context.last_prompt, reply: context.last_reply,
        });
    const machine = machineOf(id)?.headers["x-terminus-machine"] ?? maquinaDeLaVentana();
    setRunOn(workspace, machine);
    // Con agente, el borrador es el suyo, como al pulsar su fila en el riel:
    // la tarea nace con él y con el proveedor y modelo de su perfil.
    if (encargado) abrirBorradorDeAgente(proyecto, encargado);
    else nuevaSesion(proyecto);
    drafts.continueFrom(prompt, context.path, context.sources, context.excluded_sources);
  }
  const _out = { cambiarRama, abrirRuta, archivoMovido, archivoBorrado, reatarVistaPrevia, abrirEnlace, abrirNavegador, carpetasDelMas, abrirSitio, abrirPorRel, exportarChat, forkDesde };
  Object.assign(_bridge, _out);
  return _out;
}
