import { type Accessor, createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { df } from "../lib/format";
import { t } from "../lib/i18n";
import { SignalDot } from "../ui/SignalDot";
import { Toast, ToastPortal } from "../ui/Toast";
/** On, off, starting or speaking another contract: what the page says of a machine. */
export type MachineStatus = "online" | "offline" | "starting" | "outdated";

export type MachineRow = { id: string; name: string; status: MachineStatus; at: number | null };

const LABELS: Record<MachineStatus, () => string> = {
  online: () => t("web.computers.state.online"),
  starting: () => t("web.computers.state.starting"),
  offline: () => t("web.computers.state.offline"),
  outdated: () => t("web.computers.state.outdated"),
};

/** Lo que dura el aviso a la vista antes de cerrarse solo. */
const VISIBLE_MS = 6000;
/** Al recargar, el estado de las máquinas se asienta sin avisar. */
const SETTLE_MS = 20_000;

const signature = (rows: MachineRow[]) => rows.map((m) => `${m.id}:${m.status}`).join("|");

/**
 * On, off, starting or needing an update; none of them is an error. The state
 * shows as a normal toast when it changes after loading, closes by itself and
 * can be closed by hand. A hidden list keeps the current state for screen
 * readers.
 */
export function SyncNote(props: { machines: Accessor<MachineRow[]>; unavailable?: boolean }) {
  const [open, setOpen] = createSignal(Boolean(props.unavailable));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settledAt = Date.now() + SETTLE_MS;
  const close = () => {
    clearTimeout(timer);
    setOpen(false);
  };
  createEffect(
    on(
      () => signature(props.machines()),
      (now, before) => {
        if (!now || now === before || Date.now() < settledAt) return;
        clearTimeout(timer);
        setOpen(true);
        timer = setTimeout(() => setOpen(false), VISIBLE_MS);
      },
    ),
  );
  // La falta de acceso o de servicio se ve al llegar, aunque el aviso naciera sin ella, y se va al volver una lista válida.
  createEffect(
    on(
      () => Boolean(props.unavailable),
      (now, before) => {
        if (before === undefined || now === before) return;
        clearTimeout(timer);
        setOpen(true);
        if (!now) timer = setTimeout(() => setOpen(false), VISIBLE_MS);
      },
    ),
  );
  onCleanup(() => clearTimeout(timer));

  const tip = (m: MachineRow) =>
    m.status !== "online" && m.at ? t("web.sync.last", { time: df({ dateStyle: "short", timeStyle: "short" }).format(m.at) }) : undefined;
  const rows = (marked: boolean) => (
    <For each={props.machines()}>
      {(m) => (
        <li class="flex min-w-0 items-center gap-1.5" data-machine-row={marked ? m.id : undefined} data-state={marked ? m.status : undefined} title={tip(m)}>
          <SignalDot tone={m.status === "online" ? "success" : m.status === "outdated" ? "warning" : m.status === "starting" ? "neutral" : "off"} pulse={m.status === "starting"} />
          <span class="truncate">{m.name}</span>
          <span class="shrink-0">· {LABELS[m.status]()}</span>
        </li>
      )}
    </For>
  );

  return (
    <>
      <ul
        role="status"
        data-web-sync=""
        data-state={props.machines()[0]?.status}
        title={props.machines().length === 1 ? tip(props.machines()[0]) : undefined}
        class="sr-only"
      >
        {rows(true)}
      </ul>
      <Show when={open() && (props.unavailable || props.machines().length)}>
        <ToastPortal>
          <Toast data-web-sync-toast="" onDismiss={close}>
            <Show when={props.unavailable}><p class="m-0 text-ui" role="status" data-machines-unavailable="">{t("web.machines.unavailable")}</p></Show>
            <ul class="m-0 flex list-none flex-col gap-0.5 p-0 text-xs text-neutral-500" aria-hidden="true">
              {rows(false)}
            </ul>
          </Toast>
        </ToastPortal>
      </Show>
    </>
  );
}
