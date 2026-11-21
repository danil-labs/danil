import { type Component } from "solid-js";
import type { Workspace } from "../model.ts";

export interface WorkspaceItemProps {
  workspace: Workspace;
  isActive: boolean;
  onSelect: (workspace: Workspace) => void;
  disabled?: boolean;
}

export const WorkspaceItem: Component<WorkspaceItemProps> = (props) => {
  const monogram = () => (props.workspace.name || props.workspace.id).slice(0, 2).toUpperCase();

  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={() => props.onSelect(props.workspace)}
      class={`marca-seleccion group relative grid size-10 w-full shrink-0 place-items-center outline-none select-none ${
        props.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      }`}
      aria-current={props.isActive ? "true" : undefined}
      title={props.workspace.name || props.workspace.id}
      data-workspace-tile={props.workspace.id}
    >
      <span
        aria-hidden="true"
        class={`relative grid size-8 place-items-center rounded-md border text-label font-semibold transition-colors group-focus-visible:outline-solid group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-primary ${
          props.isActive
            ? "border-border-strong bg-surface-raised text-neutral-950 shadow-sm"
            : "border-border bg-surface text-neutral-700 hover:bg-neutral-200 hover:text-neutral-950"
        }`}
      >
        {monogram()}
      </span>
    </button>
  );
};
