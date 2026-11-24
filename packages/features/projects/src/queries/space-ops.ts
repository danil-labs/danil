import { createSignal, type Accessor, type Setter } from "solid-js";
import { invoke } from "../../../../engine-client/src/client.ts";
import { prosaDe } from "../../../../ui/src/Failure.tsx";
import { t } from "../../../../ui/src/lib/i18n.ts";
import { spaceName, type Space } from "../../../../ui/src/lib/spaces.ts";
import { deleteStoredStrip, storedStrip } from "../../../../ui/src/lib/tabs.ts";
import type { SearchFilter } from "../../../../ui/src/lib/project-block-types.ts";

export type SpaceOpsCatalog = {
  isManaged(): boolean;
  createSpace(name: string, folders: string[], seedRows?: readonly Space[]): Promise<Space | null>;
  rename(id: string, name: string): Promise<boolean>;
  setFolders(id: string, folders: string[]): Promise<boolean>;
  remove(id: string): Promise<{ ungrouped: number } | null>;
  assignTask(taskId: string, spaceId: string | null): Promise<boolean>;
};

/** Lo que las acciones sobre espacios usan del estado de la ventana. */
export type SpaceOpsDeps = { abrirSesion: (proyecto: string, id: string, activar?: string, propagateError?: boolean) => Promise<void>; activeSpace: Accessor<Space | null>; cambiarEscritorio: (id: string, restaurarActiva?: boolean) => void; deLaTarea: (id: string | null | undefined) => { headers: { "x-terminus-machine": string } } | undefined; escritorio: Accessor<string | null>; grupos: Accessor<string[]>; machineOf: (id: string | null | undefined) => { headers: { "x-terminus-machine": string } } | undefined; refreshSessions: (proyectos: string[]) => Promise<void>; reloadSpaces: () => Promise<void>; setBuscando: Setter<SearchFilter | null>; setError: Setter<string | null>; setSpaces: Setter<Space[]>; soltarPestanaGuardada: (id: string) => void; spaces: Accessor<Space[]>; workspaceActivo: Accessor<string | null>; catalog?: SpaceOpsCatalog };

/** Crear, renombrar, mover y borrar espacios, con el aviso de lo que acaba de pasar. */
export function createSpaceOps(deps: SpaceOpsDeps) {
  const abrirSesion = (...a: Parameters<SpaceOpsDeps["abrirSesion"]>) => deps.abrirSesion(...a);
  const refreshSessions = (...a: Parameters<SpaceOpsDeps["refreshSessions"]>) => deps.refreshSessions(...a);
  const { activeSpace, cambiarEscritorio, catalog, deLaTarea, escritorio, grupos, machineOf, reloadSpaces, setBuscando, setError, setSpaces, soltarPestanaGuardada, spaces, workspaceActivo } = deps;

  /** El aviso de lo que un gesto sobre espacios acaba de hacer, con su «Ir». */
  const [aviso, setAviso] = createSignal<{ texto: string; boton?: string; ir?: () => void } | null>(null);
  const [deletingSpace, setDeletingSpace] = createSignal<string | null>(null);
  const replaceSpace = (i: Space) =>
    setSpaces((lista) => lista.map((x) => (x.id === i.id ? i : x)));

  async function createSpace(name: string, folders: string[]) {
    if (catalog?.isManaged()) {
      const nueva = await catalog.createSpace(name, folders, spaces());
      if (nueva) {
        cambiarEscritorio(nueva.id);
        return;
      }
    }
    const nueva = await invoke<Space>("create_space", { name, folders });
    setSpaces((lista) => [...lista.filter((i) => i.id !== nueva.id), nueva]);
    cambiarEscritorio(nueva.id);
  }

  async function renameSpace(id: string, name: string) {
    try {
      if (catalog?.isManaged()) {
        await catalog.rename(id, name);
        return;
      }
      replaceSpace(await invoke<Space>("rename_space", { id, name }, machineOf(id)));
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  async function updateSpaceFolders(id: string, folders: string[]) {
    if (catalog?.isManaged()) {
      await catalog.setFolders(id, folders);
      return;
    }
    replaceSpace(await invoke<Space>("set_space_folders", { id, folders }, machineOf(id)));
  }

  async function removeFromActiveSpace(folder: string) {
    const i = activeSpace();
    if (!i) return;
    try {
      await updateSpaceFolders(i.id, i.folders.filter((f) => f !== folder));
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  async function moveToSpace(project: string, id: string, space: string) {
    try {
      if (catalog?.isManaged()) {
        const destino = spaces().find((i) => i.id === space) ?? null;
        await catalog.assignTask(id, space);
        setAviso({
          texto: t("spaces.move.toast", { name: spaceName(destino) }),
          boton: t("spaces.toast.go"),
          ir: () => void abrirSesion(project, id),
        });
        return;
      }
      // Sin cuenta gestionada: la máquina de la tarea persiste el movimiento en el motor local.
      const destino = (await invoke<{ id: string; name: string | null } | null>("move_task_to_space", { project, id, space }, deLaTarea(id)))
        ?? spaces().find((i) => i.id === space) ?? null;
      await refreshSessions(grupos());
      setAviso({
        texto: t("spaces.move.toast", { name: spaceName(destino) }),
        boton: t("spaces.toast.go"),
        ir: () => void abrirSesion(project, id),
      });
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  /** Borrada: sale de la barra, su tira se olvida y el aviso refleja si se desagruparon o archivaron tareas. */
  function spaceDeleted(i: Space, count: number, ungrouped = false) {
    const ws = workspaceActivo();
    setDeletingSpace(null);
    if (!ws) return;
    const quedan = spaces().filter((x) => x.id !== i.id);
    if (escritorio() === i.id && quedan[0]) cambiarEscritorio(quedan[0].id);
    if (!ungrouped) setSpaces(quedan);
    for (const p of storedStrip(ws, i.id)) soltarPestanaGuardada(p.id);
    deleteStoredStrip(ws, i.id);
    window.dispatchEvent(new CustomEvent("harness:tasks-changed"));
    if (!ungrouped) {
      void catalog?.remove(i.id).catch(() => {});
      void reloadSpaces();
      setAviso(count > 0
        ? {
          texto: t("spaces.delete.toast", { name: spaceName(i), count }),
          boton: t("spaces.delete.see_archived"),
          ir: () => setBuscando("archived"),
        }
        : { texto: t("spaces.delete.toast_removed", { name: spaceName(i) }) });
      return;
    }
    setAviso({
      texto: count > 0
        ? t("spaces.delete.toast_ungrouped", { name: spaceName(i), count })
        : t("spaces.delete.toast_removed", { name: spaceName(i) }),
    });
  }
  return { aviso, setAviso, deletingSpace, setDeletingSpace, createSpace, renameSpace, removeFromActiveSpace, moveToSpace, spaceDeleted };
}
