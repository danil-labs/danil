import { batch, createSignal, type Accessor, type Setter } from "solid-js";
import { invoke } from "../../../../engine-client/src/client.ts";
import type { AgentProfile as AgentProfileData, Project } from "../../../../../apps/desktop/src/lib/model.ts";
import type {
  ComposerStore,
  ContextoDeProyectos,
  DraftsStore,
  PanelsStore,
  TabsStore,
} from "../../../../../apps/desktop/src/lib/project-block-types.ts";
import { taskCountOf } from "../model/recent.ts";
import type { PanelSite } from "../../../../../apps/desktop/src/lib/panels.ts";

export type NewTaskDeps = {
  abrirProyecto: (id: string) => void;
  alta: Accessor<boolean>;
  arrancando: Accessor<boolean>;
  borrarProyecto: (id: string) => Promise<void>;
  carpetaDelEscritorio: (pedido: string) => string;
  cerrarBorrador: (sitio: PanelSite) => void;
  cerrarPestanasYa: (ids: string[]) => void;
  composer: ComposerStore;
  drafts: DraftsStore;
  enBorrador: (sitio: PanelSite) => boolean;
  hablandoCon: Accessor<{ project: string; name: string } | null>;
  hablarConEncargado: (enProyecto: string, name: string) => void;
  multipleSpaces: () => boolean;
  ocultarDelSelector: (id: string, ocultar: boolean) => void;
  ocultosAqui: Accessor<Set<string>>;
  paneles: PanelsStore;
  pedirElCampo: () => void;
  pestanaActiva: () => string | null;
  pestanas: TabsStore;
  project: Accessor<string>;
  proyectosDelRiel: () => Project[];
  proyectoDeNuevaTarea: (pedido: string | undefined, activo: string) => string;
  removeFromActiveSpace: (folder: string) => Promise<void>;
  renombrarProyecto: (id: string, name: string) => Promise<void>;
  restoreDraftConfiguration: () => void;
  setAnadiendoCarpeta: Setter<boolean>;
  setAntesDelBorrador: Setter<string | null>;
  setCuentasTocadas: Setter<number>;
  setFolder: Setter<string | null>;
  setHablandoCon: Setter<{ project: string; name: string } | null>;
  setMaterialPedido: Setter<string | null>;
  setProject: Setter<string>;
  setProyectoAbierto: Setter<string | null>;
  setRunOn: (workspace: string | null, id: string | null) => void;
  setSessionId: Setter<string | null>;
  setSettings: Setter<string | null>;
  settings: Accessor<string | null>;
  soltarCola: () => void;
  soltarHilo: (session: string) => void;
  tareasActivas: Accessor<Record<string, number>>;
  workspaceActivo: Accessor<string | null>;
};

export function createNewTask(deps: NewTaskDeps) {
  const proyectosDelRiel = () => deps.proyectosDelRiel();
  const abrirProyecto = (id: string) => deps.abrirProyecto(id);
  const borrarProyecto = (id: string) => deps.borrarProyecto(id);
  const renombrarProyecto = (id: string, name: string) => deps.renombrarProyecto(id, name);
  const hablarConEncargado = (enProyecto: string, name: string) => deps.hablarConEncargado(enProyecto, name);
  const soltarCola = () => deps.soltarCola();
  const cerrarPestanasYa = (ids: string[]) => deps.cerrarPestanasYa(ids);
  const removeFromActiveSpace = (folder: string) => deps.removeFromActiveSpace(folder);
  const { alta, arrancando, carpetaDelEscritorio, cerrarBorrador, composer, drafts, enBorrador, hablandoCon, multipleSpaces, ocultarDelSelector, ocultosAqui, paneles, pedirElCampo, pestanaActiva, pestanas, project, proyectoDeNuevaTarea, restoreDraftConfiguration, setAnadiendoCarpeta, setAntesDelBorrador, setCuentasTocadas, setFolder, setHablandoCon, setMaterialPedido, setProject, setProyectoAbierto, setRunOn, setSessionId, setSettings, settings, soltarHilo, tareasActivas, workspaceActivo } = deps;

  /** Una tarea nueva con la carpeta y el agente ya elegidos. */
  function abrirBorradorDeAgente(enProyecto: string, name: string) {
    setHablandoCon({ project: enProyecto, name });
    irAlBlanco(enProyecto);
    // El borrador tampoco arranca a ciegas: si ya declaró con qué
    // prefiere trabajar, la caja en blanco lo trae puesto en vez del
    // último agente que se usó en cualquier otra conversación.
    void invoke<Record<string, AgentProfileData>>("list_agent_profiles", { project: enProyecto })
      .then((perfiles) => {
        const sigue = hablandoCon();
        if (sigue?.project !== enProyecto || sigue.name !== name) return;
        const perfil = perfiles[name];
        if (!perfil) return;
        composer.useProfile(perfil);
      })
      .catch(() => {});
  }

  /**
   * Qué perfil se pide abrir desde el riel. Lo consume la celda que acaba
   * teniendo delante a ese agente: su conversación se abre antes, y sin esta
   * espera el perfil se pediría a una celda que todavía enseña otra cosa.
   */
  const [requestedProfile, setRequestedProfile] = createSignal<{
    project: string;
    name: string;
  } | null>(null);

  /** Ajustes → Proyectos usa las carpetas y las acciones del riel. Un solo objeto: la hoja no se remonta. */
  const proyectosEnAjustes: ContextoDeProyectos = {
    get projects() {
      return proyectosDelRiel();
    },
    onAdd: () => setAnadiendoCarpeta(true),
    onRename: (id, name) => void renombrarProyecto(id, name),
    onDelete: (id) => void borrarProyecto(id),
    get onRemoveFromSpace() {
      return multipleSpaces() ? removeFromActiveSpace : undefined;
    },
    activeTasks: (id) => taskCountOf({ id, sessions: 0 }, tareasActivas()),
    hiddenInPicker: (id) => ocultosAqui().has(id),
    onSetHiddenInPicker: (id, hide) => ocultarDelSelector(id, hide),
    onOpenMaterial: (id) => {
      cerrarAjustes();
      setMaterialPedido(id);
      abrirProyecto(id);
    },
  };

  function cerrarAjustes() {
    setSettings(null);
    setCuentasTocadas((n) => n + 1);
    // Conectar una cuenta, pegar una clave o activar los gratuitos
    // ocurre ahí dentro, y es justo lo que decide qué ofrece el menú del
    // chat. Sin esto habría que reabrir la app para verlo.
    void composer.refreshSurfaces(false);
  }

  function openAgentProfile(enProyecto: string, name: string) {
    setRequestedProfile({ project: enProyecto, name });
    hablarConEncargado(enProyecto, name);
  }

  /**
   * Una carpeta con tareas en varias máquinas se parte en un grupo por máquina
   * en el riel: lo que se empieza desde un grupo corre en la suya (`""` es esta).
   */
  function enLaMaquinaDelGrupo(machine: string | undefined) {
    if (machine !== undefined) setRunOn(workspaceActivo(), machine || null);
  }

  function nuevaSesion(enProyecto?: string) {
    // Empezar una tarea es cuando más barato sale enterarse de que el
    // material se movió: si esta tarea va a leer un repositorio, ¿está al
    // día? Se comprueba, no se trae —traer mueve el árbol que otras
    // tareas leen, y esa decisión es de quien mira el aviso.
    window.dispatchEvent(new CustomEvent("harness:tarea-nueva"));
    // Una tarea nueva a secas no es de nadie: si la anterior se abrió desde
    // la fila de un agente, ese nombre no puede arrastrarse hasta esta.
    setHablandoCon(null);
    irAlBlanco(proyectoDeNuevaTarea(enProyecto, carpetaDelEscritorio(project())));
  }

  /**
   * La conversación en blanco: lo que el panel enseña sin tarea abierta.
   * `nuevaSesion` es esto más el aviso de que se va a empezar algo. No es
   * una pestaña de `lib/tabs.ts`: la tira solo la pinta como «Nueva tarea»
   * (`enBorrador`). Su borrador —separado por proyecto— espera hasta el
   * primer turno.
   */
  function irAlBlanco(enProyecto = project()) {
    const delante = paneles.activeTabAt(paneles.activeSite());
    batch(() => {
      if (delante !== null) setAntesDelBorrador(delante);
      setProject(enProyecto);
      setProyectoAbierto(null);
      pestanas.activate(null);
      // Y la ventana también se queda sin pestaña delante: `pestanas` y
      // `paneles` llevan la cuenta por separado. Sin esto, la ventana
      // seguía enseñando la conversación anterior bajo la pantalla en blanco.
      paneles.showDraft();
      setSessionId(null);
      restoreDraftConfiguration();
      composer.startNewDraft();
      setFolder(null);
      // Lo que la tarea que se deja ya lee es suyo; el borrador de la
      // conversación en blanco es el suyo y no se toca.
      drafts.replaceAttached([]);
      soltarCola();
      // El hilo sin id es el del primer turno. Si Rust lo negó, se quedaba
      // pintado en toda tarea nueva, de este proyecto o de otro.
      if (!arrancando()) soltarHilo("");
    });
    pedirElCampo();
  }

  function closeActiveTab() {
    if (settings() !== null || alta()) return;
    const id = pestanaActiva();
    if (id) cerrarPestana(id);
    else if (enBorrador(paneles.activeSite())) cerrarBorrador(paneles.activeSite());
  }

  /**
   * Cerrar una pestaña no cierra la sesión: la quita de la tira y suelta
   * su borrador. Su turno, si sigue corriendo, sigue corriendo —Rust no
   * sabe de pestañas—; si era la activa pasa a la vecina y sin vecinas,
   * al blanco: el reparto de un navegador.
   */
  function cerrarPestana(id: string) {
    cerrarPestanas([id]);
  }

  /**
   * Varias a la vez, desde el menú de la tira: una escritura y una vecina. Si en
   * lo que se va hay un archivo sin guardar, primero se pregunta.
   */
  function cerrarPestanas(ids: string[]) {
    const sinGuardar = pestanas.dirtyTabsToClose(ids);
    if (sinGuardar.length > 0) {
      setCierreSinGuardar({ ids, archivos: sinGuardar.map((a) => a.ruta), sucios: sinGuardar.map((a) => a.id) });
      return;
    }
    cerrarPestanasYa(ids);
  }

  /** Lo que la tira tenía sin guardar cuando alguien pidió cerrar. */
  const [cierreSinGuardar, setCierreSinGuardar] = createSignal<{
    ids: string[];
    archivos: string[];
    sucios: string[];
  } | null>(null);

  return {
    abrirBorradorDeAgente, requestedProfile, setRequestedProfile, proyectosEnAjustes,
    cerrarAjustes, openAgentProfile, enLaMaquinaDelGrupo, nuevaSesion, irAlBlanco,
    closeActiveTab, cerrarPestana, cerrarPestanas, cierreSinGuardar, setCierreSinGuardar,
  };
}
