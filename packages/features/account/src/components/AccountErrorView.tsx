import { type Component } from "solid-js";

export interface AccountErrorViewProps {
  message?: string;
  onRetry: () => void;
}

/**
 * Vista de error para fallos al consultar la cuenta o el perfil.
 * Incluye acción explícita de reintento.
 */
export const AccountErrorView: Component<AccountErrorViewProps> = (props) => {
  return (
    <div
      class="rounded-md border border-red-900/50 bg-red-950/20 p-4 text-xs"
      role="alert"
      data-danil-account-error=""
    >
      <div class="text-red-400 font-semibold mb-1">Error al consultar perfil</div>
      <p class="m-0 text-red-300 text-xs mb-3">
        {props.message ?? "No se pudieron obtener los datos de la cuenta desde la plataforma."}
      </p>
      <button
        type="button"
        onClick={props.onRetry}
        class="px-2.5 py-1 text-xs font-medium rounded border border-red-700/60 bg-red-900/30 text-red-200 hover:bg-red-800/40 transition-colors cursor-pointer"
      >
        Reintentar
      </button>
    </div>
  );
};
