import Check from "lucide-solid/icons/check";
import ChevronDown from "lucide-solid/icons/chevron-down";
import Plus from "lucide-solid/icons/plus";
import { createSignal, For, onMount, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import { ITEM_DE_MENU, Popover, PopoverContent, PopoverTrigger } from "../../ui/Popover";
import { SignalDot } from "../../ui/SignalDot";
import { ConnectMachine, connectSource } from "./ConnectMachine";
import { MachineIcon } from "./MachineIcon";
import { refetchSharedMachines, sharedBusy, sharedMachines, sharedNotice, startSharedMachine } from "./shared";
import { type Machine, machineName, machines, type ProjectPlace, refetchMachines, runOn, setRunOn, unavailable, wakesOf } from "./store";

let pedida = false;

/**
 * «Ejecutar en»: la máquina donde corre la tarea que se va a crear, recordada por
 * workspace. La ventana sigue en su workspace; elegir una apagada no la enciende,
 * la enciende enviar. Una máquina sin el workspace lo crea con el mismo id al
 * enviar; la que no puede se ve desactivada con la razón. Un proyecto sin
 * remoto se lleva desde su máquina mientras esté encendida (`carry.ts`).
 * Con `shared`, debajo van las de la organización: estado y encendido, sin poder
 * elegirlas. No están en `machines()` y no corren tareas.
 */
export function MachinePicker(props: { workspace: string | null; project?: ProjectPlace; shared?: boolean }) {
  if (!pedida) {
    pedida = true;
    void refetchMachines();
  }
  onMount(() => {
    if (props.shared) void refetchSharedMachines();
  });

  const [abierto, setAbierto] = createSignal(false);
  const [conectando, setConectando] = createSignal(false);
  const fuente = connectSource();
  const elegida = () => {
    const id = runOn(props.workspace, props.project);
    return machines().find((m) => (id ? m.id === id : m.active));
  };
  const nombre = (m: Machine) => machineName(m.id, m.local);

  function elegir(m: Machine) {
    setAbierto(false);
    setRunOn(props.workspace, m.active ? null : m.id);
  }

  const razon = (m: Machine) => {
    const falta = props.workspace ? unavailable(m, props.project) : null;
    if (falta === "workspace") return { label: t("shell.machines.unlinked"), hint: t("shell.machines.unlinked_hint", { name: nombre(m) }) };
    if (falta === "project") return { label: t("shell.machines.no_project"), hint: t("shell.machines.no_project_hint", { project: props.project?.name ?? "" }) };
    return null;
  };

  const muestra = () => machines().length > 1 || (!!props.shared && sharedMachines().length > 0);
  const tono = (power: string) => (power === "running" ? "success" : power === "starting" ? "working" : power === "stopping" ? "warning" : power === "unknown" ? "neutral" : "off") as "success" | "working" | "warning" | "neutral" | "off";
  const estado = (power: string) => {
    switch (power) {
      case "running": return t("shell.machines.shared.power.running");
      case "stopped": return t("shell.machines.shared.power.stopped");
      case "starting": return t("shell.machines.shared.power.starting");
      case "stopping": return t("shell.machines.shared.power.stopping");
      default: return t("shell.machines.shared.power.unknown");
    }
  };

  return (
    <Show when={muestra()}>
      <Popover open={abierto()} onOpenChange={(v) => { setAbierto(v); if (v) { void refetchMachines(); if (props.shared) void refetchSharedMachines(); } }} placement="top-start" gutter={4}>
        <PopoverTrigger
          class="flex min-h-7 max-w-[260px] items-center gap-1.5 rounded-sm px-1 text-left text-xs text-neutral-500 hover:text-neutral-950"
          aria-label={t("shell.machines.label")}
        >
          <MachineIcon wakes={elegida() ? wakesOf(elegida() as Machine) : false} size={12} />
          <span class="truncate">{elegida() ? nombre(elegida() as Machine) : t("shell.machines.label")}</span>
          <Show when={elegida()}>
            <SignalDot tone={(elegida() as Machine).on ? "success" : "off"} />
          </Show>
          <ChevronDown size={11} aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent class="w-[300px] overflow-hidden p-0 text-caption text-neutral-500 shadow-lg">
          <p class="m-0 border-b border-border px-2 py-1.5">{t("shell.machines.label")}</p>
          <div class="py-1">
            <For each={machines()}>
              {(m) => (
                <button
                  class={`${ITEM_DE_MENU} flex items-center gap-2 disabled:opacity-50`}
                  data-machine-option={m.id}
                  disabled={!!razon(m)}
                  title={razon(m)?.hint}
                  onClick={() => elegir(m)}
                >
                  <MachineIcon wakes={wakesOf(m)} size={12} />
                  <SignalDot tone={m.on ? "success" : "off"} />
                  <span class="flex-1 truncate">{nombre(m)}</span>
                  <span class="text-2xs" data-machine-reason={razon(m) ? "" : undefined}>
                    {razon(m)?.label ?? (m.on ? t("shell.machines.on") : t("shell.machines.off"))}
                  </span>
                  <span class="flex w-3 shrink-0">
                    <Show when={elegida()?.id === m.id}>
                      <Check size={12} aria-hidden="true" />
                    </Show>
                  </span>
                </button>
              )}
            </For>
            <Show when={props.shared && sharedMachines().length > 0}>
              <div class="border-t border-border" data-shared-section="">
                <p class="m-0 px-2 pb-0.5 pt-1.5">{t("shell.machines.shared.heading")}</p>
                <p class="m-0 px-2 pb-1 text-2xs">{t("shell.machines.shared.not_for_tasks")}</p>
                <For each={sharedMachines()}>
                  {(m) => (
                    <div class="flex items-center gap-2 px-2 py-1.5" data-shared-machine={m.computer_id} data-shared-power={m.power}>
                      <MachineIcon wakes size={12} />
                      <SignalDot tone={tono(m.power)} pulse={m.power === "starting"} />
                      <span class="flex-1 truncate">{m.name}</span>
                      <span class="text-2xs">{estado(m.power)}</span>
                      <Show when={m.power === "stopped" || m.power === "unknown"}>
                        <button
                          type="button"
                          class="shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-2xs text-neutral-950 hover:bg-surface-muted disabled:opacity-50"
                          data-shared-start={m.computer_id}
                          disabled={sharedBusy() === m.computer_id}
                          onClick={() => void startSharedMachine(m.computer_id, {
                            license: t("shell.machines.shared.license"),
                            denied: t("shell.machines.shared.denied"),
                            stopping: t("shell.machines.shared.stopping"),
                            failed: t("shell.machines.shared.failed"),
                          })}
                        >
                          {sharedBusy() === m.computer_id ? t("shell.machines.shared.starting") : t("shell.machines.shared.start")}
                        </button>
                      </Show>
                    </div>
                  )}
                </For>
                <Show when={sharedNotice()}>
                  <p class="m-0 px-2 pb-1.5 text-2xs text-error-strong" role="alert" data-shared-notice="">
                    {sharedNotice()}
                  </p>
                </Show>
              </div>
            </Show>
          </div>
          <Show when={fuente}>
            <button
              class={`${ITEM_DE_MENU} flex items-center gap-2 border-t border-border`}
              data-connect-machine-item=""
              onClick={() => {
                setAbierto(false);
                setConectando(true);
              }}
            >
              <Plus size={12} aria-hidden="true" />
              <span class="flex-1 truncate">{t("danil.connect_machine.button")}</span>
            </button>
          </Show>
        </PopoverContent>
      </Popover>
      <Show when={fuente}>
        {(f) => (
          <Dialog open={conectando()} onOpenChange={setConectando}>
            <DialogContent class="max-w-[520px]">
              <DialogTitle class="mb-3 text-sm font-semibold">{t("danil.connect_machine.title")}</DialogTitle>
              <Show when={conectando()}>
                <ConnectMachine
                  {...f()}
                  onReady={(c) => {
                    setConectando(false);
                    f().onReady(c);
                    void refetchMachines();
                  }}
                />
              </Show>
            </DialogContent>
          </Dialog>
        )}
      </Show>
    </Show>
  );
}
