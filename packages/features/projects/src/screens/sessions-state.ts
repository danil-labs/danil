import {
  finishTask as finishTaskQuery,
  setTaskArchived,
  getTaskBlockers,
  discardTaskChanges,
} from "../queries";
import { createEffect, createMemo, createSignal, mapArray, on, onCleanup } from "solid-js";
import { celebrateFinishedTask } from "../../../../ui/src/FinishTaskButton";
import type { TaskActionFailure } from "../components/TaskActionToast";
import { bringHereLabel, canBringHere, machines } from "../../../machines/src/queries/store";
import { createTaskHistories } from "../queries/taskHistories";
import { displayName, watchProfiles } from "../queries/profiles";
import { matchesTaskQuery } from "../model/taskSearch";
import { effectiveTaskGit, type GitStatus, watchSessionGit } from "../queries/taskGit";
import { isSubtask } from "../model/taskAuthors";
import { type Rama as RamaDeTareas, taskTree } from "../model/taskTree";
import { buildTaskTree, taskIdentity, withTaskAncestors } from "@terminus/tasks";
import type { Aviso, Blockers, SessionRow, SessionsProps } from "./sessions-model";

type EstadoDelWorktree = { available: boolean; owned: boolean };

export function createSessionsState(props: SessionsProps) {
  /** Fila de dos líneas con tarjeta flotante: el riel y quien la pide. */
  const tarjetaDelRiel = () => !!props.sidebar || !!props.card;
  const projectOf = (row: SessionRow) => props.projectOf?.(row) ?? props.de;
  const projectOfId = (id: string) => {
    const row = props.sessions.find((s) => s.id === id);
    return row ? projectOf(row) : props.de;
  };
  /** La cabecera que lleva una orden a la máquina de una tarea de otra máquina. */
  const enSuMaquina = (id: string) => {
    const machine = props.sessions.find((s) => s.id === id)?.machine;
    return machine ? { headers: { "x-terminus-machine": machine } } : undefined;
  };
  /** Una tarea de otra máquina que está apagada: lo que se le pide lo guarda el relay. */
  const apagada = (id: string) => {
    const row = props.sessions.find((s) => s.id === id);
    return !!row?.machine && row.machine_on === false;
  };
  const avisarCambio = (project: string) =>
    window.dispatchEvent(new CustomEvent("harness:tasks-changed", { detail: { project } }));
  const otherSpaces = (row: SessionRow) =>
    row.chat_de_agente || row.agent_thread || row.inbox
      ? []
      : (props.spaces ?? []).filter((i) => i.id !== row.space);
  const [finishing, setFinishing] = createSignal<string[]>([]);
  const [archiving, setArchiving] = createSignal<string[]>([]);
  /**
   * Las que se acaban de archivar o finalizar y la lista todavía no trae
   * archivadas: salen de la barra en el mismo gesto, no cuando vuelve el motor
   * (que mata turnos y toma los candados de la familia) y la relectura. Si el
   * motor lo rechaza, vuelven. Se sueltan solas cuando la fila llega archivada.
   */
  const [saliendo, setSaliendo] = createSignal<ReadonlySet<string>>(new Set());
  const sacar = (id: string) => setSaliendo((ids) => new Set(ids).add(id));
  const devolver = (id: string) => setSaliendo((ids) => {
    if (!ids.has(id)) return ids;
    const next = new Set(ids);
    next.delete(id);
    return next;
  });
  createEffect(() => {
    const ids = saliendo();
    if (ids.size === 0) return;
    const filas = new Map(props.sessions.map((s) => [s.id, s]));
    const quedan = [...ids].filter((id) => filas.has(id) && !filas.get(id)?.archived);
    if (quedan.length !== ids.size) setSaliendo(new Set(quedan));
  });
  const [actionFailure, setActionFailure] = createSignal<TaskActionFailure | null>(null);
  const [aviso, setAviso] = createSignal<Aviso | null>(null);
  const finishTask = async (id: string, rect: DOMRect) => {
    if (finishing().includes(id)) return;
    setFinishing(ids => [...ids, id]);
    setActionFailure(null);
    try {
      const project = projectOfId(id);
      sacar(id);
      // La fila sale y el cohete despega en el mismo gesto: esperar a que el
      // motor mate turnos y tome los candados deja el estallido solo.
      celebrateFinishedTask(rect);
      await finishTaskQuery(project, id, enSuMaquina(id));
      // `anunciar` no actualiza esta ventana: su firma es la de quien
      // escribió, y el sondeo la descarta. Sin este aviso el archivado
      // queda en disco y la lista de aquí sigue mostrando la fila.
      avisarCambio(project);
    } catch (error) {
      devolver(id);
      setActionFailure({ action: "finish", error, retry: () => void intentar(id, true, rect) });
    } finally {
      setFinishing(ids => ids.filter(value => value !== id));
    }
  };
  const archiveTask = async (id: string) => {
    if (archiving().includes(id)) return;
    setArchiving(ids => [...ids, id]);
    setActionFailure(null);
    try {
      const project = projectOfId(id);
      sacar(id);
      setMenu(null);
      await setTaskArchived(project, id, true, enSuMaquina(id));
      avisarCambio(project);
    } catch (error) {
      devolver(id);
      setActionFailure({ action: "archive", error, retry: () => void intentar(id, false) });
    } finally {
      setArchiving(ids => ids.filter(value => value !== id));
    }
  };
  // `finish_task` y `set_task_archived` matan los turnos y toman los candados
  // de la familia antes de mirar el árbol: sin esta pregunta previa la espera
  // es real y el error llega al final, sin salida.
  const intentar = async (id: string, finish: boolean, rect?: DOMRect) => {
    const marcar = finish ? setFinishing : setArchiving;
    if ((finish ? finishing() : archiving()).includes(id)) return;
    // Apagada no hay turnos que matar ni árbol que mirar: archivar se aplaza
    // (el relay lo aplica al conectarse) y no se enciende solo para preguntar.
    if (!finish && apagada(id)) {
      await archiveTask(id);
      return;
    }
    marcar(ids => [...ids, id]);
    setActionFailure(null);
    // La pregunta es corta; la fila se queda con la llama encendida mientras
    // vuelve. Sacarla antes obligaría a devolverla, y el cohete despegaría por
    // una tarea que todavía tiene algo en el camino.
    let blockers: Blockers;
    try {
      blockers = await getTaskBlockers(projectOfId(id), id, finish, enSuMaquina(id));
    } catch (error) {
      setActionFailure({ action: finish ? "finish" : "archive", error, retry: () => void intentar(id, finish, rect) });
      return;
    } finally {
      marcar(ids => ids.filter(value => value !== id));
    }
    if (blockers.unsaved.length === 0 && !blockers.not_finished) {
      await (finish && rect ? finishTask(id, rect) : archiveTask(id));
      return;
    }
    setAviso({ id, finish, rect, blockers });
  };
  const descartarYSeguir = async () => {
    const a = aviso();
    if (!a) return;
    setAviso(null);
    const marcar = a.finish ? setFinishing : setArchiving;
    marcar(ids => [...ids, a.id]);
    try {
      for (const work of a.blockers.unsaved) {
        await discardTaskChanges(work.project ?? projectOfId(a.id), work.session, work.files, enSuMaquina(a.id));
      }
    } catch (error) {
      setActionFailure({ action: "discard", error, retry: () => void intentar(a.id, a.finish, a.rect) });
      return;
    } finally {
      marcar(ids => ids.filter(value => value !== a.id));
    }
    // Se vuelve a mirar: lo que apareció mientras el aviso estaba abierto se
    // queda en disco, y tiene que verse en el aviso y no en un error plegado.
    // La fila sigue ahí: el cohete sale del botón de ahora y no de donde
    // estaba cuando se abrió el aviso.
    const boton = document.querySelector<HTMLElement>(`[data-sesion="${a.id}"] [data-session-finish]`);
    await intentar(a.id, a.finish, boton?.getBoundingClientRect() ?? a.rect);
  };
  // La barra enseña solo lo vivo: las archivadas no se pintan ni se observan. Con
  // cientos archivadas, pedir su git y su historial en cada barrido trababa la ventana.
  // En la barra no se anidan subtareas: se consultan desde la vista de subtareas
  // del chat. Solo asoman, sueltas, al buscar o si las fijaron.
  const enBarra = createMemo(() => props.sessions.filter(s => (props.includeArchived || (!s.archived && !saliendo().has(s.id)))
    && (!props.sidebar || !!props.search?.trim() || s.pinned || !isSubtask(s))));
  // Un observador de git, de perfiles y de historiales por carpeta de la
  // lista: las cachés son por carpeta y se comparten con las demás vistas.
  const carpetasVistas = createMemo(
    () => props.projectOf ? [...new Set(enBarra().map(projectOf))].sort() : [props.de],
    [],
    { equals: (a, b) => a.length === b.length && a.every((x, i) => x === b[i]) },
  );
  const porCarpeta = createMemo(mapArray(carpetasVistas, (project) => {
    const filas = createMemo(() => props.projectOf ? enBarra().filter((s) => projectOf(s) === project) : enBarra());
    const watcher = watchSessionGit(project);
    const gitInput = createMemo(() => JSON.stringify([
      filas().map(s => [s.id, s.updated_at]), props.vivas, props.current,
    ]));
    createEffect(on(gitInput, () => {
      if (props.gitManaged) return;
      watcher.prioritize([...(props.current ? [props.current] : []), ...props.vivas, ...filas().map(s => s.id)]);
      watcher.refresh();
    }));
    onCleanup(watcher.release);
    const [historiales] = createTaskHistories<EstadoDelWorktree>(() => project, filas);
    return { git: watcher.rows, profiles: watchProfiles(project), historiales };
  }));
  // Con una sola carpeta se devuelve su registro tal cual: un objeto nuevo
  // repintaría todas las filas aunque git no hubiera cambiado.
  const gitRows = createMemo<Record<string, GitStatus>>(() => {
    const todas = porCarpeta();
    return todas.length === 1 ? todas[0].git() : Object.assign({}, ...todas.map((c) => c.git()));
  });
  // Borrar se lleva la carpeta de trabajo entera, y esos documentos no están
  // commiteados en ningún lado: no tienen de dónde volver. Por eso la
  // confirmación vive en la propia fila, con lo que se pierde escrito.
  const [confirmando, setConfirmando] = createSignal<string | null>(null);
  // El menú va por portal: escapa del recorte deliberado del sidebar, y con
  // veinte proyectos la lista de destinos no desplaza lo que hay debajo.
  const [menu, setMenu] = createSignal<string | null>(null);
  // Qué tarea se está renombrando, y con qué borrador. **El campo sustituye al
  // título en su propia fila** en vez de abrir un diálogo: lo que se está
  // corrigiendo es lo que se lee ahí, y sacarlo a una hoja aparte lo separa de
  // las filas de al lado, que son con las que uno lo distingue.
  const [renombrando, setRenombrando] = createSignal<string | null>(null);
  const [borrador, setBorrador] = createSignal("");

  const empezarARenombrar = (s: SessionRow) => {
    setMenu(null);
    setConfirmando(null);
    setBorrador(s.title);
    setRenombrando(s.id);
  };

  /**
   * El árbol: las raíces en el orden que ya traen —las más nuevas primero, por
   * cuándo nacieron— y las hijas de cada una anidadas debajo.
   *
   * **El orden lo fija `sessions::list_live_sessions` y aquí no se toca.** Iba por
   * última actividad, y eso hacía que una tarea saltara de sitio cada vez que
   * su agente escribía un delta —la suya o la de cualquier otra que estuviera
   * contestando—: la lista se barajaba bajo el puntero. Qué está pasando ahora
   * lo dice `EstadoDeTarea`, que no mueve ninguna fila.
   *
   * Activas y archivadas se arman cada una por el `archived` de la fila, no
   * por el de su raíz: finalizar una hija no espera al padre.
   */
  const profiles = createMemo<ReturnType<ReturnType<typeof watchProfiles>>>(() => {
    const todas = porCarpeta();
    return todas.length === 1 ? todas[0].profiles() : Object.assign({}, ...todas.map((c) => c.profiles()));
  });
  const query = createMemo(() => (props.search ?? "").trim());
  const matchedSessions = createMemo(() => enBarra().filter(session => {
    if (props.matchingIds && !props.matchingIds.includes(taskIdentity(session))) return false;
    if (!query()) return true;
    const git = effectiveTaskGit(session, gitRows(), props.relatedSessions ?? props.sessions);
    const agente = session.agent ? displayName(session.agent, profiles()[session.agent]) : null;
    return matchesTaskQuery([session.title, session.last_message, git?.branch, git?.alias, agente, props.carpetaDe?.(session)], query());
  }));
  const filteredSessions = createMemo(() => props.sidebar ? matchedSessions() : withTaskAncestors(enBarra(), matchedSessions()));
  const matchIds = createMemo(() => new Set(matchedSessions().map(taskIdentity)));
  const contextual = (row: SessionRow) => !matchIds().has(taskIdentity(row));
  const [expansionOverrides, setExpansionOverrides] = createSignal<Record<string, boolean>>({});
  const expansionContext = createMemo(() => JSON.stringify([
    query(), props.matchingIds ? [...props.matchingIds].sort() : null, props.current,
    enBarra().filter(row => row.pinned).map(taskIdentity).sort(),
  ]));
  createEffect(on(expansionContext, () => setExpansionOverrides({})));
  const temporaryExpansion = createMemo(() => {
    const targets = query() || props.matchingIds ? matchedSessions() : enBarra().filter(row => row.pinned || row.id === props.current);
    const ancestors = new Set<string>();
    const visit = (branches: RamaDeTareas<SessionRow>[]) => {
      for (const branch of branches) {
        if (branch.hijas.length) ancestors.add(taskIdentity(branch.tarea));
        visit(branch.hijas);
      }
    };
    visit(buildTaskTree(withTaskAncestors(enBarra(), targets)));
    return ancestors;
  });
  if (props.onSearchResults) {
    createEffect(() => props.onSearchResults?.(matchedSessions().length));
    onCleanup(() => props.onSearchResults?.(0));
  }
  const activas = createMemo<RamaDeTareas<SessionRow>[]>((previas) => props.flat || props.sidebar
    ? filteredSessions().map(tarea => ({ tarea, hijas: [] }))
    : taskTree(filteredSessions(), props.includeArchived ? null : false, previas, props.groupByHandler === true));
  const hayMaquinas = createMemo(() => machines().length > 1);
  const hideFolder = (row: SessionRow) => props.hideFolder && (props.folderGroup === undefined || projectOf(row) === props.folderGroup);
  const destinosDe = (row: SessionRow) => props.destinosDe?.(row) ?? props.destinos;
  const fijada = (row: SessionRow) => row.pinned ?? (row.chat_de_agente || row.inbox === true);
  const setPinned = async (row: SessionRow) => {
    if (!props.onPin) return;
    setMenu(null);
    setActionFailure(null);
    try {
      await props.onPin(row.id, !fijada(row));
      avisarCambio(projectOf(row));
    } catch (error) {
      setActionFailure({ action: "pin", error, retry: () => void setPinned(row) });
    }
  };

  /**
   * Una fila del historial, y **nada más que la fila**.
   *
   * No conoce a sus hijas: el expansor es la fila de resumen que dibuja el
   * árbol, así que aquí no hace falta saber si esta tarea tiene encargos — y una
   * fila que no las conoce no puede volver a reservarles sitio.
   */
  const gitDe = (row: SessionRow) => effectiveTaskGit(row, gitRows(), props.relatedSessions ?? props.sessions);
  return { tarjetaDelRiel, projectOf, otherSpaces, finishing, archiving, actionFailure, setActionFailure, aviso, setAviso, intentar, descartarYSeguir, gitRows, confirmando, setConfirmando, menu, setMenu, renombrando, setRenombrando, borrador, setBorrador, empezarARenombrar, profiles, query, matchedSessions, contextual, expansionOverrides, setExpansionOverrides, temporaryExpansion, activas, hayMaquinas, hideFolder, destinosDe, fijada, setPinned, gitDe, machines, canBringHere, bringHereLabel };
}

export type SessionsState = ReturnType<typeof createSessionsState>;
