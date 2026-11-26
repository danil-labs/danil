import { type JSX, Show, createSignal } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { setMoviendoHueco } from "../../../../ui/src/lib/sites";
import { type TaskSideLayout } from "../../../../ui/src/lib/taskFiles";
import { cn } from "../../../../ui/src/lib/utils";

/** The main chat keeps at least 320 px when split side-by-side with a right-hand panel. */
const CHAT_ROOM = 320;

/** Width of the docked right pane (shared by the animated spacer and the right panel wrapper). */
export const taskFilesWidth = (splitWidth: boolean, fraction: number, treePx: number) =>
  `min(${splitWidth ? `${fraction * 100}%` : `${treePx}px`}, calc(100% - ${CHAT_ROOM}px))`;

/** Shared fluid push-drawer easing curve so the chat spacer and side panel always move in lockstep. */
export const PANEL_SLIDE_TRANSITION = "transition-[width] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

/**
 * The task body layout below the fixed top bar:
 * - "closed": spacer collapses smoothly to `0px`, returning main chat to 100% width.
 * - "files-split" / "subtask-split" / "panel-split": animated spacer smoothly pushes the main chat
 *   aside while a vertical resize handle separates the chat from the docked right-hand panel.
 * - "files-expanded" / "subtask-full" / "panel-full": hides main chat while keeping the fixed top bar visible.
 */
export default function TaskFilesRow(props: {
  layout: TaskSideLayout;
  /** True when the docked right pane uses proportional fraction width (file viewer tabs or subtask thread); false for fixed px width. */
  splitWidth: boolean;
  width: number;
  treeWidth: number;
  onWidth: (fraction: number) => void;
  onTreeWidth: (px: number) => void;
  /** Fixed 38 px top location bar (machine / project / branch); never moves across modes. */
  location?: () => JSX.Element;
  chat: JSX.Element;
}) {
  let row: HTMLDivElement | undefined;
  const [dragging, setDragging] = createSignal(false);
  const splitting = () => props.layout === "files-split" || props.layout === "subtask-split" || props.layout === "panel-split";
  const replacing = () => props.layout === "files-expanded" || props.layout === "subtask-full" || props.layout === "panel-full";
  const spacerStyle = () => ({
    width: splitting() ? taskFilesWidth(props.splitWidth, props.width, props.treeWidth) : "0px",
  });
  const move = (clientX: number) => {
    const box = row?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const most = Math.max(0, box.width - CHAT_ROOM);
    if (props.splitWidth) {
      props.onWidth(Math.min(0.7, most / box.width, Math.max(0.32, (box.right - clientX) / box.width)));
    } else {
      props.onTreeWidth(Math.min(Math.min(560, most), Math.max(220, box.right - clientX)));
    }
  };
  return (
    <div ref={row} class="flex h-full min-h-0 min-w-0 flex-col">
      {props.location?.()}
      <div class="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div class="flex min-h-0 min-w-0 flex-1 flex-col" classList={{ hidden: replacing() }}>
          {props.chat}
        </div>
        <Show when={splitting()}>
          <div role="separator" tabindex={0} aria-orientation="vertical" aria-label={t("code.panel.resize")}
            data-dragging={dragging() ? "" : undefined}
            class="group/hueco relative z-40 -mx-1.5 w-3 shrink-0 cursor-ew-resize touch-none outline-none"
            onPointerDown={(event) => {
              event.preventDefault();
              const handle = event.currentTarget;
              handle.setPointerCapture(event.pointerId);
              setDragging(true);
              setMoviendoHueco(true);
              const follow = (e: PointerEvent) => move(e.clientX);
              const release = () => {
                setDragging(false);
                setMoviendoHueco(false);
                handle.removeEventListener("pointermove", follow);
                handle.removeEventListener("pointerup", release);
                handle.removeEventListener("pointercancel", release);
              };
              handle.addEventListener("pointermove", follow);
              handle.addEventListener("pointerup", release);
              handle.addEventListener("pointercancel", release);
            }}
            onDblClick={() => (props.splitWidth ? props.onWidth(0.5) : props.onTreeWidth(280))}
            onKeyDown={(event) => {
              const step = event.key === "ArrowLeft" ? 1 : event.key === "ArrowRight" ? -1 : 0;
              if (!step) return;
              event.preventDefault();
              if (props.splitWidth) props.onWidth(Math.min(0.7, Math.max(0.32, props.width + step * 0.02)));
              else props.onTreeWidth(Math.min(560, Math.max(220, props.treeWidth + step * 20)));
            }}>
            <span aria-hidden="true" class="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-primary opacity-0 transition-opacity duration-150 group-hover/hueco:opacity-70 group-hover/hueco:delay-150 group-focus-visible/hueco:opacity-70 group-data-[dragging]/hueco:opacity-100 group-data-[dragging]/hueco:delay-0" />
          </div>
        </Show>
        {/* Always mounted so CSS smoothly animates 0px <-> panel width on open, switch, and close. */}
        <div
          aria-hidden="true"
          data-panel-spacer=""
          class={cn("shrink-0", !dragging() && PANEL_SLIDE_TRANSITION)}
          style={spacerStyle()}
        />
      </div>
    </div>
  );
}
