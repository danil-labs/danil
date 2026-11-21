import { type Component } from "solid-js";

export interface WorkspaceErrorViewProps {
  message?: string;
  onRetry: () => void;
}

export const WorkspaceErrorView: Component<WorkspaceErrorViewProps> = (props) => {
  return (
    <div class="flex flex-col items-center gap-1 p-1 text-center" role="alert">
      <span class="text-caption text-error-strong font-medium">Error</span>
      <button
        type="button"
        onClick={() => props.onRetry()}
        class="text-caption underline text-neutral-500 hover:text-neutral-950 transition-colors"
      >
        Reintentar
      </button>
    </div>
  );
};
