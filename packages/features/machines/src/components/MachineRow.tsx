import { createSignal, Show } from "solid-js";
import type { ConnectionStatus, Machine, MachineConnection } from "../model.ts";
import { MachineBadge } from "./MachineBadge.tsx";
import { MachineIcon } from "./MachineIcon.tsx";

export interface MachineRowProps {
  machine: Machine;
  isOperating?: "starting" | "stopping";
  connection?: MachineConnection;
  onStart?: (id: string) => Promise<unknown>;
  onStop?: (id: string) => Promise<unknown>;
  onConnect?: (machine: Machine) => unknown;
}

export function MachineRow(props: MachineRowProps) {
  const [actionError, setActionError] = createSignal<string | null>(null);

  const engineStatus = (): ConnectionStatus | undefined => {
    return props.connection ? props.connection.status() : undefined;
  };

  const handleStart = async () => {
    setActionError(null);
    try {
      await props.onStart?.(props.machine.machine_id);
    } catch (err: any) {
      setActionError(err?.message ?? "Error al encender");
    }
  };

  const handleStop = async () => {
    setActionError(null);
    try {
      await props.onStop?.(props.machine.machine_id);
    } catch (err: any) {
      setActionError(err?.message ?? "Error al apagar");
    }
  };

  const handleConnect = () => {
    setActionError(null);
    try {
      props.onConnect?.(props.machine);
    } catch (err: any) {
      setActionError(err?.message ?? "Error al conectar");
    }
  };

  const name = () => props.machine.name?.trim() || props.machine.machine_id;

  return (
    <div
      class="flex flex-col gap-1.5 rounded-lg border border-neutral-200/70 p-3 transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700"
      data-machine-id={props.machine.machine_id}
    >
      <div class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-2.5">
          <MachineIcon kind={props.machine.kind} class="h-4 w-4 shrink-0 text-neutral-600 dark:text-neutral-400" />
          <div class="flex min-w-0 flex-col">
            <span class="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{name()}</span>
            <MachineBadge
              state={props.machine.state}
              connection={props.machine.connection}
              engineStatus={engineStatus()}
              isOperating={props.isOperating}
            />
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-1.5">
          <Show when={props.machine.state === "stopped" && !props.isOperating}>
            <button
              type="button"
              class="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              onClick={handleStart}
            >
              Encender
            </button>
          </Show>

          <Show when={props.machine.state === "running" && !props.isOperating}>
            <button
              type="button"
              class="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              onClick={handleStop}
            >
              Apagar
            </button>
          </Show>

          <button
            type="button"
            class="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
            onClick={handleConnect}
          >
            Conectar
          </button>
        </div>
      </div>

      <Show when={actionError()}>
        <span class="text-xs text-red-600 dark:text-red-400" role="alert">
          {actionError()}
        </span>
      </Show>
    </div>
  );
}
