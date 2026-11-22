import ExternalIcon from "lucide-solid/icons/external-link";
import Plus from "lucide-solid/icons/plus";
import { For, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { FailureNote } from "../../../../ui/src/Failure";
import { Skeleton } from "../../../../ui/src/Skeleton";
import { SettingsBlock, SettingsRow } from "../../../../ui/src/SettingsLayout";
import { ENLACE } from "../../../../ui/src/ExternalLink";
import { createConexionDeGithub } from "./GithubAccountConnection";
import { createPartesDeGithub } from "./GithubAccountParts";
import type { GithubAccountState } from "./GithubAccountTypes";

export default function GithubAccount(props: {
  scope: string;
  /** Hay una conexión local de GitHub en este workspace: con la cuenta vacía, se ofrece pasarla. */
  local: boolean;
  onState: (state: GithubAccountState) => void;
}) {
  const conexion = createConexionDeGithub(props);
  const { mode, waiting, openUrl, finishWaiting, available, connected, busy, connect, license, unavailable, credential, adoptNotice, reauthorize, installs, scopeOf, changeUrl, pendingHidden, setPendingHidden, installUrl, failure } = conexion;
  const { AccountState, Initial, MachineChips } = createPartesDeGithub(conexion);
  return (
    <div data-github-account={mode()} class="contents">
      <Show when={waiting()}>
        {(url) => (
          <SettingsRow
            label={t("providers.github.account.waiting")}
            description={
              <a class={ENLACE} href={url()} target="_blank" rel="noopener noreferrer" onClick={(ev) => { ev.preventDefault(); void openUrl(url()); }}>
                {t("providers.github.account.open_github")}
              </a>
            }
          >
            <Button variant="outline" size="compact" onClick={finishWaiting}>
              {t("providers.github.account.cancel")}
            </Button>
          </SettingsRow>
        )}
      </Show>

      {/* Hay conexión local y la cuenta aún no tiene: pasarla es autorizar una vez. */}
      <Show when={available() && !connected() && props.local && !waiting()}>
        <SettingsRow label={t("providers.github.account.migrate")}>
          <Button size="compact" disabled={busy() !== null} onClick={() => void connect()}>
            {t("providers.github.account.migrate_action")}
          </Button>
        </SettingsRow>
      </Show>

      {/* Sin licencia el Worker no da GitHub; la conexión de esta máquina, si hay, sigue. */}
      <Show when={mode() === "local" && license() && !props.local}>
        <SettingsRow label={t("providers.github.account.connect_row")}>
          <AccountState />
        </SettingsRow>
      </Show>

      {/* Sin conectar, «Conectar» va en la cabecera de la sección (`onState().connect`); aquí solo lo que lo impide. */}
      <Show when={mode() === "account" && !connected() && !waiting() && (license() || unavailable())}>
        <SettingsRow label={t("providers.github.account.connect_row")}>
          <AccountState />
        </SettingsRow>
      </Show>

      <Show when={mode() === "account" && connected() ? credential() : null}>
        {(c) => (
          <>
            <SettingsRow
              data-github-login={c().config.login}
              lead={<Initial name={c().config.name ?? c().config.login} round />}
              label={
                <span class="inline-flex min-w-0 items-baseline gap-2">
                  <Show when={c().config.name}>{(name) => <strong class="truncate font-semibold">{name()}</strong>}</Show>
                  <span class={c().config.name ? "truncate font-mono text-xs text-neutral-500" : "truncate font-semibold"}>@{c().config.login}</span>
                  <MachineChips machines={c().machines} />
                </span>
              }
              description={
                <Show when={adoptNotice()}>
                  {(n) => t("providers.github.account.adopt_kept", { account: n().account_login, machine: n().login })}
                </Show>
              }
            >
              <Show when={!waiting()}>
                <AccountState />
              </Show>
            </SettingsRow>

            <Show when={!unavailable() && !reauthorize()}>
              <Show when={installs()} fallback={<SettingsBlock><Skeleton filas={2} class="h-6" /></SettingsBlock>}>
                {(list) => (
                  <div class="contents" data-github-installations="">
                    <For each={list().installations}>
                      {(i) => (
                        <SettingsRow
                          class={license() ? "pl-6 opacity-60" : "pl-6"}
                          data-github-installation={i.key}
                          lead={<Initial name={i.account.login} round={i.account.type === "User"} />}
                          label={i.account.login}
                        >
                          <span class="text-ui text-neutral-500">{scopeOf(i)}</span>
                          <Show when={!license() ? changeUrl(i) : null}>
                            {(url) => (
                              <Button
                                variant="outline"
                                size="compact"
                                aria-label={t("providers.github.account.change_on", { name: i.account.login })}
                                disabled={busy() !== null}
                                onClick={() => void openUrl(url())}
                              >
                                {t("providers.github.account.change")}
                                <ExternalIcon size={12} aria-hidden />
                              </Button>
                            )}
                          </Show>
                        </SettingsRow>
                      )}
                    </For>
                    <Show when={list().install_pending && !pendingHidden()}>
                      <SettingsRow class="pl-6" data-github-installation-pending="" label={<Badge tone="warning">{t("providers.github.account.pending")}</Badge>}>
                        <span class="text-ui text-neutral-500">{t("providers.github.account.pending_admin")}</span>
                        <Button variant="ghost" size="compact" onClick={() => setPendingHidden(true)}>
                          {t("providers.github.account.pending_hide")}
                        </Button>
                      </SettingsRow>
                    </Show>
                    <Show when={!license() ? installUrl() : null}>
                      {(url) => (
                        <SettingsRow
                          class="pl-6"
                          label={
                            <Button variant="ghost" size="compact" class="-ml-2" disabled={busy() !== null} onClick={() => void openUrl(url())}>
                              <Plus size={12} aria-hidden />
                              {t("providers.github.account.add")}
                            </Button>
                          }
                        />
                      )}
                    </Show>
                  </div>
                )}
              </Show>
            </Show>

          </>
        )}
      </Show>

      <Show when={failure()}>
        {(f) => (
          <SettingsBlock>
            <FailureNote f={f()} />
          </SettingsBlock>
        )}
      </Show>
    </div>
  );
}
