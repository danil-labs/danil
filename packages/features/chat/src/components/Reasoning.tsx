import Brain from "lucide-solid/icons/brain";
import ChevronRight from "lucide-solid/icons/chevron-right";
import { For, Show } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { formatearDuracion } from "../../../../ui/src/lib/steps";
import { cn } from "../../../../ui/src/lib/utils";
import { Markdown } from "../../../../ui/src/Markdown";
import { Pressable } from "../../../../ui/src/Pressable";
import { Spinner } from "../../../../ui/src/Spinner";
import type { Razonamiento } from "../model/messageTypes";
import { createRowSignal } from "../model/threadRow";
import { HUECO_DE_GLIFO } from "./StepGlyph";
import { reasoningHeadline, withEllipsis } from "../model/activityNarration";

/** Reasoning renders as a collapsible row matching tool rows inside the turn's activity disclosure. */
export default function Reasoning(props: { bloques: Razonamiento[]; slot?: string; active?: boolean }) {
  const [openMap, setOpenMap] = createRowSignal<Record<string, boolean>>("reasoning", {});
  const slotKey = () => props.slot ?? "0";
  const open = () => Boolean(openMap()[slotKey()]);
  const toggle = () => setOpenMap({ ...openMap(), [slotKey()]: !open() });
  const durationMs = () => props.bloques.reduce((acc, b) => acc + (b.durationMs ?? 0), 0);
  const headline = () => reasoningHeadline(props.bloques, { latest: Boolean(props.active), allowSentence: false });
  const label = () => {
    const title = headline();
    if (title) return props.active ? withEllipsis(title) : title;
    if (props.active) return t("chat.reasoning.thinking");
    return durationMs() > 0
      ? t("chat.reasoning.row_duration", { duration: formatearDuracion(durationMs()) })
      : t("chat.reasoning.row");
  };
  return (
    <div class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0.5" data-reasoning-content="">
      <div role="listitem">
        <Pressable
          data-fila
          aria-expanded={open()}
          onClick={toggle}
          class="flex w-full min-w-0 items-center gap-2 rounded-sm px-1 py-1.5 text-left text-xs hover:bg-surface-muted"
        >
          <ChevronRight
            size={12}
            class={cn("shrink-0 text-neutral-500 transition-transform", open() && "rotate-90")}
            aria-hidden="true"
          />
          <Show
            when={props.active}
            fallback={
              <span class={HUECO_DE_GLIFO}>
                <Brain size={12} aria-hidden="true" />
              </span>
            }
          >
            <span class={HUECO_DE_GLIFO}>
              <Spinner size={12} class="text-primary" />
            </span>
          </Show>
          <span class="min-w-0 truncate font-medium text-neutral-700">{label()}</span>
          <Show when={headline() && !props.active && durationMs() > 0}>
            <span class="shrink-0 text-caption text-neutral-500">· {formatearDuracion(durationMs())}</span>
          </Show>
        </Pressable>
        <Show when={open()}>
          <div class="ml-5 grid gap-2 border-l border-border py-1 pl-3 text-sm text-neutral-500 select-text" data-reasoning-body="">
            <For each={props.bloques}>
              {(block) => (
                <div class="min-w-0">
                  <Markdown>{block.text}</Markdown>
                  <Show when={block.truncated}>
                    <p class="m-0 pt-1 text-caption text-neutral-500 italic">{t("chat.timeline.output.truncated")}</p>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
