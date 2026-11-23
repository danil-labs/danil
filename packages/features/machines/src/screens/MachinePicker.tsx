import Check from "lucide-solid/icons/check";
import ChevronDown from "lucide-solid/icons/chevron-down";
import Plus from "lucide-solid/icons/plus";
import { batch, createSignal, For, onMount, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Dialog, DialogContent, DialogTitle } from "../../../../ui/src/Dialog";
import { ITEM_DE_MENU, Popover, PopoverContent, PopoverTrigger } from "../../../../ui/src/Popover";
import { Pressable } from "../../../../ui/src/Pressable";
import { SignalDot } from "../../../../ui/src/SignalDot";
import { ConnectMachine, connectSource } from "./ConnectMachine";
import { MachineIcon } from "../../../../ui/src/MachineIcon";
import { isGuestMachine } from "../queries/guestLink";
import { capabilities } from "../../../../host/src/platform";
import { cloudInventory, rememberedRunOn, type Machine, machineName, machines, type ProjectPlace, refetchMachines, runOn, runsWorkspace, setRunOn, unavailable, wakesOf } from "../queries/store";

let pedida = false;

/**
 * «Ejecutar en»: la máquina de la tarea nueva, recordada por workspace. Elegir
 * una apagada no la enciende; la enciende enviar. Sin el workspace lo crea con
 * el mismo id; la que no puede se ve desactivada. La que no tiene permiso en
 * este workspace no sale. Un proyecto sin remoto se lleva desde su máquina
 * encendida. Con `shared`, debajo van las de la organización: estado y
 * encendido, sin elegirlas.
 */
export function MachinePicker(props: { workspace: string | null; project?: ProjectPlace; onChange?: () => void }) {
  if (!pedida) {
    pedida = true;
    void refetchMachines();
  }
  onMount(() => {
  });

  const [abierto, setAbierto] = createSignal(false);
  const [conectando, setConectando] = createSignal(false);
  const fuente = connectSource();
  const opciones = () => machines().filter((m) => (!capabilities().nativeWindow ? !m.local : true) && runsWorkspace(m));
  const elegida = () => {
    const id = runOn(props.workspace, props.project);
    return opciones().find((m) => (id ? m.id === id : m.active)) ?? (!capabilities().nativeWindow && opciones().length === 1 ? opciones()[0] : undefined);
  };
  const nombre = (m: Machine) => machineName(m.id, m.local);

  function elegir(m: Machine) {
    setAbierto(false);
    if (!props.workspace || elegida()?.id === m.id) return;
    batch(() => {
      setRunOn(props.workspace, m.active ? null : m.id);
      props.onChange?.();
    });
  }

  const razon = (m: Machine) => {
    const falta = props.workspace ? unavailable(m, props.project) : null;
    if (falta === "workspace") return { label: t("shell.machines.unlinked"), hint: t("shell.machines.unlinked_hint", { name: nombre(m) }) };
    if (falta === "project") return { label: t("shell.machines.no_project"), hint: t("shell.machines.no_project_hint", { project: props.project?.name ?? "" }) };
    return null;
  };

  const cloudInitial = () => {
    const id = rememberedRunOn(props.workspace);
    return cloudInventory() === "initial" && !!id && id !== "local" && !isGuestMachine(id) && !machines().some((m) => m.id === id);
  };
  const etiqueta = () => {
    const chosen = elegida();
    if (chosen) return nombre(chosen);
    const remembered = cloudInitial() ? rememberedRunOn(props.workspace) : null;
    const name = remembered ? machineName(remembered, false) : null;
    return name && name !== remembered ? name : t("shell.machines.label");
  };
  const muestra = () => cloudInitial() || opciones().some((m) => !m.local);
  return (
    <Show when={muestra()}>
      <Popover open={abierto()} onOpenChange={(v) => { setAbierto(v); if (v) { void refetchMachines(); } }} placement="top-start" gutter={4}>
        <PopoverTrigger
          class="flex min-h-7 max-w-[260px] items-center gap-1.5 rounded-sm px-1 text-left text-xs text-neutral-500 hover:text-neutral-950"
          aria-label={t("shell.machines.label")}
        >
          <MachineIcon wakes={elegida() ? wakesOf(elegida() as Machine) : false} size={12} />
          <span class="truncate">{etiqueta()}</span>
          <Show when={elegida()}>
            {(chosen) => <SignalDot tone={chosen().on ? "success" : "off"} />}
          </Show>
          <ChevronDown size={11} aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent class="w-[300px] overflow-hidden p-0 text-caption text-neutral-500 shadow-lg">
          <p class="m-0 border-b border-border px-2 py-1.5">{t("shell.machines.label")}</p>
          <div class="py-1">
            <For each={opciones()}>
              {(m) => (
                <Pressable
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
                </Pressable>
              )}
            </For>
          </div>
          <Show when={fuente}>
            <Pressable
              class={`${ITEM_DE_MENU} flex items-center gap-2 border-t border-border`}
              data-connect-machine-item=""
              onClick={() => {
                setAbierto(false);
                setConectando(true);
              }}
            >
              <Plus size={12} aria-hidden="true" />
              <span class="flex-1 truncate">{t("danil.connect_machine.button")}</span>
            </Pressable>
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
