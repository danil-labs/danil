import { workStateOf } from "@terminus/tasks";
import { createEffect, createMemo, mapArray, on, onCleanup } from "solid-js";
import { recordarCarpetas } from "../../../../apps/desktop/src/lib/folderKinds";
import { createPref } from "../../../../apps/desktop/src/lib/prefs";
import { effectiveTaskGit, watchSessionGit } from "../../../features/projects/src/queries/taskGit";
import {
  applySidebarView,
  setSidebarView,
  sidebarView,
  type SidebarGroup,
  type SidebarView,
} from "../../../../apps/desktop/src/lib/sidebarView";
import { flattenTasks, folderCounts } from "./sidebarTasks";
import { machineName, machines } from "../../../features/machines/src/queries/store";
import type { SessionRow, SidebarProps } from "./sidebar-rows";

/** Las tareas del riel: sus carpetas, su vista y los grupos que se pintan. */
export function createTareasDelRiel(props: SidebarProps) {
  // Los grupos por carpeta plegados; la clave es la de siempre para no perder
  // lo que alguien ya había plegado. El de otra máquina, partido, lleva la suya
  // (`id@máquina`): plegar «Terminus · vm-principal» no pliega el de esta.
  const [cerrados, setCerrados] = createPref<string[]>("historial.cerrados", []);
  const alternarGrupo = (p: string) =>
    setCerrados(
      cerrados().includes(p)
        ? cerrados().filter((x) => x !== p)
        : [...cerrados(), p],
    );
  // Cada espacio guarda su vista: cambiar de espacio relee la suya.
  const vista = () => sidebarView(props.viewKey);
  const cambiarVista = (siguiente: SidebarView) => setSidebarView(props.viewKey, siguiente);

  createEffect(() => recordarCarpetas(props.projects));

  /** De qué carpeta es cada tarea, por id: las acciones de la fila llegan con el id. */
  const carpetaDeTarea = createMemo(() => {
    const mapa = new Map<string, string>();
    for (const [project, rows] of Object.entries(props.sessions)) for (const row of rows) if (!mapa.get(row.id)) mapa.set(row.id, project);
    return mapa;
  });
  const carpetaDe = (id: string) => carpetaDeTarea().get(id) ?? "";
  const nombreDe = (project: string) => props.projects.find((p) => p.id === project)?.name;
  const relacionadas = createMemo(() => Object.values(props.sessions).flat());

  const todas = createMemo(() => flattenTasks(props.sessions));
  const cuentas = createMemo(() => folderCounts(todas()));
  // La de esta computadora, con el nombre que le da la cuenta, como su tarjeta flotante.
  const nombreDeMaquina = (id: string) => {
    const aqui = id ? undefined : machines().find((m) => m.local);
    return id ? machineName(id) : aqui ? machineName(aqui.id) : "";
  };
  const variasMaquinas = () => machines().length > 1 || todas().some((x) => !!x.row.machine);
  /**
   * La vista que se aplica: de las carpetas elegidas, las que siguen teniendo
   * tareas. Si ninguna sigue, son todas: un filtro que deja la lista vacía sin
   * decir por qué parece que se borró el trabajo.
   */
  const vistaEfectiva = createMemo<SidebarView>(() => {
    const v = vista();
    const carpetas = v.folders.filter((f) => (cuentas().get(f) ?? 0) > 0);
    return carpetas.length === v.folders.length ? v : { ...v, folders: carpetas };
  });
  const gitCandidates = createMemo(() => applySidebarView(todas().map(task => task.row), { ...vistaEfectiva(), group: "none" }, {
    live: [], approving: [], folderOf: row => carpetaDe(row.id),
  })[0].tasks);
  const gitFolders = createMemo(() => [...new Set(gitCandidates().map(row => carpetaDe(row.id)))].sort(), [], {
    equals: (a, b) => a.length === b.length && a.every((project, i) => project === b[i]),
  });
  const gitObservers = createMemo(mapArray(gitFolders, project => {
    const watcher = watchSessionGit(project);
    const input = createMemo(() => JSON.stringify([
      gitCandidates().filter(row => carpetaDe(row.id) === project).map(row => [row.id, row.updated_at]), props.vivas, props.current,
    ]));
    createEffect(on(input, () => {
      watcher.prioritize([...(props.current ? [props.current] : []), ...props.vivas,
        ...gitCandidates().filter(row => carpetaDe(row.id) === project).map(row => row.id)]);
      watcher.refresh();
    }));
    onCleanup(watcher.release);
    return { project, rows: watcher.rows };
  }));
  const grupos = createMemo(() => {
    const todosLosGrupos = applySidebarView(todas().map((x) => x.row), vistaEfectiva(), {
      live: props.vivas,
      approving: props.aprobando,
      folderOf: (row) => carpetaDe(row.id),
      workStateOf: (row) => {
        const project = carpetaDe(row.id);
        const candidates = relacionadas().filter(other => carpetaDe(other.id) === project
          && (other.machine ?? "") === (row.machine ?? ""));
        const rows = gitObservers().find(observer => observer.project === project)?.rows() ?? {};
        return workStateOf(effectiveTaskGit(row, rows, candidates));
      },
    });
    // Por carpeta, en el orden del riel (la principal primero) y «sin carpeta» al final.
    const orden = (g: SidebarGroup<SessionRow>) => {
      if (g.kind !== "folder") return Number.MAX_SAFE_INTEGER;
      const i = props.projects.findIndex((p) => p.id === g.key);
      return i === -1 ? props.projects.length : i;
    };
    if (vistaEfectiva().group !== "folder") return todosLosGrupos;
    // Por carpeta, una sin tareas también es grupo, con su «+»: la recién agregada no puede faltar.
    const elegidas = vista().folders;
    const vacias = props.projects
      .filter((p) => (cuentas().get(p.id) ?? 0) === 0 && (elegidas.length === 0 || elegidas.includes(p.id)))
      .map((p): SidebarGroup<SessionRow> => ({ kind: "folder", key: p.id, tasks: [] }));
    return [...todosLosGrupos, ...vacias].map((g, i) => ({ g, i })).sort((a, b) => orden(a.g) - orden(b.g) || a.i - b.i).map(({ g }) => g);
  });
  const hayCarpetasVacias = () => grupos().some((g) => g.kind === "folder" && g.key && g.tasks.length === 0);
  const carpetasDelFiltro = createMemo(() => props.projects
    .filter((p) => (cuentas().get(p.id) ?? 0) > 0)
    .map((p) => ({ id: p.id, name: p.name, count: cuentas().get(p.id) ?? 0 })));

  return {
    cerrados, setCerrados, alternarGrupo, vista, cambiarVista, carpetaDe, nombreDe, relacionadas, todas,
    nombreDeMaquina, variasMaquinas, vistaEfectiva, grupos, hayCarpetasVacias, carpetasDelFiltro,
  };
}

export type TareasDelRiel = ReturnType<typeof createTareasDelRiel>;
