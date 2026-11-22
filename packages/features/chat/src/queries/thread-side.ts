type Sidebar = any;
import { carpetaDeTrabajo } from "../../../../../apps/desktop/src/lib/model";
import { type Project } from "../../../../../apps/desktop/src/lib/model.ts";
import { listen } from "../../../../../apps/desktop/src/lib/serviceEvents";
import { accionDeAtajo, navegacionDePestanas, ventanaVecina } from "../../../../../apps/desktop/src/lib/shortcuts";
import { type NavegacionDePestanas } from "../../../../../apps/desktop/src/lib/shortcuts.ts";
import { type TaskFilesPanel, type TaskFilesSide, type TaskSideMode } from "../../../../../apps/desktop/src/lib/taskFiles.ts";
import { capabilities } from "../../../../host/src/platform";
import { type ActivityEvent } from "@terminus/protocol";
import { createEffect, createSignal, on, onCleanup, onMount, type Accessor, type Setter } from "solid-js";

type InicioDeCarpeta = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type SearchFilter = any; // pendiente: el tipo llega del shell

/** Lo que el bloque usaba del cuerpo de App. */
export type ThreadSideDeps = { createSidebar: () => Sidebar; alta: Accessor<boolean>; archivosDeTarea: { panel: (task: string) => TaskFilesPanel; setOpen: (task: string, open: boolean) => void; present: (task: string, mode: TaskSideMode) => void; toggle: (task: string) => void; setExpanded: (task: string, expanded: boolean) => void; setTree: (task: string, tree: boolean) => void; setSide: (task: string, side: TaskFilesSide) => void; open: (task: string, file: { tree: string; path: string; changes: boolean; changed?: boolean; pinned?: boolean; }) => void; pin: (task: string, id: string) => void; activate: (task: string, id: string) => void; setDirty: (task: string, id: string, dirty: boolean) => void; close: (task: string, ids: string[]) => string[]; renamed: (task: string, tree: string, from: string, to: string) => void; removed: (task: string, tree: string, path: string) => void; dirtyOf: (task: string) => string[]; forget: (task: string) => void; }; closeActiveTab: () => void; irAPestanaDe: (nav: NavegacionDePestanas) => void; irAVentanaVecina: (salto: 1 | -1) => void; juntarLaActiva: () => void; llaveDeBorrador: (proyecto: string | undefined) => string; nuevaSesion: (enProyecto?: string) => void; partirLaActiva: () => void; project: Accessor<string>; projectList: Accessor<Project[]>; reabrirPestana: () => void; sessionId: Accessor<string | null>; setBuscando: Setter<SearchFilter | null>; workspaceActivo: Accessor<string | null> };

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
  const [activityMachine, setActivityMachine] = createSignal<string | null>(null);
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
  return { activityMachine, activityNotice, anadiendoCarpeta, carpetaDelProyecto, inicioDeCarpeta, setActivityMachine, setActivityNotice, setAnadiendoCarpeta, setInicioDeCarpeta, setSettings, settings, sidebar };
}
