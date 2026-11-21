import { Show, type Component } from "solid-js";
import { SettingsBlock, SettingsPanel, SettingsRow, SettingsSection } from "@danil/ui";
import { useProfile } from "../queries.ts";
import { BillingLink } from "../components/BillingLink.tsx";
import { HarnessLink } from "../components/HarnessLink.tsx";
import { AccountErrorView } from "../components/AccountErrorView.tsx";

export interface AccountScreenProps {
  useProfileHook?: typeof useProfile;
  class?: string;
}

function resolveErrorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return undefined;
}

/**
 * Pantalla de Ajustes > Cuenta de Danil (solo lectura).
 * Presenta el perfil del usuario, su plan activo y organización actual,
 * junto con los accesos externos a facturación y gobernanza (Harness).
 * La sección de máquinas se compone por separado en el shell (F2.1).
 */
export const AccountScreen: Component<AccountScreenProps> = (props) => {
  const profileQuery = (props.useProfileHook ?? useProfile)();

  return (
    <div
      class={`p-6 max-w-4xl text-neutral-950 dark:text-neutral-100 ${props.class ?? ""}`}
      data-danil-account="profile"
    >
      <SettingsPanel>
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
            <SettingsBlock data-account-loading="">
              <p class="m-0 text-sm text-neutral-500">Cargando cuenta…</p>
            </SettingsBlock>
          }
        >
          <Show when={profileQuery.profile()}>
            {(data) => (
              <>
                {/* Sección: Perfil del usuario */}
                <SettingsSection
                  title="Cuenta de Danil"
                  description="Identidad y credenciales sincronizadas con la plataforma."
                  data-account-profile=""
                >
                  <SettingsRow
                    lead={
                      <span
                        data-account-avatar="initials"
                        class="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-muted text-base font-semibold text-neutral-700 uppercase"
                      >
                        {(data().me.name || data().me.id).slice(0, 2).toUpperCase()}
                      </span>
                    }
                    label={data().me.name || data().me.id}
                    description={`ID: ${data().me.id}`}
                  >
                    <Show when={data().me.state}>
                      <span class="rounded border border-border bg-surface-muted px-2 py-0.5 text-xs text-neutral-600">
                        {data().me.state}
                      </span>
                    </Show>
                  </SettingsRow>
                </SettingsSection>

                {/* Sección: Plan y Organización actual */}
                <SettingsSection
                  title="Plan y suscripción"
                  description="Nivel de servicio y gestión de usuarios de la organización."
                  data-account-plan=""
                >
                  <SettingsRow
                    label={
                      <div class="flex items-center gap-2">
                        <span>{data().planLabel}</span>
                        <span class="rounded border border-border bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-700">
                          Plan activo
                        </span>
                      </div>
                    }
                    description={data().activeOrganization?.name}
                  >
                    <div class="flex items-center gap-2">
                      <BillingLink />
                      <HarnessLink />
                    </div>
                  </SettingsRow>
                </SettingsSection>
              </>
            )}
          </Show>
        </Show>
      </SettingsPanel>
    </div>
  );
};
