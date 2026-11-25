import { For, Show } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { formatearDuracion } from "../../../../ui/src/lib/steps";
import { Markdown } from "../../../../ui/src/Markdown";
import type { Razonamiento } from "../model/messageTypes";

/** Reasoning belongs to the turn's single activity disclosure. */
export default function Reasoning(props: { bloques: Razonamiento[] }) {
  const durationMs = () => props.bloques.reduce((acc, b) => acc + (b.durationMs ?? 0), 0);
  const title = () =>
    durationMs() > 0
      ? t("chat.reasoning.summary", { duration: formatearDuracion(durationMs()) })
      : t("chat.reasoning.title");
  return (
    <section class="px-1 py-2" data-reasoning-content="">
      <h4 class="m-0 mb-1 text-xs font-medium text-neutral-500">{title()}</h4>
      <div class="grid gap-2 text-sm text-neutral-500 select-text">
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
    </section>
  );
}
