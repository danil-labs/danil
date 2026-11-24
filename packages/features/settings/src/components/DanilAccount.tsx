import { Match, Show, Switch } from "solid-js";
import { capabilities } from "../../../../host/src/platform";
import { Button } from "../../../../ui/src/Button";
import { Input } from "../../../../ui/src/Input";
import { t } from "../../../../ui/src/lib/i18n";
import { SettingsBlock, SettingsPanel, SettingsRow, SettingsSection } from "../../../../ui/src/SettingsLayout";
import type { AccountProfileSource } from "../model/account-profile";
import type { SesionesDeAjustes } from "../model/sessions-port";
import { engineAccountProfile } from "../queries/account-engine";
import type { DanilConnectStatus } from "../queries/danil-account";
import { requestAccessInBrowser, TerminusLicense } from "../screens/TerminusLicense";
import { AccountIdentityBlock, createAccountIdentity } from "./AccountIdentity";
import AccountPlan from "./AccountPlan";
import { createDanilSession, DanilSignInChoices } from "./danil-session";

/** Configuración → Cuenta de Danil (respaldo cuando no hay sesiones por grupo). */
export default function DanilAccount(props: {
  workspace: string | null;
  context?: string | null;
  sesiones: SesionesDeAjustes;
}) {
  const web = capabilities().accountProfile;
  return web ? (
    <WebAccount source={web} workspace={props.workspace} context={props.context} sesiones={props.sesiones} />
  ) : (
    <SingleAccount workspace={props.workspace} context={props.context} sesiones={props.sesiones} />
  );
}

/** En la web la persona ya entró con su cuenta. */
function WebAccount(props: {
  source: AccountProfileSource;
  workspace: string | null;
  context?: string | null;
  sesiones: SesionesDeAjustes;
}) {
  const identity = createAccountIdentity(props.source);
  const canSignOut = () => Boolean(capabilities().webAccounts?.signOut);
  return (
    <SettingsPanel data-danil-account="web">
      <SettingsSection title={t("settings.account.session_title")} data-account-session="">
        <AccountIdentityBlock identity={identity} />
        <Show when={canSignOut()}>
          <SettingsRow label={identity.profile()?.email ?? capabilities().webAccounts?.current.email ?? t("danil.account.your_account")}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => capabilities().webAccounts?.signOut()}
              data-account-sign-out=""
            >
              {t("danil.account.sign_out")}
            </Button>
          </SettingsRow>
        </Show>
      </SettingsSection>
      <AccountPlan workspace={props.workspace} context={props.context} sesiones={props.sesiones} />
    </SettingsPanel>
  );
}

/**
 * Compatibilidad con el motor anterior: su única sesión pertenece a esta computadora.
 */
function SingleAccount(props: {
  workspace: string | null;
  context?: string | null;
  sesiones: SesionesDeAjustes;
}) {
  const session = createDanilSession();
  const { view, status, name, setName, busy } = session;

  return (
    <SettingsPanel data-danil-account={status()?.state ?? view().t}>
      <SettingsSection title={t("danil.account.title")} description={t("danil.account.description")}>
        <Switch>
          <Match when={view().t === "loading"}>
            <SettingsBlock>
              <p class="m-0 text-sm text-neutral-500">{t("danil.account.loading")}</p>
            </SettingsBlock>
          </Match>
          <Match when={view().t === "unavailable"}>
            <SettingsBlock>
              <p class="m-0 text-sm text-neutral-500">{t("danil.account.unavailable")}</p>
            </SettingsBlock>
          </Match>
          <Match when={status()?.state === "connected"}>
            <ConnectedIdentity status={status} />
            <SettingsRow
              label={t("danil.account.this_computer", { name: status()?.name || status()?.computer_id || "" })}
              description={status()?.online ? t("danil.account.online") : t("danil.account.offline")}
            >
              <Button size="sm" variant="secondary" disabled={busy()} onClick={() => void session.signOut()}>
                {t("danil.account.sign_out")}
              </Button>
            </SettingsRow>
          </Match>
          <Match when={status()?.state === "pending"}>
            <SettingsRow
              label={t("danil.account.pending", { code: status()?.user_code ?? "" })}
              description={t("danil.account.pending_hint")}
            >
              <Show when={status()?.verification_uri_complete}>
                <Button size="sm" variant="secondary" onClick={session.reopen}>
                  {t("danil.account.open_again")}
                </Button>
              </Show>
              <Button size="sm" variant="ghost" disabled={busy()} onClick={() => void session.signOut()}>
                {t("danil.account.cancel")}
              </Button>
            </SettingsRow>
          </Match>
          <Match when={status()}>
            <SettingsBlock>
              <label class="grid max-w-sm gap-1.5 text-ui text-neutral-500">
                {t("danil.account.name_label")}
                <Input value={name()} onInput={(e) => setName(e.currentTarget.value)} disabled={busy()} data-machine-name="" />
                <span class="text-xs">{t("danil.account.name_hint")}</span>
              </label>
              <DanilSignInChoices session={session} />
            </SettingsBlock>
          </Match>
        </Switch>
        <Show when={session.license()}>
          <SettingsBlock>
            <TerminusLicense
              onRequest={requestAccessInBrowser}
              onRetry={() => {
                void session.retry();
              }}
              busy={busy()}
            />
          </SettingsBlock>
        </Show>
        <Show when={session.message()}>
          {(text) => <p class="m-0 pt-2 text-ui text-error-strong" role="alert">{text()}</p>}
        </Show>
      </SettingsSection>
      <Show when={status()?.state === "connected"}>
        <AccountPlan workspace={props.workspace} context={props.context} sesiones={props.sesiones} />
      </Show>
    </SettingsPanel>
  );
}

/** Montado solo con sesión: pide el perfil al motor al abrir la sección. */
function ConnectedIdentity(props: { status: () => DanilConnectStatus | null }) {
  const identity = createAccountIdentity(engineAccountProfile, props.status);
  return <AccountIdentityBlock identity={identity} />;
}
