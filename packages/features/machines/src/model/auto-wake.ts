import { FleetError, memberKey, type Fleet, type MachineInfo } from "./fleet/index.ts";

export const AUTO_WAKE_BACKOFF_MS = [5_000, 15_000, 30_000] as const;

type Timer = ReturnType<typeof setTimeout>;

export type AutoWakeOptions = {
  fleet: () => Fleet;
  /** Lectura en vivo del contexto y workspace activos al vencer un reintento programado. */
  activeTarget?: () => { context: string | null; workspace: string | null };
  onAwake?: (machine: MachineInfo) => void;
  onSettled?: () => void;
  setTimer?: (run: () => void, ms: number) => Timer;
  clearTimer?: (handle: Timer) => void;
};

/**
 * Despierta en segundo plano las VMs hospedadas del contexto activo con reintento acotado
 * ante fallos recuperables (`machine_timeout`, `machine_lost`, `start_failed`) y cancela
 * cualquier temporizador al encender, cambiar de contexto o cerrar.
 */
export function createAutoWaker(options: AutoWakeOptions) {
  const setTimer = options.setTimer ?? ((run, ms) => setTimeout(run, ms));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
  const inflight = new Map<string, Promise<void>>();
  const failures = new Map<string, number>();
  const timers = new Map<string, Timer>();
  const unstartable = new Set<string>();
  let activeScope: string | null = null;
  let activeWorkspace: string | null = null;
  let closed = false;

  const cancelTimer = (key: string) => {
    const handle = timers.get(key);
    if (handle === undefined) return;
    clearTimer(handle);
    timers.delete(key);
  };

  const resetKey = (key: string) => {
    cancelTimer(key);
    failures.delete(key);
  };

  const cancelAllTimers = () => {
    for (const handle of timers.values()) clearTimer(handle);
    timers.clear();
  };

  const wake = (
    context: string | undefined,
    workspace: string | null,
    opts?: { auto?: boolean; filter?: (machine: MachineInfo) => boolean },
  ) => {
    if (closed || !context) return;
    if (opts?.auto) {
      if (activeScope !== context) {
        cancelAllTimers();
        activeScope = context;
      }
      activeWorkspace = workspace;
    }
    const fleet = options.fleet();
    for (const m of fleet.machines(context)) {
      const key = memberKey(m.id, m.context);
      const power = fleet.power(m.id, m.context);
      // Admitimos `starting` del inventario para pedir el ticket 201; `inflight` y `Fleet` deduplican encendidos locales.
      if (!m.wakes || m.child || power === "on" || power === "outdated" || inflight.has(key)) continue;
      if (opts?.filter && !opts.filter(m)) continue;
      if (workspace) {
        if (m.hosted === false && fleet.lists(m.id, workspace) !== true) continue;
        if (m.organization && !m.organization.workspaces.some((w) => w.id === workspace)) continue;
        if (m.linked && !m.linked.has(workspace)) continue;
      } else if (m.hosted === false) {
        continue;
      }
      if (opts?.auto) {
        if (unstartable.has(key) || timers.has(key)) continue;
        if ((failures.get(key) ?? 0) > AUTO_WAKE_BACKOFF_MS.length) continue;
      } else {
        unstartable.delete(key);
        resetKey(key);
      }
      inflight.set(
        key,
        fleet
          .wake(m.id, m.context)
          .then(() => {
            inflight.delete(key);
            unstartable.delete(key);
            resetKey(key);
            if (!closed) options.onAwake?.(m);
          })
          .catch((error) => {
            inflight.delete(key);
            if (closed) return;
            // Solo un rechazo explícito `not_remotely_startable` (`machine_off` sin `canWake`) detiene el autoencendido.
            if (error instanceof FleetError && error.code === "machine_off" && !error.canWake) {
              unstartable.add(key);
              resetKey(key);
              return;
            }
            if (!opts?.auto) return;
            const count = failures.get(key) ?? 0;
            failures.set(key, count + 1);
            if (count >= AUTO_WAKE_BACKOFF_MS.length) return;
            const delay = AUTO_WAKE_BACKOFF_MS[count];
            cancelTimer(key);
            timers.set(
              key,
              setTimer(() => {
                timers.delete(key);
                if (closed) return;
                const live = options.activeTarget ? options.activeTarget() : { context: activeScope, workspace: activeWorkspace };
                if (!live.context || live.context !== context) return;
                wake(live.context, live.workspace, opts);
              }, delay),
            );
          })
          .finally(() => {
            inflight.delete(key);
            if (!closed) options.onSettled?.();
          }),
      );
    }
  };

  return {
    wake,
    onPowerChange(machine: string, context: string | undefined, power: string) {
      if (power === "on") {
        const key = memberKey(machine, context);
        unstartable.delete(key);
        resetKey(key);
      }
    },
    pruneContexts(validContexts: Iterable<string>) {
      const valid = new Set(validContexts);
      if (activeScope && !valid.has(activeScope)) {
        cancelAllTimers();
        activeScope = null;
      }
    },
    close() {
      closed = true;
      cancelAllTimers();
      failures.clear();
      unstartable.clear();
    },
  };
}
