import { type Component, type ComponentProps, type JSX, type ParentProps, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { HandoffPresentation } from "../../../../../ui/src/lib/handoff.ts";
import { t } from "../../../../../../apps/desktop/src/lib/i18n";
import Adjuntos from "../Attachments";

export function handoffStatus(handoff: NonNullable<HandoffPresentation>): string {
  switch (handoff.phase) {
    case "waiting-close": return t("chat.activity.preparing");
    case "submitting": return t("chat.activity.preparing");
    case "awaiting-start": return t("chat.activity.preparing");
  }
}

/** Queue owns pending text; once dispatch begins the transcript owns its optimistic message. */
export function PendingHandoff(props: {
  handoff: HandoffPresentation;
  bubble: Component<ParentProps>;
  userClass: string;
  showStatus?: boolean;
  miniatura: ComponentProps<typeof Adjuntos>["miniatura"];
  preview?: ComponentProps<typeof Adjuntos>["preview"];
  renderPdf: (props: { base64: string; name: string }) => JSX.Element;
}) {
  const pending = () => props.handoff?.phase === "waiting-close" ? props.handoff.pendingMessage : null;
  const visible = () => props.handoff && (props.handoff.phase === "waiting-close" || props.showStatus !== false) ? props.handoff : null;
  return <Show when={visible()}>{handoff => <section class="col-start-1 min-w-0" data-chat-handoff={handoff().phase}>
    <Show when={pending()}>{message => <div class={props.userClass} data-pending-handoff-input="">
      <Dynamic component={props.bubble}>
        <Show when={message().attachments}>{attachments => <Adjuntos rels={Array.from(attachments())} miniatura={props.miniatura} preview={props.preview} renderPdf={props.renderPdf} />}</Show>
        <p class="m-0 leading-[1.5] break-words whitespace-pre-wrap">{message().text}</p>
      </Dynamic>
    </div>}</Show>
    <Show when={props.showStatus !== false}><p class="m-0 mt-2 text-caption text-neutral-500" role="status">{handoffStatus(handoff())}</p></Show>
  </section>}</Show>;
}
