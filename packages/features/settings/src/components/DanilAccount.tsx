import ExternalLink from "lucide-solid/icons/external-link";
import { createEffect, createSignal, Match, on, Show, Switch } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { openExternal } from "../queries/engine-open";
import { capabilities } from "../../../../host/src/platform";
import { Button } from "../../../../ui/src/Button";
import { Input } from "../../../../ui/src/Input";
import { engineAccountProfile, engineAccountProfileOf, profileFromStatus } from "../queries/account-engine";
import { type AccountProfile, type AccountProfileSource, PROFILE_CHANGED } from "../model/account-profile";
import { AccountIdentityBlock, type AccountIdentityState, createAccountIdentity } from "./AccountIdentity";
import type { DanilConnectStatus } from "../queries/danil-account";
import { createDanilAccounts, type DanilAccounts } from "../queries/danil-accounts";
import { createDanilSession, DanilSignInChoices, said } from "./danil-session";
import { EmailsSection } from "./EmailsSection";
import { type DanilSessionInfo, sessionForWorkspace, sessionKey, statusOf, syncLine } from "../queries/danil-sessions";
import type { MaquinasDeAjustes } from "../model/machines-port";
import { requestAccessInBrowser, TerminusLicense } from "../screens/TerminusLicense";
import { SettingsBlock, SettingsPanel, SettingsRow, SettingsSection } from "../../../../ui/src/SettingsLayout";
import { createWorkspaces } from "../queries/workspaces-store";
import WorkspaceAccount from "./WorkspaceAccount";
import type { SesionesDeAjustes } from "../model/sessions-port";

/**
 * `profile`: la persona y su sesión (Cuenta › Perfil); `emails`: sus correos (solo la web).
 */
export type DanilAccountPart = "profile" | "emails";

/** Configuración → Cuenta de Danil. Chunk aparte: solo lo carga quien abre esta sección. */
export default function DanilAccount(props: { part?: DanilAccountPart; maquinas: MaquinasDeAjustes; sesiones: SesionesDeAjustes }) {
  const web = capabilities().accountProfile;
  return web ? <WebAccount source={web} part={props.part} /> : <MachineAccount maquinas={props.maquinas} sesiones={props.sesiones} />;
}

/** Los correos se administran en la web de alfa (vive en la raíz del dominio), con la sesión del navegador. */
const EMAILS_URL = "https://alfa-app.danil.ai/?settings=emails";

/** Sin fuente de correos aquí (el escritorio, o la web fuera de alfa): la fila que abre la web. */
function ManageEmailsRow(props: { web?: boolean }) {
  const open = () => {
    if (props.web) window.open(EMAILS_URL, "_blank", "noopener");
    else void openExternal({ target: EMAILS_URL }).catch(() => {});
  };
  return (
    <SettingsRow label={t("danil.emails.manage_label")} description={t("danil.emails.manage_description")} data-account-emails-link="">
      <Button size="sm" variant="secondary" onClick={open}>
        <ExternalLink size={14} />
        {t("danil.emails.manage")}
      </Button>
    </SettingsRow>
  );
}

/** En la web la persona ya entró con su cuenta. Perfil se monta de nuevo al volver a su pestaña, así que relee un principal cambiado en Correos. */
function WebAccount(props: { source: AccountProfileSource; part?: DanilAccountPart }) {
  const identity = createAccountIdentity(props.source);
  const emails = () => props.part === "emails" ? capabilities().accountEmails : undefined;
  return (
    <SettingsPanel data-danil-account="web">
      <Show when={props.part === "profile"}>
        <SettingsSection title={t("danil.account.title")} description={t("danil.account.web_description")}>
          <AccountIdentityBlock identity={identity} />
        </SettingsSection>
      </Show>
      <Show when={emails()}>
        {(source) => <EmailsSection source={source()} onPrimaryChanged={() => window.dispatchEvent(new CustomEvent(PROFILE_CHANGED))} />}
      </Show>
    </SettingsPanel>
  );
}

/** La cuenta se resuelve por el workspace, nunca por la sesión principal de la máquina. */
function MachineAccount(props: { maquinas: MaquinasDeAjustes; sesiones: SesionesDeAjustes }) {
  const workspaces = createWorkspaces();
  const accounts = createDanilAccounts({ workspace: () => workspaces.actual()?.id, machines: props.maquinas.machines });
  const loadFailed = () => accounts.loadFailed() || Boolean(workspaces.fallo());
  const retry = () => void Promise.all([accounts.reload(), workspaces.cargar()]);
  const aLoadText = () => t(loadFailed() ? "danil.workspace.read_failed" : "danil.account.loading");
  return (
    <Show when={accounts.sessions() !== null} fallback={<SingleAccount />}>
      <Show when={accounts.sessions() !== undefined && !accounts.loadingOf() && !workspaces.cargando() && accounts.workspaceOf() === workspaces.actual()?.id && workspaces.actual()?.id} keyed fallback={
        <SettingsPanel data-danil-account={loadFailed() ? "failed" : "loading"}>
          <SettingsRow label={aLoadText()}>
            <Show when={loadFailed()}>
              <Button size="sm" variant="secondary" onClick={retry}>{t("danil.workspace.retry")}</Button>
            </Show>
          </SettingsRow>
        </SettingsPanel>
      }>
        {(id) => <WorkspacePanel workspace={{ id, name: workspaces.actual()!.name }} accounts={accounts} maquinas={props.maquinas} sesiones={props.sesiones} />}
      </Show>
    </Show>
  );
}

function WorkspacePanel(props: { workspace: { id: string; name: string }; accounts: DanilAccounts; maquinas: MaquinasDeAjustes; sesiones: SesionesDeAjustes }) {
  const a = props.accounts;
  const [manage, setManage] = createSignal(false);
  const session = () => a.of()?.signed_in ? sessionForWorkspace(a.sessions(), a.of()) : null;
  let shownAccount: string | null | undefined;
  createEffect(() => {
    const s = session();
    const key = s ? sessionKey(s) : null;
    if (key === shownAccount) return;
    shownAccount = key;
    setManage(false);
  });
  const line = () => syncLine(a.of(), a.sessions());
  const description = () => {
    const l = line();
    if (l.kind === "synced") return t("danil.workspace.synced", { email: l.email });
    if (l.kind === "unlinked") return t("danil.workspace.unlinked", { email: l.email });
    if (l.kind === "none") return t("danil.workspace.no_account");
    return l.email ? t("danil.workspace.unsynced_account", { email: l.email }) : t("danil.workspace.unsynced");
  };
  return (
    <SettingsPanel data-danil-account="workspace">
      <SettingsSection title={t("danil.here.title", { name: props.workspace.name })} data-danil-here="">
        <Show when={a.of()} fallback={
          <SettingsRow label={t("danil.workspace.read_failed")}>
            <Button size="sm" variant="secondary" onClick={() => void a.reload()}>{t("danil.workspace.retry")}</Button>
          </SettingsRow>
        }>
          <SettingsRow label={t("danil.workspace.title")} description={description()}>
            <Button size="sm" variant="secondary" aria-expanded={manage()} onClick={() => setManage(!manage())} data-danil-manage="">
              {manage() ? t("danil.workspace.done") : a.of()?.account ? t("danil.workspace.manage") : t("danil.workspace.connect")}
            </Button>
          </SettingsRow>
          <Show when={manage()}>
            <SettingsBlock>
              <WorkspaceAccount workspace={props.workspace.id} name={props.workspace.name} state={a} placement="section" maquinas={props.maquinas} sesiones={props.sesiones} onChanged={(problem) => { a.setProblem(problem); void a.reload(); }} />
            </SettingsBlock>
          </Show>
        </Show>
      </SettingsSection>
      <Show when={session() && sessionKey(session()!)} keyed>
        {(_key) => (
          <SettingsSection title={t("danil.account.title")}>
            <SessionCard session={session()!} accounts={a} />
            <Show when={a.problem()}>{(code) => <p class="m-0 text-sm text-error-strong" role="alert">{said(code())}</p>}</Show>
          </SettingsSection>
        )}
      </Show>
    </SettingsPanel>
  );
}

/** Una cuenta: su persona (con la foto), esta computadora en ella, y sus acciones. */
function SessionCard(props: { session: DanilSessionInfo; accounts: DanilAccounts }) {
  const key = sessionKey(props.session) as string;
  const s = () => props.session;
  const identity = createAccountIdentity(engineAccountProfileOf(key), undefined, {
    watch: () => [s().photo, s().name, s().email],
  });
  // Mientras el motor contesta, la persona sale de la lista.
  const [listed, setListed] = createSignal<AccountProfile | null>(null);
  createEffect(on(s, (session) => void profileFromStatus(statusOf(session)).then(setListed).catch(() => {})));
  const shown: AccountIdentityState = { ...identity, profile: () => identity.profile() ?? listed() ?? null };
  /** Cerrar la sesión deja sin sincronizar todos sus workspaces de aquí: se confirma antes. */
  const [asking, setAsking] = createSignal(false);
  const state = () =>
    t("danil.accounts.row", {
      status: s().online ? t("danil.accounts.online") : t("danil.accounts.offline"),
      workspaces: t("danil.accounts.workspaces", { count: s().workspaces.length }),
    });

  return (
    <div class="grid border-b border-border last:border-b-0" data-danil-session={key} data-default={s().default ? "" : undefined}>
      <AccountIdentityBlock identity={shown} />
      <ManageEmailsRow />
      <SettingsRow
        label={t("danil.account.this_computer", { name: s().computer_name || s().computer_id || "" })}
        description={state()}
      >
        <Show when={!asking()}>
          <Button size="sm" variant="secondary" disabled={props.accounts.busy()} onClick={() => setAsking(true)} data-danil-sign-out="">
            {t("danil.account.sign_out")}
          </Button>
        </Show>
      </SettingsRow>
      <Show when={asking()}>
        <SettingsRow label={t("danil.accounts.sign_out_confirm", { count: s().workspaces.length })} data-danil-sign-out-confirm="">
          <Button
            size="sm"
            variant="secondary"
            disabled={props.accounts.busy()}
            onClick={() => {
              setAsking(false);
              void props.accounts.signOut(key);
            }}
            data-danil-sign-out-yes=""
          >
            {t("danil.account.sign_out")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
            {t("danil.workspace.leave_no")}
          </Button>
        </SettingsRow>
      </Show>
    </div>
  );
}

/**
 * Compatibilidad con el motor anterior: su única sesión pertenece a esta computadora.
 */
function SingleAccount() {
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
            <ManageEmailsRow />
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
    </SettingsPanel>
  );
}

/** Montado solo con sesión: pide el perfil al motor al abrir la sección. */
function ConnectedIdentity(props: { status: () => DanilConnectStatus | null }) {
  const identity = createAccountIdentity(engineAccountProfile, props.status);
  return <AccountIdentityBlock identity={identity} />;
}
