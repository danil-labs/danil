import { createSignal, Show } from "solid-js";
import { Button, SettingsRow } from "@danil/ui";
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
    <SettingsRow
      data-machine-id={props.machine.machine_id}
      lead={<MachineIcon kind={props.machine.kind} class="h-4 w-4 shrink-0 text-neutral-500" />}
      label={name()}
      description={
        <div class="flex flex-col gap-0.5">
          <div class="flex items-center gap-1.5">
            <Show when={props.machine.kind}>
              {(kind) => (
                <>
                  <span data-machine-kind="">{kind()}</span>
                  <span>·</span>
                </>
              )}
            </Show>
            <MachineBadge
              state={props.machine.state}
              connection={props.machine.connection}
              engineStatus={engineStatus()}
              isOperating={props.isOperating}
            />
          </div>
          <Show when={actionError()}>
            <span class="text-xs text-error-strong" role="alert">
              {actionError()}
            </span>
          </Show>
        </div>
      }
    >
      <div class="flex shrink-0 items-center gap-2">
        <Show when={props.machine.state === "stopped" && !props.isOperating}>
          <Button size="sm" variant="secondary" onClick={handleStart}>
            Encender
          </Button>
        </Show>

        <Show when={props.machine.state === "running" && !props.isOperating}>
          <Button size="sm" variant="secondary" onClick={handleStop}>
            Apagar
          </Button>
        </Show>

        <Button size="sm" variant="outline" onClick={handleConnect}>
          Conectar
        </Button>
      </div>
    </SettingsRow>
  );
}
