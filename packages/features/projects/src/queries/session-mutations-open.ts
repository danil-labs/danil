import type { Accessor, Setter } from "solid-js";
import { invoke } from "../../../../engine-client/src/client.ts";
import { prosaDe } from "../../../../ui/src/Failure.tsx";
import { t } from "../../../../../apps/desktop/src/lib/i18n.ts";
import { carpetasDelEscritorio, type Space } from "../../../../ui/src/lib/spaces.ts";
import { artifactTabId, browserTabId, fileTabId, siteTabId, type ArtifactTab, type SiteTab } from "../../../../ui/src/lib/tabs.ts";
import type { ArbolEnTarea, Project, Source } from "../../../../ui/src/lib/model.ts";
import type { ChatExportado, DraftsStore, PanelsStore, TabsStore, TaskFilesStore } from "../../../../ui/src/lib/project-block-types.ts";
import type { SessionRow } from "../screens/Sessions.tsx";

export type SessionMutationsOpenDeps = { abrirBorradorDeAgente: (enProyecto: string, name: string) => void; abrirSesion: (proyecto: string, id: string, activar?: string, propagateError?: boolean) => Promise<void>; activeSpace: Accessor<Space | null>; adjuntarFuente: (id: string) => Promise<void>; arbolesDe: (project: string, session: string) => Promise<ArbolEnTarea[]>; archivosDeTarea: TaskFilesStore; cerrarPestana: (id: string) => void; claveAbierta: () => string; contiene: (carpeta: string, absoluta: string) => boolean; deLaTarea: (id: string | null | undefined) => { headers: { "x-terminus-machine": string } } | undefined; draftBases: Accessor<Record<string, string>>; drafts: DraftsStore; esDeCodigo: (kind: string) => boolean; filaDe: (id: string) => SessionRow | undefined; folder: Accessor<string | null>; machineOf: (id: string | null | undefined) => { headers: { "x-terminus-machine": string } } | undefined; maquinaDeLaVentana: () => string; materialTarget: () => string; nuevaSesion: (enProyecto?: string) => void; paneles: PanelsStore; pestanas: TabsStore; project: Accessor<string>; projectList: Accessor<Project[]>; quitarFuente: (id: string) => Promise<void>; sesiones: Accessor<Record<string, SessionRow[]>>; sessionId: Accessor<string | null>; setError: Setter<string | null>; setProyectoAbierto: Setter<string | null>; setRunOn: (workspace: string | null, id: string | null) => void; taskMaterialOptions: () => { headers: Record<string, string> } | undefined; ubicar: (arboles: readonly ArbolEnTarea[], absoluta: string) => { arbol: ArbolEnTarea; rel: string } | null; workspaceActivo: Accessor<string | null>; };

export function createSessionMutationOpen(deps: SessionMutationsOpenDeps) {
  const maquinaDeLaVentana = () => deps.maquinaDeLaVentana();
  const adjuntarFuente = (id: string) => deps.adjuntarFuente(id);
  const quitarFuente = (id: string) => deps.quitarFuente(id);
  const materialTarget = () => deps.materialTarget();
  const taskMaterialOptions = () => deps.taskMaterialOptions();

  const { abrirBorradorDeAgente, abrirSesion, activeSpace, arbolesDe, archivosDeTarea, cerrarPestana, claveAbierta, contiene, deLaTarea, draftBases, drafts, esDeCodigo, filaDe, folder, machineOf, nuevaSesion, paneles, pestanas, project, projectList, sesiones, sessionId, setError, setProyectoAbierto, setRunOn, ubicar, workspaceActivo } = deps;

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
  return { cambiarRama, abrirRuta, archivoMovido, archivoBorrado, reatarVistaPrevia, abrirEnlace, abrirNavegador, carpetasDelMas, abrirSitio, abrirPorRel, exportarChat, forkDesde, };
}
