import { Show, type JSX } from "solid-js";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import Maximize2 from "lucide-solid/icons/maximize-2";
import X from "lucide-solid/icons/x";
import { t } from "../../../ui/src/lib/i18n";
import { cn } from "../../../ui/src/lib/utils";
import { HEADER_HEIGHT } from "../../../host/src/window";
import { Button } from "../../../ui/src/Button";
import { SignalDot } from "../../../ui/src/SignalDot";
import { type SubtaskTarget } from "../../../ui/src/lib/taskFiles.ts";
import { type SessionRow } from "../../../ui/src/lib/session-row.ts";
import { DelegatedPanel, type DelegatedPanelModel } from "../../../features/projects/src/screens/DelegatedTasks";
import { readableSessionTitle } from "../../../features/projects/src/screens/Sessions";

/**
 * Dedicated Subtasks panel:
 * - Overview mode: floating Danil panel listing delegated subtasks.
 * - Split-thread mode: opens the clicked subtask beside the main chat (below the untouched top bar)
 *   separated by a vertical divider, with its own independent composer aligned at the bottom.
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
              <div class={cn("flex shrink-0 items-center justify-between gap-2 border-b border-border px-2.5", HEADER_HEIGHT)}>
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
            class={cn("flex shrink-0 items-center gap-1.5 px-2.5 text-neutral-500", HEADER_HEIGHT)}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-subtask-overview=""
              class="h-6 shrink-0 gap-1 px-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-950"
              onClick={props.onShowOverview}
            >
              <ArrowLeft size={13} aria-hidden="true" />
              <span>{t("chat.delegation.overview")}</span>
            </Button>
            <span aria-hidden="true" class="shrink-0 text-neutral-500/50">/</span>
            <span
              data-subtask-tab=""
              class="min-w-0 truncate text-xs font-medium text-neutral-950"
              title={activeTitle()}
            >
              {activeTitle()}
            </span>
            <Show when={isLive()}>
              <SignalDot tone="success" />
            </Show>
            <div class="ml-auto flex shrink-0 items-center gap-0.5">
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
