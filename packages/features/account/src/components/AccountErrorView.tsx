import { type Component } from "solid-js";
import { Button, SettingsBlock } from "@danil/ui";

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
    <SettingsBlock data-danil-account-error="">
      <p class="m-0 text-sm text-error-strong" role="alert">
        {props.message ?? "No se pudieron obtener los datos de la cuenta desde la plataforma."}
      </p>
      <Button size="sm" variant="secondary" class="justify-self-start" onClick={props.onRetry}>
        Reintentar
      </Button>
    </SettingsBlock>
  );
};
