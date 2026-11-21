import { Show } from "solid-js";
import type { TaskRecord } from "../model.ts";

export interface TaskItemViewProps {
  task: TaskRecord;
  isSelected?: boolean;
  onSelect?: (task: TaskRecord) => void;
  onDelete?: (task: TaskRecord) => void;
}

export function TaskItemView(props: TaskItemViewProps) {
  const statusColor = () => {
    switch (props.task.status) {
      case "running":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "completed":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "failed":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-neutral-100 text-neutral-700 border-neutral-200";
    }
  };

  return (
    <div
      class={`group flex items-center justify-between gap-3 rounded-md border p-2.5 transition-colors ${
        props.isSelected
          ? "border-primary bg-primary/5"
          : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50/50"
      }`}
    >
      <button
        type="button"
        class="flex min-w-0 flex-1 flex-col text-left focus:outline-none"
        onClick={() => props.onSelect?.(props.task)}
      >
        <span class="truncate text-xs font-medium text-neutral-900">
          {props.task.title || props.task.id}
        </span>
        <div class="mt-0.5 flex items-center gap-2 text-[11px] text-neutral-500">
          <span class="truncate font-mono">{props.task.id}</span>
          <Show when={props.task.updatedAt}>
            <span>·</span>
            <span>{props.task.updatedAt}</span>
          </Show>
        </div>
      </button>

      <div class="flex items-center gap-2">
        <span
          class={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize ${statusColor()}`}
        >
          {props.task.status}
        </span>

        <Show when={props.onDelete}>
          <button
            type="button"
            title="Eliminar tarea"
            class="opacity-0 group-hover:opacity-100 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-red-600 transition-opacity focus:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              props.onDelete?.(props.task);
            }}
          >
            <span class="text-xs font-semibold">✕</span>
          </button>
        </Show>
      </div>
    </div>
  );
}
