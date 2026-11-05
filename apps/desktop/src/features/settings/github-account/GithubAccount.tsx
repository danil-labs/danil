import {
  type GithubCredential,
  type GithubInstallation,
  githubAuthorizeOf,
  githubCredentialOf,
  githubInstallationsOf,
  githubStatusOf,
} from "@terminus/computers";
import { t } from "../../../lib/i18n";
import { invoke } from "../../../lib/invoke.ts";
import GitHostAccount, { type AccountCredential, type GitHostAccountAdapter, type GitHostAccountMode, type GitHostAccountState } from "./GitHostAccount";
import { githubAccountCode, githubAccountFailureOf, notHere, silent } from "./failures.ts";

/**
 * GitHub en la cuenta de Danil: la conexión es de la persona y Danil refleja
 * dónde está instalada la App. La ventana habla con su motor (`github_account_*`);
 * la web, con el Worker (`web/github-account.ts`). El panel es el común
 * (`GitHostAccount.tsx`); aquí queda lo de GitHub: instalaciones e `install_url`.
 */

export type GithubAccountMode = GitHostAccountMode;
export type GithubAccountState = GitHostAccountState;

const credentialOf = (c: GithubCredential): AccountCredential => ({
  id: c.id,
  status: c.status,
  config: { login: c.config.login, name: c.config.name },
  machines: c.machines,
});

const scopeOf = (i: GithubInstallation) =>
  i.repository_selection === "all"
    ? t("providers.github.account.scope_all")
    : i.repository_selection === "selected" && i.repository_count !== null
      ? t("providers.github.account.scope_count", { count: i.repository_count })
      : t("providers.github.account.scope_some");

export const GITHUB_ACCOUNT: GitHostAccountAdapter = {
  provider: "github",
  attr: "github",
  copy: {
    more_actions: () => t("providers.github.more_actions"),
    check: () => t("providers.github.check_connection"),
    disconnect: () => t("providers.github.disconnect"),
    disconnect_confirm: () => t("providers.github.account.disconnect_confirm"),
    reauthorize_badge: () => t("providers.github.account.reauthorize_badge"),
    reauthorize: () => t("providers.github.account.reauthorize"),
    reconnect: () => t("providers.github.account.reconnect"),
    license_badge: () => t("providers.github.account.license_badge"),
    license: () => t("providers.github.account.license"),
    plans: () => t("providers.github.account.plans"),
    unavailable: () => t("providers.github.account.unavailable"),
    retry: () => t("providers.github.account.retry"),
    waiting: () => t("providers.github.account.waiting"),
    open: () => t("providers.github.account.open_github"),
    cancel: () => t("providers.github.account.cancel"),
    migrate: () => t("providers.github.account.migrate"),
    migrate_action: () => t("providers.github.account.migrate_action"),
    connect_row: () => t("providers.github.account.connect_row"),
    add: () => t("providers.github.account.add"),
    pending_hide: () => t("providers.github.account.pending_hide"),
    change: () => t("providers.github.account.change"),
    change_on: (name) => t("providers.github.account.change_on", { name }),
    machine_remove: () => t("providers.github.account.machine_remove"),
    machine_restore: () => t("providers.github.account.machine_restore"),
    adopt_kept: (account, machine) => t("providers.github.account.adopt_kept", { account, machine }),
    pending: () => t("providers.github.account.pending"),
    pending_admin: () => t("providers.github.account.pending_admin"),
  },
  async status(scope) {
    const raw = await invoke<unknown>("github_account_status", { scope });
    const notice = (raw as { adopt_notice?: { login?: unknown; account_login?: unknown } } | null)?.adopt_notice;
    const next = githubStatusOf(raw);
    return {
      connected: next.connected,
      credential: next.credential ? credentialOf(next.credential) : null,
      addUrl: next.install_url,
      adoptNotice: notice && typeof notice.login === "string" && typeof notice.account_login === "string" ? { login: notice.login, account_login: notice.account_login } : null,
    };
  },
  async authorize(scope) {
    const { url, opened } = githubAuthorizeOf(await invoke("github_account_authorize", { scope }));
    return { url, opened };
  },
  async areas(scope) {
    const listed = githubInstallationsOf(await invoke("github_account_installations", { scope }));
    return {
      areas: listed.installations.map((i) => ({
        key: i.key,
        name: i.account.login,
        round: i.account.type === "User",
        scope: () => scopeOf(i),
        // Sin `html_url` (un Worker anterior), «Cambiar» abre la página de instalar.
        url: i.html_url,
      })),
      addUrl: listed.install_url,
      pending: listed.install_pending,
    };
  },
  async disconnect(scope) {
    await invoke("github_account_disconnect", { scope });
  },
  async machine(scope, credential, computer, restore) {
    const args = { scope, credential, computer };
    const reply = (restore
      ? await invoke("account_credential_restore_machine", args)
      : await invoke("account_credential_remove_machine", args)) as { credential?: unknown };
    const next = githubCredentialOf(reply?.credential);
    return next ? credentialOf(next) : null;
  },
  code: githubAccountCode,
  failureOf: githubAccountFailureOf,
  notHere,
  silent,
};

export default function GithubAccount(props: {
  scope: string;
  /** Hay una conexión local de GitHub en este workspace: con la cuenta vacía, se ofrece pasarla. */
  local: boolean;
  onState: (state: GithubAccountState) => void;
}) {
  return <GitHostAccount adapter={GITHUB_ACCOUNT} scope={props.scope} local={props.local} onState={props.onState} />;
}
