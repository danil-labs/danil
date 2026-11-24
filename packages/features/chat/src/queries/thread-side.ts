import { carpetaDeTrabajo } from "../../../../../apps/desktop/src/lib/model";
import { type Project } from "../../../../../apps/desktop/src/lib/model.ts";
import { listen } from "../../../../host/src/serviceEvents.ts";
import { accionDeAtajo, navegacionDePestanas, ventanaVecina } from "../../../../ui/src/lib/shortcuts";
import { type NavegacionDePestanas } from "../../../../ui/src/lib/shortcuts.ts";
import { capabilities } from "../../../../host/src/platform";
import { type ActivityEvent } from "../../../../engine-client/src/index.ts";
import { createEffect, createSignal, on, onCleanup, onMount, type Accessor, type Setter } from "solid-js";
import type { CreateSidebarPort, InicioDeCarpeta, SearchFilter } from "./types.ts";
import type { createTaskFiles } from "../../../../../apps/desktop/src/lib/taskFiles.ts";


/** Lo que el bloque usaba del cuerpo de App. */
export type ThreadSideDeps = { createSidebar: CreateSidebarPort; alta: Accessor<boolean>; archivosDeTarea: ReturnType<typeof createTaskFiles>; closeActiveTab: () => void;
  irAPestanaDe: (nav: NavegacionDePestanas) => void; irAVentanaVecina: (salto: 1 | -1) => void; juntarLaActiva: () => void; llaveDeBorrador: (proyecto: string | undefined) => string;
  nuevaSesion: (enProyecto?: string) => void; partirLaActiva: () => void; project: Accessor<string>; projectList: Accessor<Project[]>; reabrirPestana: () => void; sessionId: Accessor<string | null>;
  setBuscando: Setter<SearchFilter | null>; workspaceActivo: Accessor<string | null>; };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 1451–1516, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createThreadSide(deps: ThreadSideDeps) {
  const { createSidebar, alta, archivosDeTarea, closeActiveTab, irAPestanaDe, irAVentanaVecina, juntarLaActiva, llaveDeBorrador, nuevaSesion, partirLaActiva, project, projectList, reabrirPestana, sessionId, setBuscando, workspaceActivo } = deps;
  const sidebar = createSidebar();
  const carpetaDelProyecto = () =>
    carpetaDeTrabajo(projectList().find((p) => p.id === project()) ?? {});
  // Los archivos viven dentro de la tarea (`archivosDeTarea`); sin tarea no hay nada que enseñar.
  const alternarElArbol = () => {
    const id = sessionId() ?? (carpetaDelProyecto() ? llaveDeBorrador(project()) : "");
    if (id) archivosDeTarea.toggle(id);
  };

  onMount(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.metaKey || e.ctrlKey)) return;
      if (settings() !== null || alta()) return;
      const accion = accionDeAtajo(e);
      if (accion) {
        e.preventDefault();
        if (accion === "newTask") nuevaSesion();
        else if (accion === "closeTab") closeActiveTab();
        else if (accion === "reopenTab") reabrirPestana();
        else if (accion === "sidebar") sidebar.alternar();
        else if (accion === "search") setBuscando((b) => (b === null ? "all" : null));
        else alternarElArbol();
        return;
      }
      const nav = navegacionDePestanas(e);
      if (nav) {
        e.preventDefault();
        irAPestanaDe(nav);
        return;
      }
      const salto = ventanaVecina(e);
      if (salto) {
        e.preventDefault();
        irAVentanaVecina(salto);
        return;
      }
      if (e.altKey || (e.key.toLowerCase() !== "d" && e.code !== "Backslash")) return;
      e.preventDefault();
      if (e.shiftKey) juntarLaActiva();
      else partirLaActiva();
    };
    window.addEventListener("keydown", alTeclear);
    onCleanup(() => window.removeEventListener("keydown", alTeclear));
  });

  // `null` = cerrada. Una cadena es además con qué destino abrirla.
  const [settings, setSettings] = createSignal<string | null>(capabilities().initialSettings ?? null);
  const [activityNotice, setActivityNotice] = createSignal<ActivityEvent | null>(null);
  onMount(() => {
    const states = new Map<string, ActivityEvent["state"]>();
    const events = listen<ActivityEvent>("activity", event => {
      const row = event.payload;
      if (row?.workspace !== workspaceActivo() || typeof row.id !== "string" || typeof row.title !== "string" || !["running", "success", "failure", "interrupted"].includes(row.state)) return;
      const key = JSON.stringify([row.workspace, row.machine, row.id]);
      if (states.get(key) === row.state) return;
      states.set(key, row.state);
      if (states.size > 256) states.delete(states.keys().next().value!);
      if (row.state === "failure" || row.state === "interrupted") setActivityNotice(row);
    });
    onCleanup(() => { void events.then(off => off()); });
  });
  createEffect(on(workspaceActivo, () => setActivityNotice(null)));

  const [anadiendoCarpeta, setAnadiendoCarpeta] = createSignal(false);
  const [inicioDeCarpeta, setInicioDeCarpeta] = createSignal<InicioDeCarpeta | null>(null);
  return { activityNotice, anadiendoCarpeta, carpetaDelProyecto, inicioDeCarpeta, setActivityNotice, setAnadiendoCarpeta, setInicioDeCarpeta, setSettings, settings, sidebar };
}
