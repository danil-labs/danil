import { Show, type JSX } from "solid-js";
import List from "lucide-solid/icons/list";
import Maximize2 from "lucide-solid/icons/maximize-2";
import MessageSquare from "lucide-solid/icons/message-square";
import X from "lucide-solid/icons/x";
import { t } from "../../../ui/src/lib/i18n";
import { cn } from "../../../ui/src/lib/utils";
import { LOCATION_BAR } from "../../../host/src/window";
import { Button } from "../../../ui/src/Button";
import { SignalDot } from "../../../ui/src/SignalDot";
import { type SubtaskTarget } from "../../../ui/src/lib/taskFiles.ts";
import { type SessionRow } from "../../../ui/src/lib/session-row.ts";
import { DelegatedPanel, type DelegatedPanelModel } from "../../../features/projects/src/screens/DelegatedTasks";
import { readableSessionTitle } from "../../../features/projects/src/screens/Sessions";

/**
 * Dedicated Subtasks side panel, scoped exclusively to subtasks:
 * - Overview mode: lists delegated subtasks of the parent task.
 * - Split-thread mode (`cappy.ai` style): clicking a subtask renders its live conversation
 *   inline beside the main chat with a matching 38 px (`LOCATION_BAR`) header and aligned composer.
 */
export default function SubtaskSidePanel(props: {
  model: () => DelegatedPanelModel | undefined;
  subtask: SubtaskTarget | null;
  live: readonly string[];
  filaDe: (id: string) => SessionRow | undefined;
  onOpenSubtask: (folder: string, id: string) => void;
  onShowOverview: () => void;
  onOpenInTab: (folder: string, id: string) => void;
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
    <Show
      when={props.subtask}
      fallback={
        <Show
          when={props.model()}
          fallback={
            <div class="flex h-full min-h-0 flex-1 flex-col">
              <div class={cn("flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-2.5", LOCATION_BAR)}>
                <span class="min-w-0 truncate text-xs font-medium">{t("chat.delegation.overview")}</span>
                <Button variant="ghost" size="iconCompact" class="size-6 text-neutral-500" title={t("chat.delegation.close_panel")} aria-label={t("chat.delegation.close_panel")} onClick={props.onClose}>
                  <X size={14} />
                </Button>
              </div>
              <p class="m-0 px-3 py-3 text-xs text-neutral-500">{t("chat.delegation.none")}</p>
            </div>
          }
        >
          <DelegatedPanel model={props.model} onOpenSubtask={props.onOpenSubtask} />
        </Show>
      }
    >
      {(target) => (
        <div data-subtask-thread={target().session} class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface">
          <div
            data-subtask-bar=""
            class={cn("flex shrink-0 items-center gap-1.5 border-b border-border/60 px-2.5", LOCATION_BAR)}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-subtask-overview=""
              class="h-7 shrink-0 gap-1.5 px-2 text-xs font-medium text-neutral-600 hover:text-neutral-950"
              onClick={props.onShowOverview}
            >
              <List size={13} aria-hidden="true" />
              <span>{t("chat.delegation.overview")}</span>
            </Button>
            <div
              data-subtask-tab=""
              class="flex h-7 min-w-0 max-w-[60%] items-center gap-1.5 rounded-md border border-border/80 bg-surface-muted px-2 text-xs font-medium text-neutral-950"
              title={activeTitle()}
            >
              <MessageSquare size={12} class="shrink-0 text-neutral-500" aria-hidden="true" />
              <span class="min-w-0 truncate">{activeTitle()}</span>
              <Show when={isLive()}>
                <SignalDot tone="success" />
              </Show>
            </div>
            <div class="ml-auto flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="iconCompact"
                data-subtask-expand=""
                class="size-6 text-neutral-500"
                title={t("chat.delegation.open_tab")}
                aria-label={t("chat.delegation.open_tab")}
                onClick={() => props.onOpenInTab(target().project, target().session)}
              >
                <Maximize2 size={13} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="iconCompact"
                data-subtask-close=""
                class="size-6 text-neutral-500"
                title={t("chat.delegation.close_panel")}
                aria-label={t("chat.delegation.close_panel")}
                onClick={props.onClose}
              >
                <X size={14} />
              </Button>
            </div>
          </div>
          <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {props.renderThread(target())}
          </div>
        </div>
      )}
    </Show>
  );
}
