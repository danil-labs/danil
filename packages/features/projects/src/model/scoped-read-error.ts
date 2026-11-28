import { createMemo, createSignal, untrack, type Accessor, type Setter } from "solid-js";

export type WakeMachineStatus = { id: string; local?: boolean; wakes?: boolean; on?: boolean; power?: string };

export type ReadErrorToken = {
  readonly workspace: string | null;
  readonly generation: number;
  readonly wakeEpoch: number;
  readonly starting: boolean;
  readonly seq: number;
};

export type ScopedErrorSetter = Setter<string | null> & {
  /** Captura identidad `(workspace, generation, wakeEpoch, starting, seq)` al iniciar una lectura. */
  begin: () => ReadErrorToken;
  /** Aplica fallo o limpieza solo si el token sigue vigente y no arrancó durante un encendido. */
  setFor: (token: ReadErrorToken, value: string | null) => void;
};

/**
 * Mantiene errores de lectura ligados al workspace, generación y época de encendido de las VMs:
 * una lectura iniciada durante `starting` nunca produce un toast tardío al pasar a `on`, y una
 * respuesta vieja no limpia ni sobreescribe el estado de una lectura posterior.
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

  const createError = (): [Accessor<string | null>, ScopedErrorSetter] => {
    const [raw, setRaw] = createSignal<{ message: string; workspace: string | null; generation: number; wakeEpoch: number } | null>(null);
    let latestSeq = 0;

    const read: Accessor<string | null> = () => {
      const current = raw();
      const wake = wakeState();
      if (!current || wake.starting) return null;
      if (current.workspace !== deps.workspace() || current.generation !== deps.generation() || current.wakeEpoch !== wake.epoch) return null;
      return current.message;
    };

    const begin = (): ReadErrorToken => {
      const wake = untrack(wakeState);
      return {
        workspace: untrack(deps.workspace),
        generation: deps.generation(),
        wakeEpoch: wake.epoch,
        starting: wake.starting,
        seq: ++latestSeq,
      };
    };

    const setFor = (token: ReadErrorToken, value: string | null) => {
      const wake = untrack(wakeState);
      const currentScope =
        token.seq === latestSeq &&
        token.workspace === untrack(deps.workspace) &&
        token.generation === deps.generation() &&
        token.wakeEpoch === wake.epoch;
      if (!currentScope) return;
      if (!value) {
        setRaw(null);
        return;
      }
      if (token.starting || wake.starting) {
        setRaw(null);
        return;
      }
      setRaw({
        message: value,
        workspace: token.workspace,
        generation: token.generation,
        wakeEpoch: token.wakeEpoch,
      });
    };

    const set = ((value: string | null | ((prev: string | null) => string | null)) => {
      const next = typeof value === "function" ? value(untrack(read)) : value;
      if (!next) {
        latestSeq++;
        setRaw(null);
        return null;
      }
      const token = begin();
      setFor(token, next);
      return next;
    }) as ScopedErrorSetter;
    set.begin = begin;
    set.setFor = setFor;

    return [read, set];
  };

  return { createError };
}
