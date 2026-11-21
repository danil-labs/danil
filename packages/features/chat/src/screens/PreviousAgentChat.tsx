import { Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Button } from "../../../../ui/src/Button";

/** Ocupa el sitio de la caja en un chat anterior del agente, que es de solo lectura. */
export default function PreviousAgentChat(props: { name: string | null; onContinue?: () => void }) {
  return (
    <div data-previous-agent-chat class="flex w-full max-w-[860px] items-center justify-between gap-3 p-3 text-sm">
      <p class="m-0 text-neutral-500">
        <Show when={props.name} fallback={t("chat.previous_chat.note_unnamed")}>
          {(name) => t("chat.previous_chat.note", { agent: name() })}
        </Show>
      </p>
      <Show when={props.name && props.onContinue ? props.name : null}>
        {(name) => (
          <Button variant="secondary" size="sm" onClick={() => props.onContinue?.()}>
            {t("chat.previous_chat.continue", { agent: name() })}
          </Button>
        )}
      </Show>
    </div>
  );
}
