export interface TaskErrorViewProps {
  error: unknown;
  onRetry: () => void;
}

export function TaskErrorView(props: TaskErrorViewProps) {
  const errorMessage = () => {
    if (props.error instanceof Error) return props.error.message;
    if (typeof props.error === "string") return props.error;
    return "Error al cargar los proyectos y tareas del workspace";
  };

  return (
    <div
      role="alert"
      class="flex flex-col items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50 p-6 text-center text-ui"
    >
      <div class="flex flex-col gap-1">
        <h3 class="m-0 text-sm font-semibold text-red-900">
          No se pudieron cargar los proyectos
        </h3>
        <p class="m-0 text-xs text-red-700">{errorMessage()}</p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        onClick={props.onRetry}
      >
        Reintentar
      </button>
    </div>
  );
}
