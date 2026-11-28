import { createMemo, createSignal, untrack, type Accessor, type Setter } from "solid-js";

export type WakeMachineStatus = { id: string; local?: boolean; wakes?: boolean; on?: boolean; power?: string };

/**
 * Mantiene errores de lectura ligados al workspace, generación y época de encendido de las VMs:
 * mientras una VM administrada enciende, no se guardan errores, y un fallo anterior nunca
 * reaparece al pasar la VM a `on` antes de que termine la nueva lectura.
 */
export function createWakeScopedReadErrors(deps: {
  machines: Accessor<readonly WakeMachineStatus[]>;
  workspace: Accessor<string | null>;
  generation: () => number;
}) {
  const wakeState = createMemo<{ starting: boolean; onIds: string; epoch: number }>((prev) => {
    const list = deps.machines();
    const starting = list.some((m) => !m.local && m.wakes && m.power === "starting");
    const onIds = list.filter((m) => !m.local && m.wakes && m.on).map((m) => m.id).sort().join("\0");
    const epoch = prev && (starting !== prev.starting || onIds !== prev.onIds) ? prev.epoch + 1 : (prev?.epoch ?? 0);
    return { starting, onIds, epoch };
  });

  const createError = (): [Accessor<string | null>, Setter<string | null>] => {
    const [raw, setRaw] = createSignal<{ message: string; workspace: string | null; generation: number; wakeEpoch: number } | null>(null);
    const read: Accessor<string | null> = () => {
      const current = raw();
      const wake = wakeState();
      if (!current || wake.starting) return null;
      if (current.workspace !== deps.workspace() || current.generation !== deps.generation() || current.wakeEpoch !== wake.epoch) return null;
      return current.message;
    };
    const set = ((value: string | null | ((prev: string | null) => string | null)) => {
      const next = typeof value === "function" ? value(untrack(read)) : value;
      if (!next) {
        setRaw(null);
        return null;
      }
      const wake = untrack(wakeState);
      if (wake.starting) {
        setRaw(null);
        return null;
      }
      setRaw({
        message: next,
        workspace: untrack(deps.workspace),
        generation: deps.generation(),
        wakeEpoch: wake.epoch,
      });
      return next;
    }) as Setter<string | null>;
    return [read, set];
  };

  return { createError };
}
