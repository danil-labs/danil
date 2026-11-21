import { type Accessor, createSignal, For, Show } from "solid-js";
import { t } from "../lib/i18n";
import { SignalDot } from "../../../../packages/ui/src/SignalDot";
import { Toast, ToastPortal } from "../../../../packages/ui/src/Toast";
/** On, off, starting or speaking another contract: what the page says of a machine. */
export type MachineStatus = "online" | "offline" | "starting" | "outdated";

export type MachineRow = { id: string; name: string; status: MachineStatus; at: number | null };

/** The state of each machine stays in the page, hidden and silent: no live region, no notice. */
export function MachineStates(props: { machines: Accessor<MachineRow[]> }) {
  return (
    <ul class="sr-only" data-web-sync="">
      <For each={props.machines()}>{(m) => <li data-machine-row={m.id} data-state={m.status}>{m.name}</li>}</For>
    </ul>
  );
}

/**
 * Machines that cannot be listed are said once, and the person can close it.
 * A machine turning on or off says nothing: its state lives in the rail, the
 * header and «Run on».
 */
export function MachinesUnavailableNote(props: { unavailable?: boolean }) {
  const [open, setOpen] = createSignal(true);
  return (
    <Show when={open() && props.unavailable}>
      <ToastPortal>
        <Toast data-web-sync-toast="" onDismiss={() => setOpen(false)}>
          <p class="m-0 text-ui" role="status" data-machines-unavailable="">{t("web.machines.unavailable")}</p>
        </Toast>
      </ToastPortal>
    </Show>
  );
}
