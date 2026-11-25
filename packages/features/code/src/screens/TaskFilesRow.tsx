import { type JSX, Show, createSignal } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { setMoviendoHueco } from "../../../../ui/src/lib/sites";
import { type TaskSideLayout } from "../../../../ui/src/lib/taskFiles";

/** The main chat keeps at least 320 px when split side-by-side with a subtask thread. */
const CHAT_ROOM = 320;

/** Width of the split subtask thread (shared by the reserved spacer and the right pane). */
export const taskFilesWidth = (splitWidth: boolean, fraction: number, treePx: number) =>
  `min(${splitWidth ? `${fraction * 100}%` : `${treePx}px`}, calc(100% - ${CHAT_ROOM}px))`;

/**
 * The task body layout below the fixed top bar:
 * - "closed" / "floating": main chat takes 100% width untouched (floating panels overlay the right edge).
 * - "replace": hides main chat while keeping the fixed top bar visible (used by Files).
 * - "split-thread": divides below the fixed 38 px top bar with a vertical resize seam between main chat and subtask thread.
 */
export default function TaskFilesRow(props: {
  layout: TaskSideLayout;
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
  const splitting = () => props.layout === "split-thread";
  const replacing = () => props.layout === "replace";
  const splitStyle = () => ({ width: taskFilesWidth(true, props.width, props.treeWidth) });
  const move = (clientX: number) => {
    const box = row?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const most = Math.max(0, box.width - CHAT_ROOM);
    props.onWidth(Math.min(0.7, most / box.width, Math.max(0.32, (box.right - clientX) / box.width)));
  };
  return (
    <div ref={row} class="flex h-full min-h-0 min-w-0 flex-col">
      {props.location?.()}
      <div class="relative flex min-h-0 min-w-0 flex-1">
        <div class="flex min-h-0 min-w-[320px] flex-1 flex-col" classList={{ hidden: replacing() }}>
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
            onDblClick={() => props.onWidth(0.5)}
            onKeyDown={(event) => {
              const step = event.key === "ArrowLeft" ? 1 : event.key === "ArrowRight" ? -1 : 0;
              if (!step) return;
              event.preventDefault();
              props.onWidth(Math.min(0.7, Math.max(0.32, props.width + step * 0.02)));
            }}>
            <span aria-hidden="true" class="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-primary opacity-0 transition-opacity duration-150 group-hover/hueco:opacity-70 group-hover/hueco:delay-150 group-focus-visible/hueco:opacity-70 group-data-[dragging]/hueco:opacity-100 group-data-[dragging]/hueco:delay-0" />
          </div>
          <div aria-hidden="true" class="shrink-0" classList={{ "transition-[width] duration-200 ease-out": !dragging() }} style={splitStyle()} />
        </Show>
      </div>
    </div>
  );
}
