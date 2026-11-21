import { Show, type JSX } from "solid-js";
import type { Side as PanelSide } from "../../../../../apps/desktop/src/lib/panels";
import type { DragPoint } from "../../../../../apps/desktop/src/lib/pointer-drag";
import { cn } from "../../../../../apps/desktop/src/lib/utils";

export function DragOverlay(props: {
  dragging: boolean;
  cursor: DragPoint | null;
  title: string;
  split: boolean;
  hasDestination: boolean;
  targetStyle: JSX.CSSProperties | undefined;
  side: PanelSide | null;
}) {
  return (
    <>
      <Show when={props.dragging && props.cursor !== null}>
        <div
          aria-hidden="true"
          class="pointer-events-none fixed z-[60] max-w-[220px] truncate rounded-sm border border-border-strong bg-surface-raised px-2 py-1 text-sm font-medium text-neutral-950 shadow-md"
          style={{
            left: `${props.cursor!.x + 12}px`,
            top: `${props.cursor!.y + 12}px`,
          }}
        >
          {props.title}
        </div>
      </Show>
      <Show when={props.split && props.dragging && props.hasDestination}>
        <Show
          when={props.side}
          fallback={
            <div
              aria-hidden="true"
              class="pointer-events-none z-50 rounded-sm border-2 border-primary/70 bg-primary/5"
              style={props.targetStyle}
            />
          }
        >
          {(side) => (
            <div
              aria-hidden="true"
              class="pointer-events-none relative z-50"
              style={props.targetStyle}
            >
              <div
                class={cn(
                  "absolute rounded-sm border-2 border-primary/70 bg-primary/5",
                  side() === "left" && "inset-y-0 left-0 w-1/2",
                  side() === "right" && "inset-y-0 right-0 w-1/2",
                  side() === "up" && "inset-x-0 top-0 h-1/2",
                  side() === "down" && "inset-x-0 bottom-0 h-1/2",
                )}
              />
            </div>
          )}
        </Show>
      </Show>
    </>
  );
}
