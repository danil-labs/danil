import { Show, type Component } from "solid-js";
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
              <section class="border-b border-zinc-800 pb-5" data-account-profile="">
                <h2 class="text-base font-medium text-zinc-100">Cuenta de Danil</h2>
                <p class="text-xs text-zinc-400 mt-1">
                  Identidad y credenciales sincronizadas con la plataforma.
                </p>

                <div class="mt-4 flex items-center justify-between py-3 border-t border-zinc-800/60">
                  <div class="flex flex-col gap-0.5">
                    <span class="text-sm font-medium text-zinc-200">
                      {data().me.name || data().me.id}
                    </span>
                    <span class="text-xs text-zinc-500 font-mono">
                      ID: {data().me.id}
                    </span>
                  </div>
                  <Show when={data().me.state}>
                    <span class="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                      {data().me.state}
                    </span>
                  </Show>
                </div>
              </section>

              {/* Sección: Plan y Organización actual */}
              <section class="border-b border-zinc-800 pb-5" data-account-plan="">
                <h3 class="text-sm font-medium text-zinc-200">Plan y suscripción</h3>
                <p class="text-xs text-zinc-400 mt-1">
                  Nivel de servicio y gestión de usuarios de la organización.
                </p>

                <div class="mt-4 flex flex-col gap-3">
                  <div class="flex items-center justify-between py-3 border-t border-zinc-800/60">
                    <div class="flex flex-col gap-0.5">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-zinc-100">
                          {data().planLabel}
                        </span>
                        <span class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                          Plan activo
                        </span>
                      </div>
                      <Show when={data().activeOrganization?.name}>
                        <span class="text-xs text-zinc-400 mt-0.5">
                          {data().activeOrganization?.name}
                        </span>
                      </Show>
                    </div>
                    <div class="flex items-center gap-2">
                      <BillingLink />
                      <HarnessLink />
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}
        </Show>
      </Show>
    </div>
  );
};
