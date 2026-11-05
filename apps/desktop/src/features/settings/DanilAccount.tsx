import ExternalLink from "lucide-solid/icons/external-link";
import { createEffect, createSignal, Match, on, Show, Switch } from "solid-js";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke";
import { capabilities } from "../../lib/platform";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { engineAccountProfile, engineAccountProfileOf, profileFromStatus } from "./account-engine";
import { type AccountProfile, type AccountProfileSource, PROFILE_CHANGED } from "./account-profile";
import { AccountIdentityBlock, type AccountIdentityState, createAccountIdentity } from "./AccountIdentity";
import type { DanilConnectStatus } from "./danil-account";
import { createDanilAccounts, type DanilAccounts } from "./danil-accounts";
import { createDanilSession, DanilSignInChoices, said } from "./danil-session";
import { EmailsSection } from "./EmailsSection";
import { type DanilSessionInfo, sessionForWorkspace, sessionKey, statusOf, syncLine } from "./danil-sessions";
import { AccountComputersSection } from "../machines/AccountComputers";
import { ConnectMachineSection } from "../machines/ConnectMachine";
import { LimaMachineSection } from "../machines/LimaMachine";
import { WslMachineSection } from "../machines/WslMachine";
import { requestAccessInBrowser, TerminusLicense } from "./TerminusLicense";
import { SettingsBlock, SettingsPanel, SettingsRow, SettingsSection } from "./layout";
import { createWorkspaces } from "./workspaces-store";
import WorkspaceAccount from "./WorkspaceAccount";

/**
 * `profile`: la persona y su sesión (Cuenta › Perfil); `machines`: sus máquinas
 * (Máquinas), o la sesión mientras no hay máquinas que listar; `emails`: sus correos (solo la web).
 */
export type DanilAccountPart = "profile" | "emails" | "machines";

/** El nombre nuevo de esta computadora: Perfil lo enseña aunque se haya cambiado en Máquinas. */
const [selfRename, setSelfRename] = createSignal<{ id: string; name: string } | null>(null);
const renamedFor = (id: string | null | undefined) => {
  const r = selfRename();
  return r && id && r.id === id ? r.name : null;
};
const renameFor = (id: string | null | undefined) => (name: string) => {
  if (id) setSelfRename({ id, name });
};

/** Configuración → Cuenta de Danil. Chunk aparte: solo lo carga quien abre esta sección. */
export default function DanilAccount(props: { part?: DanilAccountPart }) {
  const web = capabilities().accountProfile;
  return web ? <WebAccount source={web} part={props.part} /> : <MachineAccount part={props.part} />;
}

/** Los correos se administran en la web de alfa (vive en la raíz del dominio), con la sesión del navegador. */
const EMAILS_URL = "https://alfa-app.danil.ai/?settings=emails";

/** Sin fuente de correos aquí (el escritorio, o la web fuera de alfa): la fila que abre la web. */
function ManageEmailsRow(props: { web?: boolean }) {
  const open = () => {
    if (props.web) window.open(EMAILS_URL, "_blank", "noopener");
    else void invoke("open_external", { target: EMAILS_URL }).catch(() => {});
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
  const workspaces = createWorkspaces();
  const emails = () => props.part === "emails" ? capabilities().accountEmails : undefined;
  return (
    <SettingsPanel data-danil-account="web">
      <Show when={props.part === "profile"}>
        <SettingsSection title={t("danil.account.title")} description={t("danil.account.web_description")}>
          <AccountIdentityBlock identity={identity} />
          <Show when={!capabilities().accountEmails}>
            <ManageEmailsRow web />
          </Show>
        </SettingsSection>
      </Show>
      <Show when={emails()}>
        {(source) => <EmailsSection source={source()} onPrimaryChanged={() => window.dispatchEvent(new CustomEvent(PROFILE_CHANGED))} />}
      </Show>
      <Show when={props.part === "machines"}>
        <Show when={workspaces.actual()} keyed>
          {(workspace) => <AccountComputersSection workspace={workspace.id} />}
        </Show>
        <ConnectMachineSection />
        <WslMachineSection />
        <LimaMachineSection />
      </Show>
    </SettingsPanel>
  );
}

/** La cuenta se resuelve por el workspace, nunca por la sesión principal de la máquina. */
function MachineAccount(props: { part?: DanilAccountPart }) {
  const workspaces = createWorkspaces();
  const accounts = createDanilAccounts({ workspace: () => workspaces.actual()?.id });
  const loadFailed = () => accounts.loadFailed() || Boolean(workspaces.fallo());
  const retry = () => void Promise.all([accounts.reload(), workspaces.cargar()]);
  const aLoadText = () => t(loadFailed() ? "danil.workspace.read_failed" : "danil.account.loading");
  return (
    <Show when={accounts.sessions() !== null} fallback={<SingleAccount part={props.part} />}>
      <Show when={accounts.sessions() !== undefined && !accounts.loadingOf() && !workspaces.cargando() && accounts.workspaceOf() === workspaces.actual()?.id && workspaces.actual()?.id} keyed fallback={
        <SettingsPanel data-danil-account={loadFailed() ? "failed" : "loading"}>
          <SettingsRow label={aLoadText()}>
            <Show when={loadFailed()}>
              <Button size="sm" variant="secondary" onClick={retry}>{t("danil.workspace.retry")}</Button>
            </Show>
          </SettingsRow>
        </SettingsPanel>
      }>
        {(id) => <WorkspacePanel workspace={{ id, name: workspaces.actual()!.name }} accounts={accounts} part={props.part} />}
      </Show>
    </Show>
  );
}

function WorkspacePanel(props: { workspace: { id: string; name: string }; accounts: DanilAccounts; part?: DanilAccountPart }) {
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
  const onlyMachines = () => props.part === "machines" && Boolean(session() && a.of()?.linked);
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
      <Show when={!onlyMachines()}>
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
              <WorkspaceAccount workspace={props.workspace.id} name={props.workspace.name} state={a} placement="section" onChanged={(problem) => { a.setProblem(problem); void a.reload(); }} />
            </SettingsBlock>
          </Show>
        </Show>
      </SettingsSection>
      </Show>
      <Show when={session() && sessionKey(session()!)} keyed>
        {(key) => (
          <>
            <Show when={!onlyMachines()}>
              <SettingsSection title={t("danil.account.title")}>
                <SessionCard session={session()!} accounts={a} computerName={renamedFor(session()?.computer_id) ?? undefined} />
                <Show when={a.problem()}>{(code) => <p class="m-0 text-sm text-error-strong" role="alert">{said(code())}</p>}</Show>
              </SettingsSection>
            </Show>
            <Show when={a.of()?.linked && props.part !== "profile"}>
              <AccountComputersSection account={key} workspace={props.workspace.id} self={session()?.computer_id} onSelfName={renameFor(session()?.computer_id)} />
              <ConnectMachineSection account={key} />
            </Show>
          </>
        )}
      </Show>
      <LocalMachines part={props.part} />
    </SettingsPanel>
  );
}

/** Una cuenta: su persona (con la foto), esta computadora en ella, y sus acciones. */
function SessionCard(props: { session: DanilSessionInfo; accounts: DanilAccounts; computerName?: string }) {
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
        label={t("danil.account.this_computer", { name: props.computerName || s().computer_name || s().computer_id || "" })}
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
function SingleAccount(props: { part?: DanilAccountPart }) {
  const session = createDanilSession();
  const { view, status, name, setName, busy } = session;
  const onlyMachines = () => props.part === "machines" && status()?.state === "connected";

  return (
    <SettingsPanel data-danil-account={status()?.state ?? view().t}>
      <Show when={!onlyMachines()}>
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
              label={t("danil.account.this_computer", { name: renamedFor(status()?.computer_id) || status()?.name || status()?.computer_id || "" })}
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
      </Show>
      <Show when={status()?.state === "connected" && props.part !== "profile"}>
        <AccountComputersSection self={status()?.computer_id ?? null} onSelfName={renameFor(status()?.computer_id)} />
        <ConnectMachineSection />
      </Show>
      <LocalMachines part={props.part} />
    </SettingsPanel>
  );
}

/** Linux en esta Mac o PC: es local y no pide cuenta de Danil. */
function LocalMachines(props: { part?: DanilAccountPart }) {
  return (
    <Show when={props.part !== "profile"}>
      <WslMachineSection />
      <LimaMachineSection />
    </Show>
  );
}

/** Montado solo con sesión: pide el perfil al motor al abrir la sección. */
function ConnectedIdentity(props: { status: () => DanilConnectStatus | null }) {
  const identity = createAccountIdentity(engineAccountProfile, props.status);
  return <AccountIdentityBlock identity={identity} />;
}
