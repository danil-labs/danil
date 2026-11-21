import { type Component } from "solid-js";

export interface WorkspaceErrorViewProps {
  message?: string;
  onRetry: () => void;
}

export const WorkspaceErrorView: Component<WorkspaceErrorViewProps> = (props) => {
  return (
    <div class="p-3 my-2 rounded-lg bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex flex-col gap-2">
      <div class="flex items-center gap-1.5 font-medium">
        <svg class="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>Error de conexión</span>
      </div>
      <p class="text-red-300/90 leading-relaxed">
        {props.message || "No se pudo sincronizar la información. Comprueba la red y vuelve a intentarlo."}
      </p>
      <button
        type="button"
        onClick={() => props.onRetry()}
        class="self-start px-2.5 py-1 rounded bg-red-800/80 hover:bg-red-700 text-white font-medium transition-colors"
      >
        Reintentar
      </button>
    </div>
  );
};
