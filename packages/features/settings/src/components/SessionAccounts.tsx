import { createMemo, createResource, createSignal, Show } from "solid-js";
import { capabilities } from "../../../../host/src/platform";
import { Button } from "../../../../ui/src/Button";
import { t } from "../../../../ui/src/lib/i18n";
import { SettingsBlock, SettingsPanel, SettingsRow, SettingsSection } from "../../../../ui/src/SettingsLayout";
import { resolveAccountGroup } from "../model/account-plan";
import type { AccountProfile, AccountProfileSource } from "../model/account-profile";
import type { SesionesDeAjustes } from "../model/sessions-port";
import { AccountAvatar, createAccountIdentity } from "./AccountIdentity";
import AccountPlan from "./AccountPlan";

/**
 * Pantalla unificada de Configuración → Cuenta (Desk y Web).
 * Muestra la sesión iniciada con «Cerrar sesión» (o acceso para iniciar sesión
 * cuando no hay sesión en Desk) y el bloque de Plan solo para `admin` / `owner`.
 */
export default function SessionAccounts(props: {
  workspace: string | null;
  context?: string | null;
  sesiones: SesionesDeAjustes;
}) {
  const { noteWebAccountMode, sessionRailState } = props.sesiones;
  const rail = sessionRailState;

  createResource(
    () => (!capabilities().nativeWindow ? capabilities().groupAccount : undefined),
    async (source) => {
      if (!source) return null;
      const group = await source.current().catch(() => null);
      noteWebAccountMode();
      return group;
    },
  );

  const groups = () => rail()?.groups() ?? [];
  const activeGroup = createMemo(
    () => resolveAccountGroup(groups(), { workspace: props.workspace, context: props.context ?? null }) ?? groups()[0] ?? null,
  );

  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const run = async (action: () => Promise<unknown> | unknown) => {
    if (busy()) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(
        (cause as { detail?: string } | null)?.detail === "too_many_contexts"
          ? "danil.error.too_many_contexts"
          : "shell.workspaces.sessions_failed",
      );
    } finally {
      setBusy(false);
    }
  };

  const signOutDesk = () =>
    run(async () => {
      const group = activeGroup();
      if (!group) return;
      await rail()?.sessions.closeEmail(group.email, group.family);
    });

  const signInDesk = () =>
    run(async () => {
      await rail()?.sessions.addAccount();
    });

  const webProfileSource = () => capabilities().accountProfile;

  return (
    <SettingsPanel data-session-accounts="">
      <SettingsSection title={t("settings.account.session_title")} data-account-session="">
        <Show
          when={capabilities().nativeWindow}
          fallback={
            <WebSessionRow
              source={webProfileSource()}
              busy={busy()}
              onSignOut={() => void run(() => capabilities().webAccounts?.signOut())}
            />
          }
        >
          <Show
            when={activeGroup()}
            fallback={
              <SettingsRow label={t("danil.accounts.empty")}>
                <Show when={rail()?.sessions.addAccount}>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy()}
                    onClick={() => void signInDesk()}
                    data-account-sign-in=""
                  >
                    {t("danil.account.sign_in")}
                  </Button>
                </Show>
              </SettingsRow>
            }
          >
            {(group) => (
              <SettingsRow
                label={
                  <span class="truncate" data-account-email="">
                    {group().email ?? t("danil.account.your_account")}
                  </span>
                }
              >
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy()}
                  onClick={() => void signOutDesk()}
                  data-account-sign-out=""
                >
                  {t("danil.account.sign_out")}
                </Button>
              </SettingsRow>
            )}
          </Show>
        </Show>
        <Show when={error()}>
          {(key) => (
            <SettingsBlock>
              <p role="alert" class="m-0 text-caption text-error-strong">
                {t(key())}
              </p>
            </SettingsBlock>
          )}
        </Show>
      </SettingsSection>
      <AccountPlan workspace={props.workspace} context={props.context} sesiones={props.sesiones} />
    </SettingsPanel>
  );
}

function WebSessionRow(props: {
  source?: AccountProfileSource;
  busy: boolean;
  onSignOut: () => void;
}) {
  const identity = props.source ? createAccountIdentity(props.source) : null;
  const current = () => capabilities().webAccounts?.current;
  const profile = (): AccountProfile | null => {
    const loaded = identity?.profile();
    if (loaded) return loaded;
    const web = current();
    if (!web) return null;
    return { name: web.name, email: web.email, photo: null, source: null };
  };
  const displayName = () => profile()?.name || profile()?.email || t("danil.account.your_account");
  const secondaryEmail = () => (profile()?.name && profile()?.email ? profile()!.email : null);
  const canSignOut = () => Boolean(capabilities().webAccounts?.signOut);

  return (
    <div class="flex min-w-0 items-center justify-between gap-3 py-3.5" data-account-identity={profile()?.photo ? "photo" : "initials"}>
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <AccountAvatar profile={profile()} class="size-10 text-sm" />
        <div class="grid min-w-0 flex-1 gap-[2px]">
          <div class="min-w-0 truncate text-sm font-semibold text-neutral-950" data-account-name="">
            {displayName()}
          </div>
          <Show when={secondaryEmail()}>
            {(email) => (
              <div class="min-w-0 truncate text-ui text-neutral-500" data-account-email="">
                {email()}
              </div>
            )}
          </Show>
        </div>
      </div>
      <Show when={canSignOut()}>
        <Button
          size="sm"
          variant="secondary"
          disabled={props.busy}
          onClick={() => props.onSignOut()}
          data-account-sign-out=""
        >
          {t("danil.account.sign_out")}
        </Button>
      </Show>
    </div>
  );
}
