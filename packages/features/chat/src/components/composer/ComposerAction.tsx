import ArrowUp from "lucide-solid/icons/arrow-up";
import Square from "lucide-solid/icons/square";
import { Show } from "solid-js";
import { t } from "../../../../../ui/src/lib/i18n";
import { cn } from "../../../../../ui/src/lib/utils";
import { Button } from "../../../../../ui/src/Button";

/** A draft is submitted to the existing sender; busy never grants direct runtime admission. */
export function ComposerAction(props: {
  busy: boolean;
  stopping: boolean;
  hasMessage: boolean;
  canSend: boolean;
  onStop: () => void | Promise<unknown>;
}) {
  const stop = () => props.busy && !props.hasMessage;
  return <Button
    type={stop() ? "button" : "submit"}
    size="iconCompact"
    class={cn("shrink-0 rounded-full", stop() && "bg-neutral-950 text-neutral-50 hover:bg-neutral-900")}
    disabled={stop() ? props.stopping : !props.canSend || !props.hasMessage}
    aria-label={stop() ? props.stopping ? t("chat.turn.stopping_aria") : t("chat.turn.stop") : t("chat.composer.send")}
    title={stop() ? props.stopping ? t("chat.turn.stopping") : t("chat.turn.stop") : t("chat.composer.send")}
    onClick={stop() ? () => void props.onStop() : undefined}
  >
    <Show when={stop()} fallback={<ArrowUp size={16} stroke-width={2.5} />}><Square size={10} fill="currentColor" stroke-width={2} /></Show>
  </Button>;
}
