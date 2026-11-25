import { type JSX, Show, createSignal } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { setMoviendoHueco } from "../../../../ui/src/lib/sites";

/** The main chat keeps at least 320 px regardless of the side panel's chosen width. */
const CHAT_ROOM = 320;

/** The right pane's width, shared by the reserved spacer in the row and the side pane itself so they never drift apart. */
export const taskFilesWidth = (splitWidth: boolean, fraction: number, treePx: number) =>
  `min(${splitWidth ? `${fraction * 100}%` : `${treePx}px`}, calc(100% - ${CHAT_ROOM}px))`;

/**
 * The task row: the chat, the full-height vertical resize seam and the room the right pane takes.
 * The right pane itself is a sibling in the panel grid, so it outlives the chat when the task is hidden.
 */
export default function TaskFilesRow(props: {
  open: boolean;
  /** The right pane covers the whole task body below the top bar: expanded files, split grid, or compact viewport. */
  covers: boolean;
  /** Proportional split width (file viewer tabs or live subtask thread) vs compact sidebar width (tree / search / list). */
  hasTabs: boolean;
  width: number;
  treeWidth: number;
  onWidth: (fraction: number) => void;
  onTreeWidth: (px: number) => void;
  /** Top bar (machine / folder / branch + task toolbar buttons), always 38 px tall (`LOCATION_BAR`). */
  location?: () => JSX.Element;
  chat: JSX.Element;
}) {
  let row: HTMLDivElement | undefined;
  const [dragging, setDragging] = createSignal(false);
  const cardStyle = () => ({ width: taskFilesWidth(props.hasTabs, props.width, props.treeWidth) });
  const move = (clientX: number) => {
    const box = row?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const most = Math.max(0, box.width - CHAT_ROOM);
    if (props.hasTabs) props.onWidth(Math.min(0.72, most / box.width, Math.max(0.32, (box.right - clientX) / box.width)));
    else props.onTreeWidth(Math.round(Math.min(Math.max(most, 240), Math.max(240, box.right - clientX))));
  };
  return (
    <div ref={row} class="relative flex h-full min-h-0 min-w-0">
      <div class="flex min-h-0 min-w-[320px] flex-1 flex-col" classList={{ hidden: props.open && props.covers }}>
        {props.location?.()}
        {props.chat}
      </div>
      <Show when={props.open && props.covers && props.location}>
        {(location) => <div class="flex min-w-0 flex-1 flex-col">{location()()}</div>}
      </Show>
      <Show when={props.open && !props.covers}>
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
          onDblClick={() => (props.hasTabs ? props.onWidth(0.5) : props.onTreeWidth(330))}
          onKeyDown={(event) => {
            const step = event.key === "ArrowLeft" ? 1 : event.key === "ArrowRight" ? -1 : 0;
            if (!step) return;
            event.preventDefault();
            if (props.hasTabs) props.onWidth(Math.min(0.72, Math.max(0.32, props.width + step * 0.02)));
            else props.onTreeWidth(Math.max(240, props.treeWidth + step * 16));
          }}>
          <span aria-hidden="true" class="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-primary opacity-0 transition-opacity duration-150 group-hover/hueco:opacity-70 group-hover/hueco:delay-150 group-focus-visible/hueco:opacity-70 group-data-[dragging]/hueco:opacity-100 group-data-[dragging]/hueco:delay-0" />
        </div>
      </Show>
      <Show when={props.open && !props.covers}>
        <div aria-hidden="true" class="shrink-0" classList={{ "transition-[width] duration-200 ease-out": !dragging() }} style={cardStyle()} />
      </Show>
    </div>
  );
}
