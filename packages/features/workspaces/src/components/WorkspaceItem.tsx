import { type Component } from "solid-js";
import type { Workspace } from "../model.ts";

export interface WorkspaceItemProps {
  workspace: Workspace;
  isActive: boolean;
  onSelect: (workspace: Workspace) => void;
  disabled?: boolean;
}

export const WorkspaceItem: Component<WorkspaceItemProps> = (props) => {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={() => props.onSelect(props.workspace)}
      class={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors text-left ${
        props.isActive
          ? "bg-zinc-800 text-white shadow-sm"
          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
      } ${props.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      title={props.workspace.name || props.workspace.id}
    >
      <div class="flex items-center gap-2 min-w-0">
        <span
          class={`w-2 h-2 rounded-full shrink-0 transition-colors ${
            props.isActive ? "bg-emerald-400" : "bg-zinc-600"
          }`}
        />
        <span class="truncate">
          {props.workspace.name || `Workspace ${props.workspace.id}`}
        </span>
      </div>
      {props.workspace.role ? (
        <span class="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-700/60 shrink-0">
          {props.workspace.role}
        </span>
      ) : null}
    </button>
  );
};
