import { listen } from "../../lib/serviceEvents";
import Coffee from "lucide-solid/icons/coffee";
import { createSignal, For, onCleanup, Show } from "solid-js";
import { invoke } from "../../lib/invoke.ts";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import type { SignalTone } from "../../ui/SignalDot";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/Popover";

export type Mode = "on" | "agent" | "off";

export interface Status {
  mode: Mode;
  active: boolean;
  supported: boolean;
}

export const MODES: Mode[] = ["on", "agent", "off"];

export function nameOf(mode: Mode): string {
  switch (mode) {
    case "on":
      return t("shell.keep_awake.on");
    case "agent":
      return t("shell.keep_awake.agent");
    case "off":
      return t("shell.keep_awake.off");
  }
}

export function descriptionOf(mode: Mode): string {
  switch (mode) {
    case "on":
      return t("shell.keep_awake.on.description");
    case "agent":
      return t("shell.keep_awake.agent.description");
    case "off":
      return t("shell.keep_awake.off.description");
  }
}

/**
 * El modo de la computadora y cómo cambiarlo. Lo leen este control y el menú de
 * un agente en el riel: el servicio avisa a todos con `keep-awake-changed`, así
 * que cambiarlo en uno se ve en el otro.
 */
export function watchKeepAwake() {
  const [status, setStatus] = createSignal<Status | null>(null);

  void invoke<Status>("keep_awake_status").then(setStatus).catch(() => {});
  const unlisten = listen<Status>("keep-awake-changed", (e) => setStatus(e.payload));
  onCleanup(() => void unlisten.then((u) => u()));

  const choose = (mode: Mode) => {
    void invoke<Status>("set_keep_awake", { mode }).then(setStatus).catch(() => {});
  };
  return { status, choose };
}

/** Mantener la computadora despierta: siempre, mientras un agente trabaja o nunca. */
export default function KeepAwake() {
  const { status, choose: set } = watchKeepAwake();
  const [open, setOpen] = createSignal(false);

  const choose = (mode: Mode) => {
    setOpen(false);
    set(mode);
  };

  // Siempre es verde; con agentes, amarillo; apagado no dice nada.
  const tone = (): SignalTone => (status()?.mode === "on" ? "success" : status()?.mode === "agent" ? "warning" : "neutral");
  const state = () => (status()?.active ? t("shell.keep_awake.active") : t("shell.keep_awake.inactive"));
  const label = () => {
    const s = status();
    return s ? t("shell.keep_awake.aria", { mode: nameOf(s.mode), state: state() }) : t("shell.keep_awake.title");
  };

  return (
    <Show when={status()?.supported}>
      <Popover open={open()} onOpenChange={setOpen} placement="right-end" gutter={8}>
        <PopoverTrigger
          as={(p: object) => (
            <button
              {...p}
              type="button"
              class={cn(
                "grid size-8 shrink-0 place-items-center rounded-md outline-none hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary data-[expanded]:bg-surface-muted",
                "signal-icon",
              )}
              data-tone={tone()}
              aria-label={label()}
              title={label()}
            >
              <Coffee size={17} aria-hidden />
            </button>
          )}
        />
        <PopoverContent class="w-[280px] p-0">
          <div class="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <h2 class="m-0 text-xs font-semibold text-neutral-950">{t("shell.keep_awake.title")}</h2>
            <span class="text-caption text-neutral-500">
              {status() ? `${nameOf(status()!.mode)} · ${state()}` : ""}
            </span>
          </div>
          <div class="flex flex-col p-1" role="radiogroup" aria-label={t("shell.keep_awake.title")}>
            <For each={MODES}>
              {(mode) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={status()?.mode === mode}
                  class="grid w-full grid-cols-[12px_minmax(0,1fr)] items-start gap-x-2 rounded-sm px-2 py-1.5 text-left outline-none hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  onClick={() => choose(mode)}
                >
                  <span class="mt-1.5 grid place-items-center" aria-hidden>
                    <Show when={status()?.mode === mode}>
                      <span class="size-1.5 rounded-full bg-neutral-950" />
                    </Show>
                  </span>
                  <span class="min-w-0">
                    <span class="block text-ui text-neutral-950">{nameOf(mode)}</span>
                    <span class="block text-caption text-neutral-500">{descriptionOf(mode)}</span>
                  </span>
                </button>
              )}
            </For>
          </div>
        </PopoverContent>
      </Popover>
    </Show>
  );
}
