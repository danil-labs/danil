import ArrowDown from "lucide-solid/icons/arrow-down";
import ArrowUp from "lucide-solid/icons/arrow-up";
import { createEffect, For, Show } from "solid-js";
import { df } from "../../lib/format";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { HEADER_HEIGHT } from "../../lib/window";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { groupSearchHits, type SearchHit } from "./searchCards";
import type { SearchSurface } from "./ThreadSearch";

const clock = (at: number) => df({ hour: "numeric", minute: "2-digit" }).format(new Date(at));
const dayLabel = (at: number) => df({ day: "numeric", month: "short", year: "numeric" }).format(new Date(at));

const who = (hit: SearchHit) => hit.speaker || (hit.role === "user" ? t("chat.search.you") : t("chat.search.agent"));

/** Header and match cards of the task search, inside the files window. */
export default function SearchPanel(props: { surface: SearchSurface }) {
  let list: HTMLDivElement | undefined;
  createEffect(() => {
    const index = props.surface.selected();
    list?.querySelector(`[data-search-hit="${index}"]`)?.scrollIntoView({ block: "nearest" });
  });
  const groups = () => groupSearchHits(props.surface.cards());
  return (
    <>
      <div class={cn("flex shrink-0 items-center gap-1 border-b border-border px-1.5", HEADER_HEIGHT)} role="search" aria-label={t("chat.search.label")}>
        <Input ref={(el) => props.surface.bindInput(el)} class="h-7 min-h-0 flex-1 py-0 text-xs focus-visible:border-border-strong focus-visible:outline-none" value={props.surface.query()}
          placeholder={t("chat.search.placeholder")} aria-label={t("chat.search.label")}
          onInput={(event) => props.surface.setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); props.surface.move(event.shiftKey ? -1 : 1); }
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); props.surface.close(); }
          }} />
        <span class="shrink-0 text-xs text-neutral-500" role="status" aria-live="polite">{props.surface.status()}</span>
        <Button variant="chrome" size="iconCompact" class="size-6" disabled={!props.surface.cards().length} title={t("chat.search.previous")} aria-label={t("chat.search.previous")} onClick={() => props.surface.move(-1)}><ArrowUp size={14} /></Button>
        <Button variant="chrome" size="iconCompact" class="size-6" disabled={!props.surface.cards().length} title={t("chat.search.next")} aria-label={t("chat.search.next")} onClick={() => props.surface.move(1)}><ArrowDown size={14} /></Button>
      </div>
      <div ref={list} class="min-h-0 flex-1 overflow-y-auto p-2">
        <Show when={props.surface.query() && props.surface.cards().length === 0}>
          <p class="m-0 px-2 py-3 text-xs text-neutral-500">{t("chat.search.empty")}</p>
        </Show>
        <For each={groups()}>{(group) => (
          <section>
            <Show when={group.day !== null && group.at != null}>
              <h3 class="m-0 px-1 pt-2 pb-1 text-xs font-medium text-neutral-500">{dayLabel(group.at!)}</h3>
            </Show>
            <div class="flex flex-col gap-1.5">
              <For each={group.items}>{(item) => {
                const on = () => props.surface.selected() === item.index;
                return (
                  <button type="button" data-search-hit={item.index} aria-current={on()}
                    aria-label={t("chat.search.match", { current: item.index + 1, total: props.surface.cards().length })}
                    class={cn("rounded-md border px-2.5 py-2 text-left", on() ? "border-primary bg-surface-muted" : "border-border hover:bg-surface-muted")}
                    onClick={() => props.surface.choose(item.index)}>
                    <span class="flex items-baseline justify-between gap-2">
                      <span class="min-w-0 truncate text-xs font-semibold text-neutral-950">{who(item.hit)}</span>
                      <Show when={item.hit.at != null}>
                        <time class="shrink-0 text-xs text-neutral-500" dateTime={new Date(item.hit.at!).toISOString()}>{clock(item.hit.at!)}</time>
                      </Show>
                    </span>
                    <p class="m-0 mt-1 text-sm leading-5 break-words text-neutral-950">
                      {item.hit.before}<mark class="rounded-sm bg-warning/20 px-0.5 text-neutral-950">{item.hit.mark}</mark>{item.hit.after}
                    </p>
                  </button>
                );
              }}</For>
            </div>
          </section>
        )}</For>
      </div>
    </>
  );
}
