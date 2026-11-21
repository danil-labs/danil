import { type Component } from "solid-js";

export interface WorkspaceEmptyViewProps {
  onAddWorkspace?: () => void;
  message?: string;
}

export const WorkspaceEmptyView: Component<WorkspaceEmptyViewProps> = (props) => {
  return (
    <div class="p-4 my-2 rounded-lg bg-zinc-900/40 border border-zinc-800 text-zinc-400 text-xs flex flex-col items-center gap-2 text-center">
      <p class="leading-relaxed">
        {props.message || "No hay espacios de trabajo en este plan."}
      </p>
      <button
        type="button"
        onClick={() => props.onAddWorkspace?.()}
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white transition-colors font-medium"
      >
        <span>+</span>
        <span>Agregar workspace</span>
      </button>
    </div>
  );
};
