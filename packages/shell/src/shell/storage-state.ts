import type { EngineUpdate, MachineTaskUsage, Startup } from "../../../engine-client/src/index.ts";
import { createEffect, createMemo, createSignal, on, onCleanup, untrack } from "solid-js";
import { callShellEngine } from "../../../session/src/shell-queries.ts";
import { t } from "../../../ui/src/lib/i18n";
import { conservar } from "../../../session/src/sessionRefresh";
import { errorCode } from "../../../ui/src/lib/errorCode.ts";
import { listen } from "../../../host/src/serviceEvents.ts";
import { prosaDe } from "../../../ui/src/Failure";
import type { Power, TaskLookup } from "./MachineCard";
import { USAGE_FEATURE, hasUsage, remember, worst } from "./machineUsage";
import type { Almacen, Machine, Summary, TareaConPeso, Target } from "./storage-model";
import { fleetMachines, machineName } from "./storage-model";

export type StorageProps = {
workspace: string | null;
/** Tareas con un turno vivo. */
trabajando: string[];
/** Tareas con una pestaña abierta en esta ventana. */
conPestana: string[];
onAbrirTarea: (project: string, session: string) => void;
/** En la columna de organizaciones: icono sobre la cifra y el panel a la derecha. */
vertical?: boolean;
/** El título y la carpeta de una tarea de este workspace, para la pestaña Memoria. */
lookup?: TaskLookup;
};

/** Las máquinas, sus resúmenes y el detalle de disco de la elegida, con sus lecturas. */
export function createStorageState(props: StorageProps) {
  const [datos, setDatos] = createSignal<Almacen | null>(null);
  const [abierto, setAbierto] = createSignal(false);
  const [midiendo, setMidiendo] = createSignal(false);
  const [vista, setVista] = createSignal<"proyecto" | "tarea">("proyecto");
  /** Qué tareas están desplegadas, por id. Plegadas por omisión. */
  const [abiertas, setAbiertas] = createSignal<Record<string, boolean>>({});
  /** Grupos plegados o desplegados a mano. Sin entrada, abre solo el más pesado. */
  const [gruposAbiertos, setGruposAbiertos] = createSignal<Record<string, boolean>>({});
  const [compartidoAbierto, setCompartidoAbierto] = createSignal(false);
  /** Lo que dijo el backend cuando no se pudo, en la fila que lo pidió. */
  const [fallo, setFallo] = createSignal<Record<string, string>>({});
  /** Lo que se liberó, en la fila que lo pidió. Un borrado sin confirmación se
   *  lee como que no pasó nada: la lista se reordena y ya. */
  const [liberado, setLiberado] = createSignal<Record<string, string>>({});

  const [inventory, setInventory] = createSignal<Machine[]>([]);
  const [machine, setMachine] = createSignal<string | null>(null);
  const [summaries, setSummaries] = createSignal<Record<string, Summary>>({});
  const [inventoryError, setInventoryError] = createSignal("");
  const [readError, setReadError] = createSignal("");
  const [listing, setListing] = createSignal(false);
  const [operationPending, setOperationPending] = createSignal(false);
  /** El detalle de la máquina elegida, plegado al tocar otra vez su tarjeta. */
  const [expanded, setExpanded] = createSignal(true);
  /** La pestaña elegida a mano; sin elegir, Memoria si el host la manda. */
  const [tabChoice, setTabChoice] = createSignal<"memory" | "disk" | null>(null);
  const [stopping, setStopping] = createSignal<Record<string, boolean>>({});
  const [stopFailure, setStopFailure] = createSignal<Record<string, string>>({});
  let generation = 0;
  let inventoryRequest = 0;
  let detailRequest = 0;
  const summaryRequests = new Map<string, number>();
  let disposed = false;
  let dataTarget: Target | null = null;

  const selected = () => inventory().find((m) => m.id === machine());
  const current = (target: Target) => !disposed && target.generation === generation
    && target.workspace === props.workspace && target.machine === machine();
  const destination = (target: Target) => ({ headers: {
    "x-terminus-machine": target.machine,
    "x-terminus-workspace": target.workspace,
  } });
  const target = (): Target | null => {
    const m = selected();
    const workspace = props.workspace;
    return m?.on && m.hosts !== false && workspace
      ? { machine: m.id, workspace, generation } : null;
  };
  const canClean = () => !!dataTarget && current(dataTarget) && !!target()
    && !clearing() && !listing() && !midiendo() && !inventoryError() && !readError() && !datos()?.aviso;

  /** El resumen de la máquina; apagada, su última copia (`cached_at`), sin encenderla. */
  async function readSummary(m: Machine) {
    if (disposed) return;
    const context = generation;
    const workspace = props.workspace;
    const request = (summaryRequests.get(m.id) ?? 0) + 1;
    summaryRequests.set(m.id, request);
    const valid = () => !disposed && context === generation && workspace === props.workspace
      && summaryRequests.get(m.id) === request;
    setSummaries((prev) => ({ ...prev, [m.id]: { ...prev[m.id], loading: true, error: undefined } }));
    try {
      // Startup directo: el resumen de disco no requiere ni materializa un workspace.
      const startup = await callShellEngine<Partial<Startup>>("list_workspaces", {}, {
        headers: { "x-terminus-machine": m.id },
      });
      remember(m.id, startup.machine_resources);
      if (valid()) setSummaries((prev) => ({ ...prev, [m.id]: {
        resources: startup.machine_resources, workspaceName: startup.workspaces?.find((w) => w.id === workspace)?.name, loading: false,
        cachedAt: startup.cached_at, stale: startup.cached_at != null || undefined,
      } }));
    } catch (error) {
      // Apagada y sin copia no es un fallo: es «sin mediciones guardadas».
      if (valid()) setSummaries((prev) => ({ ...prev, [m.id]: {
        ...prev[m.id], loading: false, error: m.on ? prosaDe(error) : undefined,
      } }));
    }
  }

  async function consultar(refrescar = true) {
    const captured = target();
    // El barrido del disco solo con la pestaña Disco a la vista: es lento y la
    // de Memoria sale del resumen.
    if (!captured || clearing() || !showsDisk()) return;
    const request = ++detailRequest;
    setMidiendo(true);
    setReadError("");
    try {
      const value = await callShellEngine<Almacen>("list_storage", { refrescar }, destination(captured));
      if (current(captured) && request === detailRequest) {
        dataTarget = captured;
        setDatos(value);
      }
    } catch (error) {
      if (current(captured) && request === detailRequest) setReadError(prosaDe(error));
    } finally {
      if (current(captured) && request === detailRequest) setMidiendo(false);
    }
  }

  function resetDetail() {
    detailRequest++;
    dataTarget = null;
    setDatos(null);
    setReadError("");
    setMidiendo(false);
    setAbiertas({});
    setGruposAbiertos({});
    setFallo({});
    setLiberado({});
    setCompartidoAbierto(false);
  }

  function choose(m: Machine) {
    if (clearing()) return;
    if (m.id === machine()) {
      setExpanded((v) => !v);
      return;
    }
    setMachine(m.id);
    setExpanded(true);
    setTabChoice(null);
    resetDetail();
    void openInventory();
  }

  const summaryOf = (id: string | null | undefined) => (id ? summaries()[id] : undefined);
  /** Memoria si el host la manda, Disco si no; mientras llega el primer resumen, ninguna. */
  const tab = () => {
    const chosen = tabChoice();
    if (chosen) return chosen;
    const s = summaryOf(machine());
    if (!s || (s.loading && !s.resources)) return null;
    return hasUsage(s.resources) ? "memory" : "disk";
  };
  const showsDisk = () => abierto() && expanded() && tab() === "disk";
  // Al pasar a Disco se mide; si es `openInventory` quien está listando, mide él.
  createEffect(on(showsDisk, (shown) => {
    if (shown) queueMicrotask(() => {
      if (showsDisk() && !datos() && !midiendo() && !listing()) void consultar();
    });
  }, { defer: true }));

  function powerOf(m: Machine): Power {
    if (m.on) return summaryOf(m.id)?.error && !summaryOf(m.id)?.loading ? "no_answer" : "on";
    return m.power === "starting" ? "starting" : "off";
  }

  /** La peor presión entre las encendidas, para el punto del botón. */
  const pressure = createMemo(() => {
    const on = new Set([...inventory(), ...fleetMachines()].filter((m) => m.on).map((m) => m.id));
    return worst(Object.entries(summaries()).filter(([id]) => on.has(id)).map(([id, s]) => ({ id, resources: s.resources })));
  });
  const pressureName = () => {
    const p = pressure();
    const m = p && [...inventory(), ...fleetMachines()].find((x) => x.id === p.id);
    return p ? machineName(p.id, m?.local) : "";
  };

  /**
   * Con el panel cerrado, el punto del botón se mantiene al día leyendo cada
   * minuto el resumen de las máquinas que mandan memoria (`machine_usage_v1`).
   * A un host anterior no se le pregunta: no tiene presión que contar.
   */
  const watched = createMemo(() => fleetMachines().filter((m) => m.on && m.features?.includes(USAGE_FEATURE)).map((m) => m.id).join(","));
  createEffect(() => {
    if (abierto() || !watched()) return;
    const tick = () => untrack(() => {
      if (disposed || document.visibilityState === "hidden") return;
      for (const m of fleetMachines()) if (m.on && m.features?.includes(USAGE_FEATURE)) void readSummary(m);
    });
    tick();
    const timer = setInterval(tick, 60_000);
    onCleanup(() => clearInterval(timer));
  });

  /** El texto de un fallo de la actualización: `no_release_known` tiene el suyo. */
  const updateFailure = (code: string) => code === "no_release_known" ? t("shell.machine_panel.no_release_known") : code;

  /**
   * `engine_update({ release, force })` (§3.6). `release: null` es la última
   * firmada de su canal; `force: true` solo tras confirmar «Actualizar ya».
   */
  async function updateEngine(m: Machine, force: boolean): Promise<string> {
    try {
      await callShellEngine("engine_update", { release: null, force }, { headers: { "x-terminus-machine": m.id } });
      await refreshEngine(m, false);
      return "";
    } catch (error) {
      return (error === "no_release_known" || errorCode(error) === "no_release_known") ? updateFailure("no_release_known") : prosaDe(error);
    }
  }

  /** `engine_update_status`: el bloque `engine` de la tarjeta, sin esperar al próximo resumen. */
  async function refreshEngine(m: Machine, refresh = true) {
    try {
      const engine = await callShellEngine<EngineUpdate>("engine_update_status", { refresh }, { headers: { "x-terminus-machine": m.id } });
      setSummaries((prev) => {
        const s = prev[m.id];
        if (!s?.resources) return prev;
        return { ...prev, [m.id]: { ...s, resources: { ...s.resources, engine: { ...s.resources.engine, ...engine } } } };
      });
    } catch {
      // Sin respuesta queda lo último que se leyó.
    }
  }

  /**
   * `machine-usage` (`left_running` o `pressure`): se relee el resumen de esa
   * máquina sin esperar al sondeo. Sin `machine`, es el motor de esta ventana.
   */
  const usageEvents = listen<{ machine?: string }>("machine-usage", (event) => {
    const all = [...inventory(), ...fleetMachines()];
    const m = event.payload?.machine ? all.find((x) => x.id === event.payload.machine) : all.find((x) => x.local);
    if (m?.on) void readSummary(m);
  });
  onCleanup(() => void usageEvents.then((unlisten) => unlisten()).catch(() => {}));

  async function stopTask(m: Machine, task: MachineTaskUsage) {
    const key = task.session;
    setStopping((prev) => ({ ...prev, [key]: true }));
    setStopFailure((prev) => ({ ...prev, [key]: "" }));
    try {
      await callShellEngine("stop_task_processes", { session: task.session, workspace: task.workspace }, { headers: {
        "x-terminus-machine": m.id,
        "x-terminus-workspace": task.workspace,
      } });
    } catch (error) {
      setStopFailure((prev) => ({ ...prev, [key]: prosaDe(error) }));
    } finally {
      setStopping((prev) => ({ ...prev, [key]: false }));
      void readSummary(m);
    }
  }

  async function openInventory(expected?: Target, refreshDetail = true) {
    if (clearing() || (expected && !current(expected))) return;
    const context = expected?.generation ?? generation;
    const workspace = expected?.workspace ?? props.workspace;
    const request = ++inventoryRequest;
    setListing(true);
    setInventoryError("");
    try {
      const list = await callShellEngine<Machine[]>("machine_list", {}, workspace
        ? { headers: { "x-terminus-workspace": workspace } } : undefined);
      if (disposed || context !== generation || workspace !== props.workspace || request !== inventoryRequest) return;
      setInventory((previous) => conservar(previous, list, (m) => m.id));
      if (!list.some((m) => m.id === machine())) {
        setMachine((list.find((m) => m.active) ?? list[0])?.id ?? null);
        resetDetail();
      }
      for (const m of list) void readSummary(m);
      void consultar(refreshDetail);
    } catch (error) {
      if (!disposed && context === generation && request === inventoryRequest) setInventoryError(prosaDe(error));
    } finally {
      if (!disposed && context === generation && request === inventoryRequest) setListing(false);
    }
  }

  createEffect(on(() => props.workspace, () => {
    generation++;
    inventoryRequest++;
    setInventory([]);
    setMachine(null);
    setSummaries({});
    setInventoryError("");
    setListing(false);
    setTabChoice(null);
    setExpanded(true);
    resetDetail();
    if (abierto() && !clearing()) void openInventory();
  }));
  createEffect(on(abierto, (open) => {
    if (!open) return;
    let running = false;
    let alive = true;
    const sync = async () => {
      if (running || clearing() || listing() || document.visibilityState === "hidden") return;
      running = true;
      const context = generation;
      const workspace = props.workspace;
      const request = inventoryRequest;
      try {
        const list = await callShellEngine<Machine[]>("machine_list");
        if (!alive || disposed || context !== generation || workspace !== props.workspace || request !== inventoryRequest) return;
        for (const m of list) {
          if (m.on || (!inventory().find((old) => old.id === m.id)?.on && !summaries()[m.id]?.loading)) continue;
          summaryRequests.set(m.id, (summaryRequests.get(m.id) ?? 0) + 1);
          setSummaries((prev) => ({ ...prev, [m.id]: { ...prev[m.id], loading: false, stale: true } }));
          if (m.id === machine()) {
            detailRequest++;
            setMidiendo(false);
            setReadError(t("shell.storage.offline"));
          }
        }
        if (!list.some((m) => m.id === machine())) {
          setMachine(null);
          resetDetail();
        }
        setInventoryError("");
        setInventory((previous) => conservar(previous, list, (m) => m.id));
      } catch (error) {
        if (alive && !disposed && context === generation && request === inventoryRequest) setInventoryError(prosaDe(error));
      } finally {
        running = false;
      }
    };
    const changed = () => { void sync(); };
    const timer = setInterval(changed, 5000);
    window.addEventListener("harness:machines", changed);
    window.addEventListener("focus", changed);
    onCleanup(() => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("harness:machines", changed);
      window.removeEventListener("focus", changed);
    });
  }));
  onCleanup(() => { disposed = true; generation++; detailRequest++; inventoryRequest++; });

  const clearing = operationPending;

  function abrirTarea(tarea: TareaConPeso) {
    if (!selected()?.active || !dataTarget || !current(dataTarget)) return;
    setAbierto(false);
    props.onAbrirTarea(tarea.project, tarea.session);
  }

  return { datos, abierto, setAbierto, midiendo, vista, setVista, abiertas, setAbiertas, gruposAbiertos, setGruposAbiertos, compartidoAbierto, setCompartidoAbierto, fallo, setFallo, liberado, setLiberado, inventory, setInventory, machine, summaries, inventoryError, readError, listing, setOperationPending, expanded, setTabChoice, stopping, stopFailure, selected, current, destination, target, canClean, choose, summaryOf, tab, showsDisk, powerOf, pressure, pressureName, updateFailure, updateEngine, refreshEngine, stopTask, openInventory, clearing, abrirTarea };
}

export type StorageState = ReturnType<typeof createStorageState>;
