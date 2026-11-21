import { Show, type Component } from "solid-js";
import { host } from "@danil/host";
import { useProfile } from "../queries.ts";
import { ExternalLink } from "../components/ExternalLink.tsx";
import { AccountErrorView } from "../components/AccountErrorView.tsx";
import { AccountIdentityBlock } from "../components/AccountIdentity.tsx";
import { AccountCard } from "../components/AccountCard.tsx";
import { getBillingUrl, getHarnessUrl } from "../config.ts";

export interface AccountScreenProps {
  useProfileHook?: typeof useProfile;
  planLabel?: string;
  class?: string;
}

function resolveErrorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return undefined;
}

/**
 * Pantalla de Ajustes > Cuenta de Danil.
 * Presenta la identidad mediante AccountIdentityBlock y el plan/organización mediante AccountCard,
 * manteniendo paridad con apps/desktop.
 */
export const AccountScreen: Component<AccountScreenProps> = (props) => {
  const profileQuery = (props.useProfileHook ?? useProfile)();

  const handleOpenBilling = () => {
    void host.openExternal(getBillingUrl());
  };

  const handleOpenHarness = () => {
    void host.openExternal(getHarnessUrl());
  };

  return (
    <div
      class={`flex flex-col gap-6 max-w-2xl text-foreground ${props.class ?? ""}`}
      data-danil-account="profile"
    >
      <Show when={profileQuery.error()}>
        {(err) => (
          <AccountErrorView
            message={resolveErrorMessage(err())}
            onRetry={profileQuery.refetch}
          />
        )}
      </Show>

      <Show
        when={!profileQuery.loading() || profileQuery.profile()}
        fallback={
          <div class="py-6 text-sm text-neutral-400" data-account-loading="">
            Cargando cuenta...
          </div>
        }
      >
        <Show when={profileQuery.profile()}>
          {(data) => (
            <>
              {/* Sección: Perfil del usuario */}
              <section class="border-b border-border pb-5" data-account-profile="">
                <h2 class="text-base font-medium text-neutral-900 dark:text-neutral-100">
                  Cuenta de Danil
                </h2>
                <p class="text-xs text-neutral-500 mt-1">
                  Identidad y credenciales sincronizadas con la plataforma.
                </p>

                <AccountIdentityBlock
                  name={data().me.name || data().me.id}
                  email={(data().me as { email?: string }).email}
                  readonly={true}
                />
              </section>

              {/* Sección: Plan y Organización actual */}
              <section class="pb-5" data-account-plan="">
                <h3 class="text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1">
                  Plan y suscripción
                </h3>
                <p class="text-xs text-neutral-500 mb-4">
                  Nivel de servicio y gestión de usuarios de la organización.
                </p>

                <AccountCard
                  name={props.planLabel ?? data().planLabel}
                  plan="Plan activo"
                  detail={data().activeOrganization?.name}
                  active={true}
                  authenticated={true}
                  variant="row"
                  actions={
                    <div class="flex items-center gap-2">
                      <ExternalLink onOpen={handleOpenBilling} data-link="billing">
                        Administrar
                      </ExternalLink>
                      <ExternalLink onOpen={handleOpenHarness} data-link="harness">
                        Administrar usuarios y permisos
                      </ExternalLink>
                    </div>
                  }
                />
              </section>
            </>
          )}
        </Show>
      </Show>
    </div>
  );
};
