import { open } from "@tauri-apps/plugin-dialog";
import { createEffect, createMemo, createSignal, createUniqueId, on, onCleanup, type JSX } from "solid-js";
import { rememberRoster } from "../../../../../apps/desktop/src/lib/handlerRoster";
import { createCopied } from "../../../../host/src/clipboard";
import { machineAction } from "../../../../host/src/machine-action";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import type { CreateFreeRouterConsent } from "../../../../ui/src/lib/freeRouterConsent.ts";
import { getProjectSetupCommand, listAgents, setAgentHidden, setProjectSetupCommand } from "../queries";
import {
  type Agent,
  carpetaDeTrabajo,
  type HandlerList,
  type Project,
  type Source,
} from "../../../../../apps/desktop/src/lib/model";
import { lineaDeProcedencia, procedencia } from "../../../../../apps/desktop/src/lib/sourceOrigin";
import { prosaDe } from "../../../../ui/src/Failure";
import { agentsWithDifferentReaders } from "../model/agentReaders";
import { watchHandlerStatuses } from "../queries/handlerPresence";
import type { ModelChoices } from "./NewAgent";
import { notifyProfiles, watchProfiles } from "../queries/profiles";
import type { SessionRow } from "./Sessions";
import type { Etapa } from "./TaskStage";

export type VistaDeProyectoProps = {
  /** El workspace abierto: la memoria de la cuenta y su historial son suyos. */
  workspace?: string | null;
  proyecto: Project;
  /** Llegó desde «Material que lee»: entra por Configuración en vez de por las tareas. */
  materialPedido?: boolean;
  onMaterialVisto?: () => void;
  /** El catálogo del workspace: es quien sabe nombrar y ubicar cada fuente. */
  sources: Source[];
  /** Para nombrar quién escribió una entrada de memoria, por su id. */
  agents: Agent[];
  sessions: SessionRow[];
  current: string | null;
  vivas: string[];
  aprobando: string[];
  /** Los demás proyectos, para el menú de mover de cada tarea. */
  destinos: { id: string; name: string }[];
  onNueva: () => void;
  onAbrir: (id: string) => void;
  onHablarCon: (name: string) => void;
  onDelete: (id: string, members?: number) => void;
  onMove: (id: string, to: string) => void;
  onEtapa: (id: string, etapa: Etapa | null) => void;
  onRenombrar: (id: string, title: string) => void;
  onPin?: (id: string, pinned: boolean) => void | Promise<void>;
  onAdjuntar: (source: string) => void | Promise<void>;
  onQuitar: (source: string) => void | Promise<void>;
  /**
   * Fija la carpeta de trabajo. Nunca se llama con `null`: el `cwd` no se
   * puede dejar vacío. Quien la recibe recarga los proyectos y el árbol.
   */
  onCarpetaEditable: (dir: string | null) => void | Promise<void>;
  /** Lo que se ofrece como modelo por defecto al crear un agente. */
  modelos: ModelChoices;
  material: (entrada: { onCancelar: () => void; onListo: (source: string) => Promise<void> | void }) => JSX.Element;
  createFreeRouterConsent: CreateFreeRouterConsent;
};

/** El estado de la vista de un proyecto: pestaña, encargados, preparación, carpeta y fuentes. */
export function createVistaDeProyecto(props: VistaDeProyectoProps) {
  // Abrir el proyecto es una acción de la persona: su VM se enciende si está apagada.
  machineAction();
  const [pestana, setPestana] = createSignal("tasks");
  // El cuerpo no se remonta al cambiar de carpeta: cada una abre en sus tareas.
  createEffect(on(() => props.proyecto.id, () => setPestana("tasks"), { defer: true }));
  createEffect(() => {
    if (!props.materialPedido) return;
    setPestana("settings");
    props.onMaterialVisto?.();
  });
  const idPreparacion = createUniqueId();
  const [anadiendo, setAnadiendo] = createSignal(false);
  const [preparacion, setPreparacion] = createSignal("");
  const [falloDePreparacion, setFalloDePreparacion] = createSignal<
    string | null
  >(null);

  const [encargados, setEncargados] = createSignal<HandlerList>({
    agents: [],
    rechazados: [],
  });
  // Quien no aparece en el estado está dormido: la ausencia en los dos
  // registros del backend ES «dormido», no un dato que falte.
  const presencia = watchHandlerStatuses(props.proyecto.id);
  const porNombre = createMemo(() => new Map(presencia().map((f) => [f.name, f.status])));
  const estadoDe = (name: string) => porNombre().get(name) ?? "asleep";

  // Se relee al cambiar de proyecto: el campo es de la carpeta, no de la
  // pantalla, y arrastrar el del anterior lo guardaría en el que se abre.
  createEffect(() => {
    const id = props.proyecto.id;
    void getProjectSetupCommand(id)
      .then((c) => setPreparacion(c ?? ""))
      .catch(() => setPreparacion(""));
  });

  const [creando, setCreando] = createSignal(false);

  // Uno propio nace en la app y tiene que aparecer sin cambiar de proyecto.
  // Uno del repositorio lo edita quien quiera, y aparece al volver aquí.
  function releerEncargados() {
    const id = props.proyecto.id;
    void listAgents(id)
      .then((listado) => {
        rememberRoster(id, listado.agents);
        setEncargados(listado);
      })
      .catch(() => setEncargados({ agents: [], rechazados: [] }));
  }

  createEffect(on(() => props.proyecto.id, releerEncargados));
  // Borrar u ocultar uno pasa en su perfil, que vive en otra pestaña: sin
  // esto, el que ya no está se sigue listando aquí hasta cambiar de proyecto.
  window.addEventListener("harness:encargados", releerEncargados);
  onCleanup(() => window.removeEventListener("harness:encargados", releerEncargados));

  const perfiles = watchProfiles(props.proyecto.id);
  const oculto = (name: string) => perfiles()[name]?.hidden === true;
  const visibles = createMemo(() => encargados().agents.filter((e) => !oculto(e.name)));
  const ocultos = createMemo(() => encargados().agents.filter((e) => oculto(e.name)));
  const lectoresDistintos = createMemo(() => agentsWithDifferentReaders(visibles()));

  async function mostrar(name: string) {
    try {
      await setAgentHidden({ project: props.proyecto.id, name, hidden: false });
      notifyProfiles();
      window.dispatchEvent(new CustomEvent("harness:encargados"));
    } catch {
      // Sin aviso: la fila sigue en «ocultos» y el gesto se repite. Un error
      // en rojo aquí sería más ruido que el botón que no hizo nada.
    }
  }

  async function guardarPreparacion() {
    const command = preparacion().trim();
    setFalloDePreparacion(null);
    try {
      await setProjectSetupCommand({
        project: props.proyecto.id,
        command: command || null,
      });
    } catch (e) {
      setFalloDePreparacion(prosaDe(e));
    }
  }
  const [trayendo, setTrayendo] = createSignal(false);

  /** Con el selector del sistema: una ruta tecleada falla en el turno, no aquí. */
  async function elegirCarpeta() {
    const dir = await open({
      directory: true,
      multiple: false,
      defaultPath: carpetaDeTrabajo(props.proyecto) ?? undefined,
      title: t("projects.view.work_pick_title"),
    });
    if (typeof dir === "string") await props.onCarpetaEditable(dir);
  }

  const carpeta = () => carpetaDeTrabajo(props.proyecto);
  const { copied: rutaCopiada, copy: copiarRuta } = createCopied();

  const fijo = () =>
    props.proyecto.sources
      .map((id) => props.sources.find((s) => s.id === id))
      .filter((s): s is Source => Boolean(s));

  /** La raíz de gobierno del workspace, si no está ya adjunta al proyecto. */
  const raiz = () => {
    const r = props.sources.find((s) => s.root);
    return r && !props.proyecto.sources.includes(r.id) ? r : null;
  };

  const disponibles = () => {
    const unicas = new Map<string, Source>();
    for (const s of props.sources) {
      if (
        props.proyecto.sources.includes(s.id) ||
        s.root ||
        !s.project_attachable ||
        unicas.has(s.identity)
      ) {
        continue;
      }
      unicas.set(s.identity, s);
    }
    return [...unicas.values()];
  };

  const cuenta = (s: Source) => {
    const p = procedencia(s);
    return p.proveedor ? p.sitio.split("/")[0] : null;
  };

  const distingueCuenta = (s: Source) => {
    const actual = cuenta(s);
    return (
      actual !== null &&
      disponibles().some(
        (otra) =>
          otra.id !== s.id &&
          otra.etiqueta === s.etiqueta &&
          cuenta(otra) !== actual,
      )
    );
  };

  /** De dónde viene, como lo reconoce la persona; nunca la copia bajo AppData. */
  const origen = (s: Source) => {
    const lugar = procedencia(s);
    return lineaDeProcedencia(
      { ...lugar, rama: null },
      t("projects.view.origin_folder"),
    );
  };
  return { pestana, setPestana, idPreparacion, anadiendo, setAnadiendo, preparacion, setPreparacion, falloDePreparacion, encargados, estadoDe, creando, setCreando, releerEncargados, perfiles, visibles, ocultos, lectoresDistintos, mostrar, guardarPreparacion, trayendo, setTrayendo, elegirCarpeta, carpeta, rutaCopiada, copiarRuta, fijo, raiz, disponibles, cuenta, distingueCuenta, origen };
}

export type VistaDeProyecto = ReturnType<typeof createVistaDeProyecto>;
