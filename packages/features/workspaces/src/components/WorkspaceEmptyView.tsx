import { type Component } from "solid-js";

export interface WorkspaceEmptyViewProps {
  onAddWorkspace?: () => void;
  message?: string;
}

export const WorkspaceEmptyView: Component<WorkspaceEmptyViewProps> = (props) => {
  return (
    <div class="flex flex-col items-center gap-2 p-2 text-center text-caption text-neutral-500">
      <p class="m-0 leading-normal">
        {props.message || "Sin espacios"}
      </p>
      <button
        type="button"
        title="Agregar workspace"
        aria-label="Agregar workspace"
        onClick={() => props.onAddWorkspace?.()}
        class="grid size-8 shrink-0 place-items-center rounded-md border border-dashed border-border text-neutral-500 outline-none hover:border-border-strong hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors text-sm"
      >
        +
      </button>
    </div>
  );
};
