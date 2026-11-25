import { Show, type JSX } from "solid-js";
import X from "lucide-solid/icons/x";
import { t } from "../../../ui/src/lib/i18n";
import { cn } from "../../../ui/src/lib/utils";
import { HEADER_HEIGHT } from "../../../host/src/window";
import { Button } from "../../../ui/src/Button";
import { SignalDot } from "../../../ui/src/SignalDot";
import { type SubtaskTarget } from "../../../ui/src/lib/taskFiles.ts";
import { type SessionRow } from "../../../ui/src/lib/session-row.ts";
import { type DelegatedPanelModel } from "../../../features/projects/src/screens/DelegatedTasks";
import { readableSessionTitle } from "../../../features/projects/src/screens/Sessions";

/**
 * Docked Subtask thread beside the main chat (below the fixed top bar):
 * shows only the subtask title (+ live indicator) and a close button, with its own independent composer.
 */
export default function SubtaskSidePanel(props: {
  model: () => DelegatedPanelModel | undefined;
  subtask: SubtaskTarget | null;
  live: readonly string[];
  filaDe: (id: string) => SessionRow | undefined;
  onClose: () => void;
  renderThread: (target: SubtaskTarget) => JSX.Element;
}) {
  const activeRow = () => {
    const target = props.subtask;
    if (!target) return undefined;
    return props.model()?.rows.find((row) => row.id === target.session) ?? props.filaDe(target.session);
  };
  const activeTitle = () => readableSessionTitle(activeRow()?.title ?? "");
  const isLive = () => {
    const target = props.subtask;
    return !!target && props.live.includes(target.session);
  };

  return (
    <Show when={props.subtask}>
      {(target) => (
        <div data-subtask-thread={target().session} class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface">
          <div
            data-subtask-bar=""
            class={cn("flex shrink-0 items-center gap-1.5 px-3 text-neutral-500", HEADER_HEIGHT)}
          >
            <span
              data-subtask-title=""
              class="min-w-0 truncate text-xs font-medium text-neutral-950"
              title={activeTitle()}
            >
              {activeTitle()}
            </span>
            <Show when={isLive()}>
              <SignalDot tone="success" />
            </Show>
            <Button
              type="button"
              variant="ghost"
              size="iconCompact"
              data-subtask-close=""
              class="ml-auto size-6 shrink-0 text-neutral-500"
              title={t("chat.delegation.close_panel")}
              aria-label={t("chat.delegation.close_panel")}
              onClick={props.onClose}
            >
              <X size={14} />
            </Button>
          </div>
          <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {props.renderThread(target())}
          </div>
        </div>
      )}
    </Show>
  );
}
