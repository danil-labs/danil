import { For, Show } from "solid-js";
import { splitMentions, type TaskMention } from "./mentions.ts";

export type ChunkEntity = {
  text: string;
  reference: string | null;
  target?: TaskMention["target"];
  task?: string | null;
};

/**
 * Pinta un texto tratando sus menciones como entidades interactivas.
 * Paridad con apps/desktop/src/features/chat/WithMentions.tsx.
 */
export function WithMentions(props: {
  children: string;
  class?: string;
  taskMentions?: TaskMention[];
  onOpenTask?: (folder: string, task: string) => void;
}) {
  const chunks = (): ChunkEntity[] => {
    const mentions = props.taskMentions ?? [];
    if (!mentions.length) {
      return splitMentions(props.children).map((c) => ({
        text: c.text,
        reference: c.reference,
      }));
    }
    const result: ChunkEntity[] = [];
    let end = 0;
    for (const mention of mentions) {
      if (
        mention.start < end ||
        mention.end > props.children.length ||
        props.children.slice(mention.start, mention.end) !== mention.text
      )
        continue;
      for (const m of splitMentions(props.children.slice(end, mention.start))) {
        result.push({ text: m.text, reference: m.reference });
      }
      result.push({
        text: mention.text,
        reference: mention.text,
        target: mention.target,
        task: mention.target?.kind === "task" ? mention.target.sessionId : null,
      });
      end = mention.end;
    }
    for (const m of splitMentions(props.children.slice(end))) {
      result.push({ text: m.text, reference: m.reference });
    }
    return result;
  };

  const hasReferences = () => chunks().some((t) => t.reference);

  return (
    <Show when={hasReferences()} fallback={props.children}>
      <For each={chunks()}>
        {(t) => (
          <Show when={t.reference} fallback={<span>{t.text}</span>}>
            <Show
              when={t.target?.kind === "task" && props.onOpenTask ? t.target : null}
              fallback={
                <span
                  class={`rounded-sm bg-surface-muted px-1 font-mono text-[0.92em] text-neutral-700 ${props.class ?? ""}`}
                  title={t.reference!}
                >
                  {t.text}
                </span>
              }
            >
              {(target) => (
                <button
                  type="button"
                  class={`cursor-pointer rounded-sm bg-surface-muted px-1 font-mono text-[0.92em] text-link hover:underline focus-visible:outline-2 focus-visible:outline-primary ${props.class ?? ""}`}
                  onClick={() => {
                    if (target().kind === "task")
                      props.onOpenTask?.(target().projectId, t.task ?? target().sessionId);
                  }}
                >
                  {t.text}
                </button>
              )}
            </Show>
          </Show>
        )}
      </For>
    </Show>
  );
}
