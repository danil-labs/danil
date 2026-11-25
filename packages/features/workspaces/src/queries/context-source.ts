import type { AgentProfile as AgentProfileData } from "../../../../ui/src/lib/model.ts";
import type { Session } from "../../../../ui/src/lib/project-block-types.ts";
import type { MentionSources } from "../../../../ui/src/lib/mentions.ts";
import { escritorioDeFila } from "../../../../ui/src/lib/spaces.ts";
import { esProvisional, sameSources, unirFuentes } from "../../../../ui/src/lib/taskDraft.ts";
import { isTaskTab, type Tab } from "../../../../ui/src/lib/tabs.ts";
import { t } from "../../../../ui/src/lib/i18n.ts";
import { type SessionUsage, ventanaDe } from "../../../../ui/src/lib/usage.ts";
import { callEngine } from "../../../../engine-client/src/client.ts";
import { canonicalAgentId } from "../../../../ui/src/lib/tasks/agents.ts";
import { chipModel as modeloDeSubtarea } from "../../../../ui/src/lib/tasks/surfaces.ts";
import { prosaDe } from "../../../../ui/src/Failure.tsx";
import type { Startup } from "../../../../ui/src/lib/workspace-startup.ts";
import { batch, createEffect, createMemo, on, onCleanup } from "solid-js";

type Deps = {
  adjuntas: () => string[];
  excludedSourceIds: () => string[];
  sourceIds: () => string[];
  project: () => string;
  sessionId: () => string | null;
  projectCatalog: { refresh(): Promise<{ id: string }[]>; changed(): Promise<unknown>; rename(id: string, name: string): Promise<unknown>; attach(id: string, source: string): Promise<unknown>; detach(id: string, source: string): Promise<unknown>; workTree(id: string, dir: string | null): Promise<unknown>; remove(id: string): Promise<unknown> };
  pestanas: { ensure(p: { id: string; project: string; titulo: string }): void; activate(id: string | null): void; open(): Tab[] };
} & Record<"abrirBorradorDeAgente" | "aplicar" | "cambiarEscritorio" | "cola" | "composer" | "deLaTarea" | "drafts" | "engineCanDispatch" | "escritorio" | "filaDe" | "hilos" | "leerTarea" | "loadResult" | "nuevaSesion" | "open" | "paneles" | "proyectoAbierto" | "refreshFolder" | "refreshSessions" | "releerCola" | "reloadSpaces" | "restoreDraftConfiguration" | "restoreSessionConfiguration" | "setError" | "setFolder" | "setHablandoCon" | "setMentionSources" | "setProject" | "setProjectReadError" | "setProyectoAbierto" | "setSessionId" | "setVentana" | "spaces" | "taskQueues" | "threads" | "workspaceActivo" | "workspaceContext", any>;

export function createContextSource(deps: Deps) {
  const { abrirBorradorDeAgente, adjuntas, aplicar, cambiarEscritorio, cola, composer, deLaTarea, drafts, engineCanDispatch, escritorio, excludedSourceIds, filaDe, hilos, leerTarea, loadResult, nuevaSesion, open, paneles, pestanas, project, projectCatalog, proyectoAbierto, refreshFolder, refreshSessions, releerCola, reloadSpaces, sessionId, setError, setFolder, setHablandoCon, setMentionSources, setProject, setProjectReadError, setProyectoAbierto, setSessionId, setVentana, sourceIds, spaces, taskQueues, threads, workspaceActivo, workspaceContext } = deps;
  const restoreDraftConfiguration = (...a: Parameters<typeof deps.restoreDraftConfiguration>) => deps.restoreDraftConfiguration(...a);
  const restoreSessionConfiguration = (...a: Parameters<typeof deps.restoreSessionConfiguration>) => deps.restoreSessionConfiguration(...a);
  /**
   * Lo que esta tarea le va a adjuntar al turno: lo que ya lee más lo que está
   * puesto en la caja y todavía no ha viajado.
   */
  const fuentesDeLaTarea = createMemo(
    () => unirFuentes(adjuntas(), sourceIds()),
    undefined,
    { equals: sameSources },
  );

  // Las menciones @ salen de la carpeta de trabajo (`session`) y de lo adjunto.
  // Se relee al cambiar de tarea o de fuentes, no en cada turno: recorrer
  // una fuente entera es caro, y el material es de SOLO LECTURA. Se le pasa
  // el proyecto, la sesión y las fuentes, no las rutas ya resueltas: armarlo
  // aquí escribiría la misma regla en dos lenguajes, y su divergencia no
  // daría error, solo resolvería a otro archivo al mandar la mención.
  createEffect(
    on([project, fuentesDeLaTarea, excludedSourceIds, sessionId], ([p, fs, excluidas, session]) => {
      let current = true;
      onCleanup(() => {
        current = false;
      });
      callEngine<MentionSources>("list_mentions", {
        project: p,
        sources: fs,
        excludedSources: excluidas,
        session,
      }, deLaTarea(session))
        .then((result) => {
          if (current) setMentionSources(result);
        })
        .catch(() => {
          if (current) setMentionSources(null);
        });
    }),
  );

  // La ocupación de la ventana se deriva del registro cada vez que se abre. No
  // se guarda en la sesión ni se acumula: manda el último turno registrado.
  createEffect(
    on([sessionId, project], ([id, p]) => {
      if (!id) {
        setVentana(null);
        return;
      }
      callEngine<SessionUsage>("session_usage", { project: p, session: id }, deLaTarea(id))
        .then((s) => setVentana(ventanaDe(s.records)))
        .catch(() => setVentana(null));
    }),
  );

  /** La fuente de contexto del workspace: su raíz de gobierno, una sola. */
  async function elegirCarpetaDelWorkspace() {
    const r = await open({ directory: true, multiple: false });
    if (typeof r !== "string") return;
    try {
      await callEngine("set_workspace_source", { kind: "folder", locator: r });
      await aplicar(await callEngine<Startup>("list_workspaces"));
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  /**
   * Relee la lista del disco sin tocar nada. El tipo de una carpeta se mide
   * en disco: la que el agente convirtió en repositorio con `git init` se
   * seguía viendo como carpeta hasta reabrir la app, y sin repositorio no hay
   * ni árbol propio ni rama base.
   */
  async function releerProyectos() {
    const workspace = workspaceActivo();
    try {
      await projectCatalog.changed();
      if (workspace === workspaceActivo()) setProjectReadError(null);
    } catch {
      // La lista anterior sigue sirviendo: releer es una puesta al día.
    }
  }

  async function renombrarProyecto(id: string, name: string) {
    try {
      await projectCatalog.rename(id, name);
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  // Abre el proyecto en el panel principal. Cambia además el contexto activo
  // —es `elegirProyecto`—: la tarea que se empiece desde aquí es suya, y
  // mirar un proyecto mientras se escribe contra otro es justo el error que
  // el selector de la caja existe para evitar.
  function abrirProyecto(id: string) {
    elegirProyecto(id);
    setProyectoAbierto(id);
  }

  /** Material que leerá toda tarea del proyecto, no solo la abierta. */
  async function adjuntarAlProyecto(id: string, source: string) {
    try {
      await projectCatalog.attach(id, source);
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  async function quitarDelProyecto(id: string, source: string) {
    try {
      await projectCatalog.detach(id, source);
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  // Registra —o quita— la carpeta de trabajo del proyecto. Avisa al panel del
  // árbol de trabajo, que la enseña sin que alguien reabra nada.
  async function carpetaEditable(id: string, dir: string | null) {
    try {
      await projectCatalog.workTree(id, dir);
      window.dispatchEvent(new CustomEvent("harness:copia"));
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  async function borrarProyecto(id: string) {
    try {
      await projectCatalog.remove(id);
      if (proyectoAbierto() === id) setProyectoAbierto(null);
      if (project() === id) {
        nuevaSesion();
        setProject("");
      }
      const quedan = await projectCatalog.refresh();
      void reloadSpaces();
      await refreshSessions(["", ...quedan.map((p) => p.id)]);
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  // Elegir proyecto en el selector cambia el contexto entero: sesiones, chat
  // y artefactos son del proyecto y no se arrastran. Es un gesto, no un valor
  // derivado de un efecto sobre `project`: ahí no se distingue elegir de
  // restituir, y abrir una sesión de otro proyecto cambia el mismo valor,
  // corriendo el efecto después y quitándole el id a la sesión recién
  // abierta.
  function elegirProyecto(name: string) {
    // Lo que la tarea que se deja ya lee no es de la conversación en blanco.
    // Su borrador —lo pendiente, lo escrito— se queda en su pestaña y no viaja:
    // el de la conversación en blanco es el suyo, y si tenía algo puesto antes
    // de nombrar el trabajo, sigue ahí.
    batch(() => {
      drafts.replaceAttached([]);
      setProject(name);
      setSessionId(null);
      restoreDraftConfiguration();
      setFolder(null);
      soltarCola();
    });
  }

  // Sin cola en la mano: se llama al moverse de sesión o de proyecto, en un
  // solo lote —de eso depende que no se borre lo que se deja atrás—. Cada
  // asignación suelta corre los efectos antes de la siguiente: `setCola([])`
  // con `colaDe` todavía nombrando la sesión que se abandona es un
  // `save_queue` con la cola vacía, y el `.cola.json` de esa tarea desaparece
  // con lo que se había escrito para ella.
  const soltarCola = taskQueues.detach;

  // Abrir una sesión de otro proyecto cambia el contexto entero: la sesión
  // pertenece a su proyecto y arrastrarla al activo la sacaría de sitio.
  async function abrirSesion(proyecto: string, id: string, activar = id, propagateError = false) {
    // Rust no sabe de ella todavía: leerla daría un fallo por una fila que la
    // pantalla pinta a propósito.
    if (esProvisional(id)) return;
    setHablandoCon(null);
    // Una tarea se abre en su escritorio: su pestaña va en esa tira.
    const suyo = escritorioDeFila(filaDe(id), spaces());
    if (suyo && suyo !== escritorio()) cambiarEscritorio(suyo, false);
    // Abrir es tener a mano: la tarea gana pestaña si no la tenía, y si la
    // tenía se activa esa — nunca una segunda.
  // Antes de cargar nada: `activar` es un parámetro. Poner la pestaña delante
  // después del `await` enseñaría la conversación un cuadro antes que el
  // archivo que se acaba de pulsar. Juntas: entre una y otra la pestaña nueva
  // queda detrás de la que estaba, y `montadas` la desmontaría.
    batch(() => {
      if (activar === id) pestanas.ensure({ id, project: proyecto, titulo: filaDe(id)?.title ?? "" });
      pestanas.activate(activar);
    });
    if (id === sessionId() && proyecto === project()) {
      // Ya estaba cargada: volver a ella desde una pestaña suya no relee la
      // transcripción ni la cola. Releerlas tiraría lo que el turno vivo lleva
      // dicho y volvería a poner en la caja lo que quedó encolado.
      setProyectoAbierto(null);
      return;
    }
    setProyectoAbierto(null);
    setProject(proyecto);
    setSessionId(id);
    soltarCola();
  // Antes del `await`: el hueco que hay que tapar empieza en el
  // `setSessionId` de arriba, no cuando la lectura del disco tarda. Ver
  // `cargandoHilo`. Solo se marca si su hilo NO está ya en memoria: con
  // varias ventanas, pulsar en una para darle el mando vuelve a pasar por
  // aquí aunque su transcripción lleve rato pintada, y marcarla como «viene
  // en camino» la mandaría al esqueleto y de vuelta.
    if (!hilos()[id]) threads.startLoading(id);
    const generation = workspaceContext.generation();
    const current = () => generation === workspaceContext.generation() && sessionId() === id && project() === proyecto;
    try {
      const s = await leerTarea(proyecto, id);
      if (!current()) return;
      // Reanudar conserva con qué corrió: una sesión continuada con otro agente
      // o con otro modelo ya no es la misma sesión.
      // Una tarea de un motor anterior guarda `opencode-zen`; el modelo decide si es OpenCode o el Free Router.
      composer.resumeTask({ provider: canonicalAgentId(s.provider, modeloDeSubtarea(s)), model: modeloDeSubtarea(s) ?? "", effort: s.effort ?? "" });
      // La transcripción ya llegó; las preferencias opcionales no retienen su pintura.
      loadResult(id, s, false, generation);
      void refreshFolder(proyecto, id);
      // El chat de un encargado no es una tarea que se reabre para releer
      // su historial: es su conversación de siempre, y su perfil dice con
      // qué prefiere seguir. Una preferencia guardada gana a lo último que
      // corrió — sin tocar los turnos ya escritos, solo la caja.
      if (s.chat_de_agente && s.agent) {
        try {
          const perfiles = await callEngine<Record<string, AgentProfileData>>(
            "list_agent_profiles",
            { project: proyecto },
          );
          const perfil = perfiles[s.agent];
          if (!current()) return;
          if (perfil) composer.useProfile(perfil);
        } catch {
          // Un perfil que no se pudo leer deja la caja con lo de la sesión.
        }
      }
  // Y con cuánta vigilancia corrió: una tarea escrita antes de que esto
  // existiera no lo dice, y ahí se deja vacío. El efecto de arriba lo baja al
  // que el agente sostenga, lo mismo que hace el backend con lo que nadie
  // eligió (`agents::Permisos::resolver`).
      composer.runtimeFact({ kind: "mode", value: s.permission_mode ?? "" });
      // Lo que esta tarea ya lee. No son pendientes: están guardados en ella.
      drafts.replaceAttached(s.sources ?? []);
      drafts.restoreSession(id, s.excluded_sources ?? []);
      // Y encima, lo que se eligió en su caja sin llegar a mandar nada.
      restoreSessionConfiguration(s);
    } catch (e) {
      if (!current()) return;
      try {
        const state = await callEngine<Session>("load_session", {
          project: proyecto, id, history_request: { version: 1, kind: "state" },
        }, deLaTarea(id));
        if (!current()) return;
        composer.resumeTask({ provider: canonicalAgentId(state.provider, modeloDeSubtarea(state)), model: modeloDeSubtarea(state) ?? "", effort: state.effort ?? "", mode: state.permission_mode ?? "" });
        drafts.replaceAttached(state.sources ?? []);
        restoreSessionConfiguration(state);
        void refreshFolder(proyecto, id);
      } catch { /* Sin estado autoritativo se conserva el error de la lectura original. */ }
      if (!current()) return;
      threads.replaceHistory(id, [{ role: "system", text: prosaDe(e) }], false);
      if (propagateError) throw e;
    } finally {
      // Solo si sigue siendo esta la que se espera: con dos aperturas
      // solapadas, la respuesta tardía de la primera apagaría el
      // indicador de la segunda y su hilo se pintaría a medias.
      threads.finishLoading(id);
    }
    // Después de la transcripción, que la reemplaza entera: un aviso
    // escrito antes de este punto no dejaría rastro.
    try {
      await taskQueues.openSession(id, proyecto, current, engineCanDispatch(id));
      // Lo que ya esperaba cuando se le pide al motor queda retenido por él: se relee tras pedírselo.
      if (engineCanDispatch(id) && sessionId() === id) {
        const hadQueued = cola().length > 0;
        void taskQueues.persist(id, proyecto, cola()).then(() => { if (hadQueued) void releerCola(id); }, () => {});
      }
    } catch (e) {
      if (!current()) return;
      // Sin esto la cola queda sin dueño: no es «no pude leerla», es que
      // la de esta tarea deja de funcionar —el despacho exige que la cola
      // en la mano sea la de la tarea abierta. Lo no leído se conserva en
      // su archivo: el guardado cuelga del contenido, y adoptar una mano
      // vacía no lo pisa.
      taskQueues.adopt(id);
      threads.appendLive(id, [{
                  role: "system",
                  text: t("shell.queue.load_failed", { error: prosaDe(e) }),
                  meta: "aviso",
                }]);
    }
  }

  /**
   * Trae la transcripción de una tarea sin abrirla: la usan las ventanas que
   * vuelven de un reparto guardado, para que su panel enseñe lo suyo aunque el
   * mando esté en otra. No toca la sesión abierta —eso lo hace `abrirSesion` al
   * pulsarla—: solo deja su hilo en memoria.
   */
  async function loadThread(project: string, id: string) {
    if (esProvisional(id) || hilos()[id]) return;
    const generation = workspaceContext.generation();
    try {
      const s = await leerTarea(project, id);
      if (generation !== workspaceContext.generation()) return;
      loadResult(id, s, false, generation);
    } catch {
      // Sin hilo, su panel queda vacío hasta pulsarla, y ahí `abrirSesion` lo
      // reintenta. No hay nada que avisar de una ventana que nadie pidió.
    }
  }

  /**
   * Carga la tarea de delante de cada ventana del reparto, menos `skip`, que es
   * la que abre `abrirSesion`. Es lo que hace que volver a un espacio no deje
   * sus ventanas en blanco, sin cargar ninguna pestaña que no esté delante.
   */
  function loadWindowThreads(skip: string | null) {
    for (const site of paneles.sites()) {
      const id = paneles.activeTabAt(site);
      if (!id || id === skip || id === sessionId()) continue;
      const tab = pestanas.open().find((p) => p.id === id);
      if (tab && isTaskTab(tab)) void loadThread(tab.project, tab.session);
    }
  }

  function hablarConEncargado(enProyecto: string, name: string) {
    abrirBorradorDeAgente(enProyecto, name);
  }
  return { elegirCarpetaDelWorkspace, releerProyectos, renombrarProyecto, abrirProyecto, adjuntarAlProyecto, quitarDelProyecto, carpetaEditable, borrarProyecto, elegirProyecto, soltarCola, abrirSesion, loadThread, loadWindowThreads, hablarConEncargado };
}
