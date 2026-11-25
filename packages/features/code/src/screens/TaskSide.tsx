import { type JSX, Match, Show, Switch, createEffect, onCleanup } from "solid-js";
import { taskSidePanelKind, type TaskDockMode, type TaskPopoverMode, type TaskSideLayout } from "../../../../ui/src/lib/taskFiles";
import { cn } from "../../../../ui/src/lib/utils";

/**
 * Right-side docked panel frame beside the main chat (below the fixed top bar):
 * - Files ("files-split" / "files-expanded"): floating Danil card frame aligned with the composer.
 * - Subtask thread ("subtask-split" / "subtask-full"): full-height vertical split separated by a clean border line.
 */
export function TaskSideShell(props: { dock: TaskDockMode; layout: TaskSideLayout; subtaskSlot: JSX.Element; children: JSX.Element }) {
  const isSubtask = () => props.dock === "subtask";
  const sideMode = (): "delegated" | "files" => (isSubtask() ? "delegated" : "files");
  return (
    <section
      data-task-files
      data-task-side={sideMode()}
      data-task-panel={taskSidePanelKind(sideMode())}
      data-task-layout={props.layout}
      class={cn(
        "@container relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-surface",
        isSubtask()
          ? "border-l border-border"
          : "rounded-lg border border-border shadow-md",
      )}
    >
      <div class="flex h-full min-h-0 min-w-0 flex-1" classList={{ hidden: props.dock !== "files" }}>
        {props.children}
      </div>
      <Show when={props.dock === "subtask"}>
        <div class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {props.subtaskSlot}
        </div>
      </Show>
    </section>
  );
}

/**
 * Compact floating popover anchored below the fixed top-right toolbar buttons.
 * Never occupies the full viewport height: sizes to its content up to a scrollable max height.
 */
export function TaskPopoverShell(props: {
  popover: Exclude<TaskPopoverMode, "none">;
  onDismiss?: () => void;
  children: JSX.Element;
}) {
  let root: HTMLElement | undefined;
  const mode = () => (props.popover === "subtasks" ? "delegated" : props.popover) as "search" | "usage" | "delegated";
  createEffect(() => {
    const dismiss = props.onDismiss;
    if (!dismiss || props.popover === "search") return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (root?.contains(target) || target.closest("[data-task-toolbar]")) return;
      dismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      dismiss();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    });
  });
  return (
    <section
      ref={root}
      data-task-popover={props.popover}
      data-task-side={mode()}
      data-task-panel={taskSidePanelKind(mode())}
      data-task-layout="popover"
      class="flex max-h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-md"
    >
      {props.children}
    </section>
  );
}

export function TaskSide(props: {
  popover: TaskPopoverMode;
  searchSlot: JSX.Element;
  usageSlot: JSX.Element;
  delegatedSlot: JSX.Element;
}) {
  return (
    <Switch>
      <Match when={props.popover === "search"}>
        {props.searchSlot}
      </Match>
      <Match when={props.popover === "usage"}>
        {props.usageSlot}
      </Match>
      <Match when={props.popover === "subtasks"}>
        {props.delegatedSlot}
      </Match>
    </Switch>
  );
}
