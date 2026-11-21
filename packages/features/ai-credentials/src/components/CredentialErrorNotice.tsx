import { type JSX, Show } from "solid-js";
import type { ClientError } from "../model.ts";

export interface CredentialErrorNoticeProps {
  error: ClientError | unknown;
  onRetry: () => void;
  title?: string;
}

export function CredentialErrorNotice(props: CredentialErrorNoticeProps): JSX.Element {
  const errorMessage = () => {
    const err = props.error as ClientError | null;
    if (err && typeof err === "object" && "kind" in err) {
      if (err.kind === "unavailable") {
        return "El servicio de credenciales no está disponible actualmente o la ruta está pendiente en el contrato.";
      }
      if (err.kind === "unauthorized") {
        return "Tu sesión no tiene autorización para acceder a las credenciales.";
      }
      if (err.kind === "forbidden") {
        return "No tienes permisos para ver o modificar estas credenciales.";
      }
      if (err.kind === "error") {
        return err.message || `Error del servidor (${err.code})`;
      }
    }
    if (props.error instanceof Error) {
      return props.error.message;
    }
    return "Ocurrió un error inesperado al consultar las credenciales.";
  };

  return (
    <div
      role="alert"
      class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
    >
      <div class="flex items-start gap-3">
        <svg
          class="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div class="flex-1">
          <h4 class="font-semibold text-red-900 dark:text-red-200">
            {props.title ?? "Error al cargar credenciales"}
          </h4>
          <p class="mt-1 text-xs text-red-700 dark:text-red-300/90">{errorMessage()}</p>
          <div class="mt-3">
            <button
              type="button"
              onClick={() => props.onRetry()}
              class="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 dark:bg-red-700 dark:hover:bg-red-600"
            >
              <svg
                class="size-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Reintentar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
