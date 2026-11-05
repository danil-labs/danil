import { confirm } from "@tauri-apps/plugin-dialog";
import {
  type GithubInstallation,
  type GithubInstallations,
  type GithubMachine,
  type GithubStatus,
  githubAuthorizeOf,
  githubCredentialOf,
  githubInstallationsOf,
  githubStatusOf,
} from "@terminus/computers";
import Ellipsis from "lucide-solid/icons/ellipsis";
import ExternalIcon from "lucide-solid/icons/external-link";
import Plus from "lucide-solid/icons/plus";
import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { t } from "../../../lib/i18n";
import { invoke } from "../../../lib/invoke.ts";
import { capabilities } from "../../../lib/platform";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../../../ui/DropdownMenu";
import { FailureNote, type Failure } from "../../../ui/Failure";
import { Skeleton } from "../../../ui/Skeleton";
import { SettingsBlock, SettingsRow } from "../layout";
import { githubAccountCode, githubAccountFailureOf, notHere, silent } from "./failures.ts";
import { ENLACE } from "../../../ui/ExternalLink";

/**
 * GitHub en la cuenta de Danil: la conexión es de la persona y Danil refleja
 * dónde está instalada la App. La ventana habla con su motor (`github_account_*`);
 * la web, con el Worker (`web/github-account.ts`).
 */

/** `account`: esta tarjeta reemplaza la local. `local`: se ve la de esta máquina (sin sesión, motor viejo, o la local sigue mandando). */
export type GithubAccountMode = "unknown" | "account" | "local";

/** `session`: esta máquina tiene sesión de Danil para el workspace (`null` mientras se pregunta). */
/** `connect`: el «Conectar» de la cabecera de la sección (Control de código), cuando se puede conectar. */
export type GithubAccountState = {
  mode: GithubAccountMode;
  connected: boolean;
  reauthorize: boolean;
  session: boolean | null;
  connect?: () => void;
};

/** Cada cuánto se pregunta tras abrir GitHub, y hasta cuándo. */
const POLL_MS = 3_000;
const POLL_FOR_MS = 10 * 60_000;
const PLANS_URL = "https://danil.ai/planes";

type WorkspaceAccountOf = { signed_in?: boolean };

export default function GithubAccount(props: {
  scope: string;
  /** Hay una conexión local de GitHub en este workspace: con la cuenta vacía, se ofrece pasarla. */
  local: boolean;
  onState: (state: GithubAccountState) => void;
}) {
  const [status, setStatus] = createSignal<GithubStatus | null>(null);
  /** `null` mientras se pregunta; `false` si aquí no hay GitHub de la cuenta. */
  const [available, setAvailable] = createSignal<boolean | null>(null);
  const [session, setSession] = createSignal<boolean | null>(null);
  const [busy, setBusy] = createSignal<string | null>(null);
  /** «Ocultar» la fila de «Pendiente» en esta pantalla. */
  const [pendingHidden, setPendingHidden] = createSignal(false);
  const [failure, setFailure] = createSignal<Failure | null>(null);
  /** El código del último fallo: algunos se dicen en la fila de la cuenta y no abajo. */
  const [code, setCode] = createSignal<string | null>(null);
  const [waiting, setWaiting] = createSignal<string | null>(null);
  const [installs, setInstalls] = createSignal<GithubInstallations | null>(null);
  const [installUrl, setInstallUrl] = createSignal<string | null>(null);
  /** La máquina tenía otra GitHub (sin sesión) y la cuenta conservó la suya. */
  const [adoptNotice, setAdoptNotice] = createSignal<{ login: string; account_login: string } | null>(null);
  let poll: ReturnType<typeof setInterval> | undefined;
  let disposed = false;

  const credential = () => status()?.credential ?? null;
  const connected = () => !!status()?.connected;
  const reauthorize = () => credential()?.status === "reauthorize" || code() === "github_reauthorize";
  const license = () => code() === "license_required";
  const unavailable = () => code() === "github_unavailable";
  // Con la cuenta vacía y una conexión local, la local sigue siendo la que usan las tareas.
  const mode = (): GithubAccountMode => {
    const a = available();
    if (a === null) return "unknown";
    return a && (connected() || !props.local) ? "account" : "local";
  };
  createEffect(() =>
    props.onState({
      mode: mode(),
      connected: connected(),
      reauthorize: reauthorize(),
      session: session(),
      connect: mode() === "account" && !connected() && !waiting() && !license() && !unavailable() && busy() === null ? () => void connect() : undefined,
    }),
  );
  const fail = (e: unknown) => {
    const c = githubAccountCode(e);
    setCode(c);
    // Estos tres se dicen en la fila de la cuenta, con su acción.
    setFailure(c === "github_unavailable" || c === "github_reauthorize" || c === "license_required" ? null : (githubAccountFailureOf(e) as Failure));
  };
  const clearFailure = () => {
    setFailure(null);
    setCode(null);
  };

  function applyStatus(next: GithubStatus) {
    setStatus(next);
    if (next.install_url) setInstallUrl(next.install_url);
    setAvailable(true);
  }

  async function read(): Promise<GithubStatus | null> {
    if (capabilities().danilAccount) {
      const of = await invoke<WorkspaceAccountOf>("danil_workspace_account", { workspace: props.scope }).catch(() => null);
      setSession(!!of?.signed_in);
      if (!of?.signed_in) {
        setAvailable(false);
        return null;
      }
    } else {
      setSession(true);
    }
    try {
      const raw = await invoke<unknown>("github_account_status", { scope: props.scope });
      const notice = (raw as { adopt_notice?: { login?: unknown; account_login?: unknown } } | null)?.adopt_notice;
      if (notice && typeof notice.login === "string" && typeof notice.account_login === "string") {
        setAdoptNotice({ login: notice.login, account_login: notice.account_login });
      }
      const next = githubStatusOf(raw);
      if (!disposed) applyStatus(next);
      return next;
    } catch (e) {
      if (disposed) return null;
      // Sin GitHub de la cuenta aquí manda la conexión de esta máquina; un fallo al releer no la cambia.
      if (notHere(e) || available() !== true) setAvailable(false);
      if (!silent(e)) fail(e);
      return null;
    }
  }

  async function readInstallations(): Promise<GithubInstallations | null> {
    try {
      const listed = githubInstallationsOf(await invoke("github_account_installations", { scope: props.scope }));
      if (disposed) return null;
      setInstalls(listed);
      if (listed.install_url) setInstallUrl(listed.install_url);
      return listed;
    } catch (e) {
      if (!disposed) fail(e);
      return null;
    }
  }

  async function refresh() {
    clearFailure();
    const next = await read();
    if (next?.connected) await readInstallations();
  }

  onMount(() => {
    void refresh();
    // Al volver de GitHub aparece la organización recién instalada.
    const onFocus = () => {
      if (mode() !== "unknown" && !busy() && !poll) void refresh();
    };
    window.addEventListener("focus", onFocus);
    onCleanup(() => window.removeEventListener("focus", onFocus));
  });
  onCleanup(() => {
    disposed = true;
    stopPolling();
  });

  function stopPolling() {
    if (poll) clearInterval(poll);
    poll = undefined;
  }

  async function connect() {
    setBusy("authorize");
    clearFailure();
    try {
      const { url, opened } = githubAuthorizeOf(await invoke("github_account_authorize", { scope: props.scope }));
      if (disposed) return;
      setWaiting(url);
      // Si el motor no la abrió (la web, un motor sin pantalla), se abre aquí; si algo la bloquea, queda el enlace.
      if (!opened) void openUrl(url);
      const until = Date.now() + POLL_FOR_MS;
      const reauthorizing = credential()?.status === "reauthorize";
      stopPolling();
      poll = setInterval(async () => {
        if (Date.now() > until) return finishWaiting();
        const next = await read();
        if (next?.connected && !(reauthorizing && next.credential?.status === "reauthorize")) {
          finishWaiting();
          const listed = await readInstallations();
          // Sin ninguna instalación no hay nada que ver: se abre la página de instalar, una vez.
          const install = listed?.install_url ?? installUrl();
          if (listed && listed.installations.length === 0 && !listed.install_pending && install) void openUrl(install);
        }
      }, POLL_MS);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  function finishWaiting() {
    stopPolling();
    setWaiting(null);
  }

  async function disconnect() {
    if (!(await confirm(t("providers.github.account.disconnect_confirm"), { kind: "warning" }))) return;
    setBusy("disconnect");
    clearFailure();
    try {
      await invoke("github_account_disconnect", { scope: props.scope });
      if (disposed) return;
      setInstalls(null);
      applyStatus({ connected: false, credential: null, install_url: installUrl() });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function check() {
    setBusy("check");
    try {
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function machine(m: GithubMachine, restore: boolean) {
    const c = credential();
    if (!c) return;
    setBusy(`machine:${m.computer_id}`);
    clearFailure();
    try {
      const args = { scope: props.scope, credential: c.id, computer: m.computer_id };
      const reply = (restore
        ? await invoke("account_credential_restore_machine", args)
        : await invoke("account_credential_remove_machine", args)) as { credential?: unknown };
      const next = githubCredentialOf(reply?.credential);
      if (next && !disposed) applyStatus({ ...(status() as GithubStatus), credential: next });
      else await read();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  const machineName = (m: GithubMachine) => m.name || capabilities().machineName?.(m.computer_id) || m.computer_id;
  const openUrl = (url: string) => invoke("open_external", { target: url }).catch(() => {});
  const scopeOf = (i: GithubInstallation) =>
    i.repository_selection === "all"
      ? t("providers.github.account.scope_all")
      : i.repository_selection === "selected" && i.repository_count !== null
        ? t("providers.github.account.scope_count", { count: i.repository_count })
        : t("providers.github.account.scope_some");
  const changeUrl = (i: GithubInstallation) => i.html_url ?? installUrl();

  const Initial = (p: { name: string; round?: boolean }) => (
    <span
      aria-hidden="true"
      class={`grid size-6 shrink-0 place-items-center bg-neutral-200 text-caption font-semibold text-neutral-700 ${p.round ? "rounded-full" : "rounded-sm"}`}
    >
      {p.name.slice(0, 1).toUpperCase()}
    </span>
  );

  /** Lo que la fila de la cuenta dice en vez del menú: un estado con su acción. */
  const AccountState = () => (
    <Show
      when={reauthorize() || license() || unavailable()}
      fallback={
        <DropdownMenu>
          <DropdownMenuTrigger as={Button} variant="ghost" size="iconCompact" aria-label={t("providers.github.more_actions")} disabled={busy() !== null}>
            <Ellipsis size={16} aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent class="z-[90]" data-owns-escape>
            <DropdownMenuItem disabled={busy() !== null} onSelect={() => void check()}>
              {t("providers.github.check_connection")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem class="text-error-strong" disabled={busy() !== null} onSelect={() => void disconnect()}>
              {t("providers.github.disconnect")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <Show when={reauthorize()}>
        <span class="inline-flex items-center gap-2 text-ui text-warning-strong">
          <Badge tone="warning">{t("providers.github.account.reauthorize_badge")}</Badge>
          {t("providers.github.account.reauthorize")}
        </span>
        <Button size="sm" disabled={busy() !== null} onClick={() => void connect()}>
          {t("providers.github.account.reconnect")}
        </Button>
      </Show>
      <Show when={!reauthorize() && license()}>
        <span class="inline-flex items-center gap-2 text-ui text-warning-strong">
          <Badge tone="warning">{t("providers.github.account.license_badge")}</Badge>
          {t("providers.github.account.license")}
        </span>
        <Button variant="outline" size="compact" onClick={() => void openUrl(PLANS_URL)}>
          {t("providers.github.account.plans")}
          <ExternalIcon size={12} aria-hidden />
        </Button>
      </Show>
      <Show when={!reauthorize() && !license() && unavailable()}>
        <span class="text-ui text-error-strong" role="alert">{t("providers.github.account.unavailable")}</span>
        <Button variant="outline" size="compact" disabled={busy() !== null} onClick={() => void check()}>
          {t("providers.github.account.retry")}
        </Button>
      </Show>
    </Show>
  );

  /**
   * Las máquinas donde está en uso, como chips junto a la cuenta (el `Badge
   * forma="dato"` de Proveedores de IA): hasta 3 y «+N»; el `title` da todas.
   * Clic en un chip: su única acción, quitar o volver a poner.
   */
  function MachineChips(p: { machines: GithubMachine[] }) {
    const shown = () => p.machines.slice(0, 3);
    const rest = () => p.machines.length - shown().length;
    const all = () => p.machines.map(machineName).join(", ");
    return (
      <Show when={p.machines.length > 0}>
        <span class="inline-flex min-w-0 flex-wrap items-center gap-1" data-github-machines="" title={all()}>
          <For each={shown()}>
            {(m) => (
              <DropdownMenu>
                <DropdownMenuTrigger
                  as="button"
                  type="button"
                  class="rounded-sm"
                  data-github-machine={m.computer_id}
                  aria-label={machineName(m)}
                  disabled={busy() !== null}
                >
                  <Badge forma="dato" class={m.state === "removed" ? "shrink-0 opacity-60" : "shrink-0"}>
                    {machineName(m)}
                  </Badge>
                </DropdownMenuTrigger>
                <DropdownMenuContent class="z-[90]" data-owns-escape>
                  <DropdownMenuItem disabled={busy() !== null} onSelect={() => void machine(m, m.state === "removed")}>
                    {m.state === "removed" ? t("providers.github.account.machine_restore") : t("providers.github.account.machine_remove")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </For>
          <Show when={rest() > 0}>
            <DropdownMenu>
              <DropdownMenuTrigger as="button" type="button" class="rounded-sm" aria-label={all()} disabled={busy() !== null}>
                <Badge forma="dato" class="shrink-0">+{rest()}</Badge>
              </DropdownMenuTrigger>
              <DropdownMenuContent class="z-[90]" data-owns-escape>
                <For each={p.machines.slice(3)}>
                  {(m) => (
                    <DropdownMenuItem disabled={busy() !== null} onSelect={() => void machine(m, m.state === "removed")}>
                      {machineName(m)} · {m.state === "removed" ? t("providers.github.account.machine_restore") : t("providers.github.account.machine_remove")}
                    </DropdownMenuItem>
                  )}
                </For>
              </DropdownMenuContent>
            </DropdownMenu>
          </Show>
        </span>
      </Show>
    );
  }

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
