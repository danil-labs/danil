import { For, Show } from "solid-js";
import { splitMentions } from "../../../apps/desktop/src/lib/mentions";
import { capabilities } from "../../host/src/platform";
import { mentionedSession, type MentionTarget, type TaskMention } from "../../../apps/desktop/src/lib/taskMentions";
import { cn } from "../../../apps/desktop/src/lib/utils";

/**
 * Pinta un texto tratando sus menciones como entidades, no como subcadenas que
 * empiezan por arroba. Van en mono y sobre superficie, no en morado: el sistema
 * visual reserva el morado para acciones del agente, y una ruta es dato de
 * máquina.
 */
export function WithMentions(props: {
  children: string;
  class?: string;
  taskMentions?: TaskMention[];
  onOpenTask?: (folder: string, task: string) => void;
}) {
  const chunks = (): { text: string; reference: string | null; target?: MentionTarget; task?: string | null }[] => {
    const mentions = props.taskMentions ?? [];
    if (!mentions.length) return splitMentions(props.children);
    const result: { text: string; reference: string | null; target?: MentionTarget; task?: string | null }[] = [];
    let end = 0;
    for (const mention of mentions) {
      if (mention.start < end || mention.end > props.children.length ||
        props.children.slice(mention.start, mention.end) !== mention.text) continue;
      result.push(...splitMentions(props.children.slice(end, mention.start)));
      // La de otra máquina se abre con su id de panel (`elsewhere`).
      result.push({ text: mention.text, reference: mention.text, target: mention.target, task: mentionedSession(mention, capabilities().windowMachine?.()?.id ?? null) });
      end = mention.end;
    }
    result.push(...splitMentions(props.children.slice(end)));
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
                  class={cn("rounded-sm bg-surface-muted px-1 font-mono text-[0.92em] text-neutral-700", props.class)}
                  title={t.reference!}
                >
                  {t.text}
                </span>
              }
            >
              <button
                type="button"
                class={cn("cursor-pointer rounded-sm bg-surface-muted px-1 font-mono text-[0.92em] text-link hover:underline focus-visible:outline-2 focus-visible:outline-primary", props.class)}
                onClick={() => {
                  if (t.target?.kind === "task") props.onOpenTask?.(t.target.projectId, t.task ?? t.target.sessionId);
                }}
              >
                {t.text}
              </button>
            </Show>
          </Show>
        )}
      </For>
    </Show>
  );
}
