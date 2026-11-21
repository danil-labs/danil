import ExternalLink from "lucide-solid/icons/external-link";
import { Show, type JSX } from "solid-js";
import {
  Button,
  SettingsBlock,
  SettingsPanel,
  SettingsRow,
  SettingsSection,
} from "@danil/ui";

export interface AccountSectionProps {
  slot?: JSX.Element;
  part: "profile" | "emails" | "usage" | "plan";
  onOpenBilling?: () => void;
  onOpenEmails?: () => void;
}

export function AccountSection(props: AccountSectionProps) {
  return (
    <Show when={props.slot && props.part === "profile"} fallback={<FallbackAccountPart {...props} />}>
      {props.slot}
    </Show>
  );
}

function FallbackAccountPart(props: AccountSectionProps) {
  if (props.part === "profile") {
    return (
      <SettingsPanel data-danil-account="profile">
        <SettingsSection
          title="Cuenta de Danil"
          description="Identidad y credenciales sincronizadas con la plataforma."
        >
          <SettingsRow
            label="Perfil de usuario"
            description="Sesión activa en Danil"
          />
        </SettingsSection>
        <SettingsSection
          title="Plan y suscripción"
          description="Nivel de servicio y gestión de usuarios."
        >
          <SettingsRow
            label="Plan activo"
            description="Administra los detalles de facturación en la consola web."
          >
            <Button
              size="sm"
              variant="secondary"
              onClick={() => props.onOpenBilling?.()}
            >
              Administrar
            </Button>
          </SettingsRow>
        </SettingsSection>
      </SettingsPanel>
    );
  }

  if (props.part === "emails") {
    return (
      <SettingsPanel data-danil-account="emails">
        <SettingsSection
          title="Correos"
          description="Direcciones de correo vinculadas a tu cuenta."
        >
          <SettingsRow
            label="Administrar correos"
            description="Agrega o cambia la dirección principal de tu cuenta en la web."
            data-account-emails-link=""
          >
            <Button
              size="sm"
              variant="secondary"
              onClick={() => props.onOpenEmails?.()}
            >
              <ExternalLink size={14} class="mr-1.5" />
              Administrar
            </Button>
          </SettingsRow>
        </SettingsSection>
      </SettingsPanel>
    );
  }

  if (props.part === "usage") {
    return (
      <SettingsPanel data-danil-account="usage">
        <SettingsSection
          title="Uso y consumo"
          description="Estadísticas de uso de agentes, computación y llamadas a modelos."
        >
          <SettingsBlock>
            <p class="m-0 text-sm text-neutral-500">
              No hay métricas de consumo registradas en esta sesión.
            </p>
          </SettingsBlock>
        </SettingsSection>
      </SettingsPanel>
    );
  }

  if (props.part === "plan") {
    return (
      <SettingsPanel data-danil-account="plan">
        <SettingsSection
          title="Plan"
          description="Nivel de suscripción actual."
        >
          <SettingsRow
            label="Mejorar plan"
            description="Cambia a un plan con mayor capacidad de máquinas y límites ampliados."
          >
            <Button
              size="sm"
              variant="secondary"
              onClick={() => props.onOpenBilling?.()}
            >
              Mejorar plan
            </Button>
          </SettingsRow>
        </SettingsSection>
      </SettingsPanel>
    );
  }

  return null;
}
