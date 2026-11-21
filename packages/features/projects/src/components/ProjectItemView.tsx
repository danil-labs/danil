import { For, Show, createSignal } from "solid-js";
import type { ProjectItem, TaskRecord } from "../model.ts";
import { TaskItemView } from "./TaskItemView.tsx";

export interface ProjectItemViewProps {
  project: ProjectItem;
  tasks: TaskRecord[];
  selectedTaskId?: string;
  onSelectTask?: (task: TaskRecord) => void;
  onDeleteTask?: (task: TaskRecord) => void;
}

export function ProjectItemView(props: ProjectItemViewProps) {
  const [expanded, setExpanded] = createSignal(true);

  return (
    <div class="flex flex-col rounded-lg border border-neutral-200 bg-surface shadow-xs">
      <button
        type="button"
        class="flex items-center justify-between gap-3 p-3 text-left hover:bg-neutral-50/70 transition-colors focus:outline-none"
        onClick={() => setExpanded(!expanded())}
      >
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-xs text-neutral-400 font-mono">
            {expanded() ? "▼" : "▶"}
          </span>
          <div class="flex flex-col min-w-0">
            <span class="truncate text-xs font-semibold text-neutral-900">
              {props.project.name}
            </span>
            <Show when={props.project.directory}>
              <span class="truncate text-[11px] text-neutral-500 font-mono">
                {props.project.directory}
              </span>
            </Show>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <span class="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
            {props.tasks.length} {props.tasks.length === 1 ? "tarea" : "tareas"}
          </span>
        </div>
      </button>

      <Show when={expanded()}>
        <div class="flex flex-col gap-1.5 border-t border-neutral-100 p-2.5 bg-neutral-50/30">
          <Show
            when={props.tasks.length > 0}
            fallback={
              <p class="m-0 py-2 text-center text-xs text-neutral-400">
                Sin tareas en este proyecto
              </p>
            }
          >
            <For each={props.tasks}>
              {(task) => (
                <TaskItemView
                  task={task}
                  isSelected={props.selectedTaskId === task.id}
                  onSelect={props.onSelectTask}
                  onDelete={props.onDeleteTask}
                />
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );
}
