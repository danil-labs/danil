import type { GitHostArea, GitHostCredential, GitHostProvider } from "@terminus/computers";
import { t } from "../../../lib/i18n";
import { capabilities } from "../../../lib/platform";
import GitHostAccount, { type AccountCredential, type GitHostAccountAdapter, type GitHostAccountState } from "./GitHostAccount";
import { githubAccountCode, gitHostAccountFailureOf, gitHostNotHere, gitHostSilent } from "./failures.ts";
import { type GitHostAccountSource, desktopGitHostSource } from "./git-host-source.ts";

/**
 * GitLab y Bitbucket de la persona: el mismo panel que GitHub. Con OAuth de
 * usuario no hay instalación por área: cada grupo o espacio solo se abre en el
 * proveedor, y no hay «Añadir».
 */

const credentialOf = (c: GitHostCredential): AccountCredential => ({
  id: c.id,
  status: c.status,
  config: { login: c.config.login, name: c.config.name },
  machines: c.machines,
});

const kindOf = (a: GitHostArea) =>
  a.kind === "user"
    ? t("providers.git_host.account.kind.user")
    : a.kind === "workspace"
      ? t("providers.git_host.account.kind.workspace")
      : t("providers.git_host.account.kind.group");


export function personalGitHostAdapter(provider: GitHostProvider, name: string, source: GitHostAccountSource): GitHostAccountAdapter {
  return {
    provider,
    attr: "git-host",
    copy: {
      more_actions: () => t("providers.git_host.account.more_actions", { name }),
      check: () => t("providers.github.check_connection"),
      disconnect: () => t("providers.github.disconnect"),
      disconnect_confirm: () => t("providers.git_host.account.disconnect_confirm", { name }),
      reauthorize_badge: () => t("providers.github.account.reauthorize_badge"),
      reauthorize: () => t("providers.git_host.account.reauthorize", { name }),
      reconnect: () => t("providers.github.account.reconnect"),
      license_badge: () => t("providers.github.account.license_badge"),
      license: () => t("providers.git_host.account.license", { name }),
      plans: () => t("providers.github.account.plans"),
      unavailable: () => t("providers.git_host.account.unavailable", { name }),
      retry: () => t("providers.github.account.retry"),
      waiting: () => t("providers.git_host.account.waiting", { name }),
      open: () => t("providers.git_host.account.open", { name }),
      cancel: () => t("providers.github.account.cancel"),
      migrate_badge: () => t("providers.git_host.legacy.badge"),
      migrate: () => t("providers.git_host.legacy.title"),
      migrate_action: () => t("providers.github.connect"),
      connect_row: () => t("providers.github.account.connect_row"),
      add: () => "",
      pending_hide: () => t("providers.github.account.pending_hide"),
      change: () => t("providers.git_host.account.open_area"),
      change_on: (area) => t("providers.git_host.account.open_area_on", { area, name }),
      in_use: () => t("providers.github.account.in_use"),
      machine_remove: () => t("providers.github.account.machine_remove"),
      machine_restore: () => t("providers.github.account.machine_restore"),
      machine_removed: () => t("providers.github.account.machine_removed"),
      adopt_kept: () => "",
      pending: () => t("providers.github.account.pending"),
      pending_admin: () => t("providers.github.account.pending_admin"),
    },
    async status() {
      const s = await source.status(provider);
      return { connected: s.connected, credential: s.credential ? credentialOf(s.credential) : null, addUrl: null };
    },
    authorize: () => source.authorize(provider),
    async areas() {
      const listed = await source.areas(provider);
      return {
        areas: listed.areas.map((a) => ({ key: a.key, name: a.name, round: a.kind === "user", scope: () => kindOf(a), url: a.url ?? listed.manage_url })),
        addUrl: null,
        pending: false,
      };
    },
    disconnect: () => source.disconnect(provider),
    async machine(scope, credential, computer, restore) {
      const next = await source.machine(provider, scope, credential, computer, restore);
      return next ? credentialOf(next) : null;
    },
    code: githubAccountCode,
    failureOf: (e) => gitHostAccountFailureOf(provider, name, e),
    notHere: (e) => gitHostNotHere(provider, e),
    silent: (e) => gitHostSilent(provider, e),
  };
}

export default function PersonalGitHostAccount(props: {
  provider: GitHostProvider;
  name: string;
  scope: string;
  /** Hay un token pegado en este workspace que la cuenta puede reemplazar: con la cuenta vacía, se ofrece. */
  local: boolean;
  onState: (state: GitHostAccountState) => void;
}) {
  const source = capabilities().accountGitHosts ?? desktopGitHostSource(props.scope);
  const adapter = personalGitHostAdapter(props.provider, props.name, source);
  return <GitHostAccount adapter={adapter} scope={props.scope} local={props.local} onState={props.onState} />;
}
