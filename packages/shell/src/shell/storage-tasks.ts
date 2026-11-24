import { createMemo } from "solid-js";
import { invoke } from "../../../engine-client/src/client.ts";
import { t } from "../../../ui/src/lib/i18n";
import { peso } from "../../../ui/src/lib/format";
import { conservar } from "../../../session/src/sessionRefresh";
import { prosaDe } from "../../../ui/src/Failure";
import type { Grupo, Liberado, Machine, TareaConPeso, Target } from "./storage-model";
import type { StorageState } from "./storage-state";

/** Las tareas medidas, sus grupos por proyecto y los gestos de vaciar. */
export function createStorageTasks(s: StorageState) {
  const { datos, gruposAbiertos, target, canClean, setOperationPending, setFallo, setLiberado, current, setInventory, openInventory, abierto, destination } = s;
  const tareas = createMemo(() => datos()?.tareas ?? []);
  /** El peso de la tarea más gorda: es la escala de las barras. */
  const tope = createMemo(() =>
    tareas().reduce((n, t) => Math.max(n, t.bytes), 0),
  );

  const grupos = createMemo<Grupo[]>(() => {
    const porProyecto = new Map<string, Grupo>();
    for (const tarea of tareas()) {
      const grupo = porProyecto.get(tarea.project) ?? {
        clave: tarea.project,
        nombre: tarea.proyecto ?? t("shell.storage.no_project"),
        tareas: [],
        bytes: 0,
        recuperable: 0,
      };
      grupo.tareas.push(tarea);
      grupo.bytes += tarea.bytes;
      grupo.recuperable += tarea.recuperable;
      porProyecto.set(tarea.project, grupo);
    }
    return [...porProyecto.values()].sort((a, b) => b.bytes - a.bytes);
  });

  const grupoAbierto = (clave: string) =>
    gruposAbiertos()[clave] ?? clave === grupos()[0]?.clave;

  const cuantasTareas = () =>
    tareas().length + (datos()?.archivadas?.cuantas ?? 0);
  const fraccionRecuperable = () => {
    const total = datos()?.bytes ?? 0;
    return total ? Math.min(1, (datos()?.recuperable ?? 0) / total) : 0;
  };

  async function clean(key: string, perform: (captured: Target) => Promise<Liberado>) {
    const captured = target();
    if (!captured || !canClean()) return;
    setOperationPending(true);
    setFallo((prev) => ({ ...prev, [key]: "" }));
    setLiberado((prev) => ({ ...prev, [key]: "" }));
    try {
      const list = await invoke<Machine[]>("machine_list", {}, {
        headers: { "x-terminus-workspace": captured.workspace },
      });
      if (!current(captured)) return;
      setInventory((previous) => conservar(previous, list, (m) => m.id));
      const ready = list.find((m) => m.id === captured.machine);
      if (!ready?.on || ready.hosts === false) {
        setFallo((prev) => ({ ...prev, [key]: !ready?.on ? t("shell.storage.offline") : t("shell.storage.workspace_missing") }));
        return;
      }
      const result = await perform(captured);
      if (current(captured)) {
        if (result.detalle) setFallo((prev) => ({ ...prev, [key]: result.detalle }));
        setLiberado((prev) => ({ ...prev, [key]: t("shell.storage.removed_logical", { size: peso(result.bytes) }) }));
      }
    } catch (error) {
      if (current(captured)) setFallo((prev) => ({ ...prev, [key]: prosaDe(error) }));
    } finally {
      setOperationPending(false);
      if (current(captured)) {
        await openInventory(captured, false);
      } else if (abierto()) {
        void openInventory();
      }
    }
  }

  async function vaciar(tarea: TareaConPeso, rutas: string[]) {
    const project = tarea.project;
    const session = tarea.session;
    const paths = [...rutas];
    await clean(`${project}/${session}`, (captured) => invoke<Liberado>("reclaim_storage", {
      project, session, rutas: paths,
    }, destination(captured)));
  }

  async function vaciarCache() {
    await clean("cache", (captured) => invoke<Liberado>("empty_build_cache", {}, destination(captured)));
  }

  async function recoger() {
    await clean("orphans", (captured) => invoke<Liberado>("collect_orphans", {}, destination(captured)));
  }

  return { tareas, tope, grupos, grupoAbierto, cuantasTareas, fraccionRecuperable, vaciar, vaciarCache, recoger };
}

export type StorageTasks = ReturnType<typeof createStorageTasks>;
