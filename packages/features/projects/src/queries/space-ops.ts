import { createSignal, type Accessor, type Setter } from "solid-js";
import { invoke } from "../../../../engine-client/src/client.ts";
import { prosaDe } from "../../../../ui/src/Failure.tsx";
import { t } from "../../../../../apps/desktop/src/lib/i18n.ts";
import { spaceName, type Space } from "../../../../ui/src/lib/spaces.ts";
import { deleteStoredStrip, storedStrip } from "../../../../../apps/desktop/src/lib/tabs.ts";
import type { SearchFilter } from "../../../../ui/src/lib/project-block-types.ts";

/** Lo que las acciones sobre espacios usan del estado de la ventana. */
export type SpaceOpsDeps = { abrirSesion: (proyecto: string, id: string, activar?: string, propagateError?: boolean) => Promise<void>; activeSpace: Accessor<Space | null>; cambiarEscritorio: (id: string, restaurarActiva?: boolean) => void; deLaTarea: (id: string | null | undefined) => { headers: { "x-terminus-machine": string } } | undefined; escritorio: Accessor<string | null>; grupos: Accessor<string[]>; machineOf: (id: string | null | undefined) => { headers: { "x-terminus-machine": string } } | undefined; refreshSessions: (proyectos: string[]) => Promise<void>; reloadSpaces: () => Promise<void>; setBuscando: Setter<SearchFilter | null>; setError: Setter<string | null>; setSpaces: Setter<Space[]>; soltarPestanaGuardada: (id: string) => void; spaces: Accessor<Space[]>; workspaceActivo: Accessor<string | null>; catalog?: { create(space: Space): Promise<void>; rename(id: string, name: string): Promise<boolean>; remove(id: string): Promise<void> }; };

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
    const nueva = await invoke<Space>("create_space", { name, folders });
    setSpaces((lista) => [...lista.filter((i) => i.id !== nueva.id), nueva]);
    cambiarEscritorio(nueva.id);
    void catalog?.create(nueva);
  }

  async function renameSpace(id: string, name: string) {
    try {
      const savedInCatalog = (await catalog?.rename(id, name)) ?? false;
      try {
        replaceSpace(await invoke<Space>("rename_space", { id, name }, machineOf(id)));
      } catch (e) {
        if (!savedInCatalog) throw e;
      }
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  async function updateSpaceFolders(id: string, folders: string[]) {
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
      // A la máquina de la tarea: el router comparte antes con la cuenta el
      // space de esta ventana y allá se crea con el mismo id.
      // Con la máquina de la tarea apagada el relay lo aplaza y no hay respuesta del motor: el space es el pedido.
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

  /** Borrada: sale de la barra, su tira se olvida y el aviso abre sus archivadas en el buscador. */
  function spaceDeleted(i: Space, archivadas: number) {
    const ws = workspaceActivo();
    setDeletingSpace(null);
    if (!ws) return;
    const quedan = spaces().filter((x) => x.id !== i.id);
    if (escritorio() === i.id && quedan[0]) cambiarEscritorio(quedan[0].id);
    setSpaces(quedan);
    for (const p of storedStrip(ws, i.id)) soltarPestanaGuardada(p.id);
    deleteStoredStrip(ws, i.id);
    window.dispatchEvent(new CustomEvent("harness:tasks-changed"));
    void catalog?.remove(i.id);
    void reloadSpaces();
    setAviso({
      texto: t("spaces.delete.toast", { name: spaceName(i), count: archivadas }),
      boton: t("spaces.delete.see_archived"),
      ir: () => setBuscando("archived"),
    });
  }
  return { aviso, setAviso, deletingSpace, setDeletingSpace, createSpace, renameSpace, removeFromActiveSpace, moveToSpace, spaceDeleted };
}
