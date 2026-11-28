import { createEffect, createMemo, createSignal, mapArray, onCleanup } from "solid-js";
import { watchRoster } from "../../../ui/src/lib/handlerRoster.ts";
import { callShellEngine } from "../../../session/src/shell-queries.ts";
import type { AgentProfile, HandlerList, HandlerStatus } from "../../../ui/src/lib/model";
import { watchHandlerStatuses } from "../../../features/projects/src/queries/handlerPresence";
import { notifyProfiles, watchProfiles } from "../../../features/projects/src/queries/profiles";
import { agentOptions } from "../../../ui/src/lib/sidebarView";
import { type DockAgent } from "./dockLayout";
import type { SidebarFilterProps } from "./SidebarFilter";
import type { SidebarProps } from "./sidebar-rows";
import type { TareasDelRiel } from "./sidebar-groups";

/** Cada cuánto se vuelven a pedir los agentes con la ventana a la vista. */
const RELECTURA_DE_AGENTES_MS = 10_000;

/** Los agentes del dock y el filtro del riel que la franja personaliza. */
export function createDockDelRiel(props: SidebarProps, tareas: TareasDelRiel) {
  const { carpetaDe, nombreDe, todas, vistaEfectiva, cambiarVista, carpetasDelFiltro, variasMaquinas } = tareas;
  /** La carpeta activa solo decide dónde abrir el chat, no qué agentes mostrar. */
  const carpetaActual = () => (props.current ? carpetaDe(props.current) : props.proyectoAbierto ?? props.carpetaDelBorrador) || null;
  const carpetasConTareas = createMemo(() => {
    const sources = new Set<string>(["\n"]);
    for (const project of props.projects) sources.add(`${project.id}\n`);
    for (const { project, row } of todas()) {
      sources.add(`${project}\n${row.machine ?? ""}`);
      sources.add(`\n${row.machine ?? ""}`);
    }
    return [...sources];
  }, [], { equals: (a, b) => a.length === b.length && a.every((x, i) => x === b[i]) });
  const [altas, setAltas] = createSignal(0);
  // Hasta la primera respuesta del motor, un dock vacío es «cargando», no «sin agentes».
  // Listo es que TODAS las carpetas ya tienen su lista a la vista. Lo decide el
  // propio recurso y no un aviso dentro de la carga: ese llegaba un instante
  // antes que la lista, y el dock decía «sin agentes» con los agentes en camino.
  // Sin plazo: `invoke` espera al motor, y una carpeta que falla resuelve igual.
  const rosterListo = () => {
    const carpetas = porCarpeta();
    return carpetas.every((c) => c.roster.ready());
  };
  const alCrearAgente = () => setAltas((n) => n + 1);
  window.addEventListener("harness:encargados", alCrearAgente);
  onCleanup(() => window.removeEventListener("harness:encargados", alCrearAgente));
  // Un agente escrito a mano en `.agents/agents/` (o traído con un `git pull`)
  // no avisa a la ventana: con ella a la vista, la lista se vuelve a pedir sola.
  const relectura = setInterval(() => {
    if (document.visibilityState === "visible") alCrearAgente();
  }, RELECTURA_DE_AGENTES_MS);
  onCleanup(() => clearInterval(relectura));
  const porCarpeta = createMemo(mapArray(carpetasConTareas, (clave) => {
    const [project, machine] = clave.split("\n");
    const roster = watchRoster(
      machine ? `${project}@${machine}` : project,
      async () => {
        const { agents } = await callShellEngine<HandlerList>("list_agents", { project }, machine ? { headers: { "x-terminus-machine": machine } } : undefined);
        return project ? agents : agents.filter((agent) => agent.own_scope?.kind === "workspace");
      },
      altas,
    );
    return {
      project,
      roster,
      estados: watchHandlerStatuses(project),
      perfiles: watchProfiles(project),
    };
  }));
  const RANGO: Record<HandlerStatus, number> = { working: 2, awake: 1, asleep: 0 };
  const agentesDelDock = createMemo<DockAgent[]>(() => {
    const juntos = new Map<string, DockAgent>();
    for (const c of porCarpeta()) {
      const estados = new Map(c.estados().map((r) => [r.name, r] as const));
      for (const a of c.roster()) {
        const fila = estados.get(a.name);
        const antes = juntos.get(a.name);
        const status = fila?.status;
        juntos.set(a.name, {
          name: a.name,
          description: a.description?.trim() || antes?.description,
          status: !antes?.status || (status && RANGO[status] > RANGO[antes.status]) ? status ?? antes?.status : antes.status,
          liveTasks: (antes?.liveTasks ?? 0) + (fila?.live_tasks ?? 0),
          minutesSinceLastTurn: fila?.minutes_since_last_turn ?? antes?.minutesSinceLastTurn ?? null,
        });
      }
    }
    return [...juntos.values()];
  });
  // Un agente que llegó por su cuenta —el paquete Business, un `git pull`— trae
  // su nombre visible y su cara en el perfil. La lista se relee sola cada 10 s,
  // los perfiles no: sin esto se pintaba con la cara de omisión hasta recargar.
  let nombresConocidos: string | null = null;
  createEffect(() => {
    const nombres = agentesDelDock().map((a) => a.name).sort().join("\n");
    if (nombresConocidos !== null && nombres !== nombresConocidos) notifyProfiles();
    nombresConocidos = nombres;
  });
  const perfilDe = (name: string): AgentProfile | undefined => {
    for (const c of porCarpeta()) {
      const perfil = c.perfiles()[name];
      if (perfil) return perfil;
    }
    return undefined;
  };
  /** Carpetas donde está el agente, en el orden del riel. */
  const carpetasDelAgente = (name: string) => {
    const orden = (id: string) => { const i = props.projects.findIndex((p) => p.id === id); return i === -1 ? props.projects.length : i; };
    return porCarpeta()
      .filter((c) => c.roster().some((a) => a.name === name))
      .map((c) => c.project)
      .filter((id, i, ids) => ids.indexOf(id) === i)
      .map((id) => ({ id, name: nombreDe(id) ?? id }))
      .sort((a, b) => orden(a.id) - orden(b.id));
  };
  const agentesDelFiltro = createMemo(() =>
    agentOptions(agentesDelDock().map((a) => a.name), todas().map((x) => x.row))
      .map((a) => ({ ...a, body: perfilDe(a.name)?.body, avatar: perfilDe(a.name)?.avatar })));
  const filtro: SidebarFilterProps = {
    get view() { return vistaEfectiva(); },
    onChange: cambiarVista,
    get folders() { return carpetasDelFiltro(); },
    get agents() { return agentesDelFiltro(); },
    get machines() { return variasMaquinas(); },
  };

  return { carpetaActual, agentesDelDock, carpetasDelAgente, rosterListo, perfilDe, filtro };
}
