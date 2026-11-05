import { confirm } from "@tauri-apps/plugin-dialog";
import {
  type GithubArea,
  type GithubCredential,
  type GithubInstallation,
  type GithubMachine,
  type GithubStatus,
  githubAuthorizeOf,
  githubCredentialOf,
  githubInstallationsOf,
  githubStatusOf,
} from "@terminus/computers";
import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { manifiesto, t } from "../../../lib/i18n";
import { invoke } from "../../../lib/invoke.ts";
import { capabilities } from "../../../lib/platform";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { FailureNote, type Failure } from "../../../ui/Failure";
import { Skeleton } from "../../../ui/Skeleton";
import { Toggle } from "../../../ui/Toggle";
import { SettingsBlock, SettingsRow } from "../layout";
import { githubAccountFailureOf, notHere, silent } from "./failures.ts";
import { ENLACE } from "../../../ui/ExternalLink";

/**
 * GitHub en la cuenta de Danil: una conexión por workspace que guarda el Worker
 * y de la que cada máquina pide su token. La ventana habla con su motor
 * (`github_account_*`); la web, con el Worker (`web/github-account.ts`).
 */

/** `account`: esta tarjeta reemplaza la local. `local`: se ve la de esta máquina (sin sesión, motor viejo, o la local sigue mandando). */
export type GithubAccountMode = "unknown" | "account" | "local";

export type GithubAccountState = { mode: GithubAccountMode; connected: boolean; reauthorize: boolean };

/** Cada cuánto se pregunta tras abrir GitHub, y hasta cuándo. */
const POLL_MS = 3_000;
const POLL_FOR_MS = 10 * 60_000;

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
  const [busy, setBusy] = createSignal<string | null>(null);
  const [failure, setFailure] = createSignal<Failure | null>(null);
  const [waiting, setWaiting] = createSignal<string | null>(null);
  const [choosing, setChoosing] = createSignal(false);
  const [installations, setInstallations] = createSignal<GithubInstallation[] | null>(null);
  const [installUrl, setInstallUrl] = createSignal<string | null>(null);
  let poll: ReturnType<typeof setInterval> | undefined;
  let disposed = false;

  const credential = () => status()?.credential ?? null;
  const connected = () => !!status()?.connected;
  // Con la cuenta vacía y una conexión local, la local sigue siendo la que usan las tareas.
  const mode = (): GithubAccountMode => {
    const a = available();
    if (a === null) return "unknown";
    return a && (connected() || !props.local) ? "account" : "local";
  };
  createEffect(() => props.onState({ mode: mode(), connected: connected(), reauthorize: credential()?.status === "reauthorize" }));
  const fail = (e: unknown) => setFailure(githubAccountFailureOf(e) as Failure);

  function applyStatus(next: GithubStatus) {
    setStatus(next);
    if (next.install_url) setInstallUrl(next.install_url);
    setAvailable(true);
  }

  async function read(): Promise<GithubStatus | null> {
    if (capabilities().danilAccount) {
      const of = await invoke<WorkspaceAccountOf>("danil_workspace_account", { workspace: props.scope }).catch(() => null);
      if (!of?.signed_in) {
        setAvailable(false);
        return null;
      }
    }
    try {
      const next = githubStatusOf(await invoke("github_account_status", { scope: props.scope }));
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

  onMount(() => {
    void read();
    const refresh = () => {
      if (mode() !== "unknown" && !busy()) void read();
    };
    window.addEventListener("focus", refresh);
    onCleanup(() => window.removeEventListener("focus", refresh));
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
    setFailure(null);
    try {
      const { url, opened } = githubAuthorizeOf(await invoke("github_account_authorize", { scope: props.scope }));
      if (disposed) return;
      setWaiting(url);
      // Si el motor no la abrió (la web, un motor sin pantalla), se abre aquí; si algo la bloquea, queda el enlace.
      if (!opened) invoke("open_external", { target: url }).catch(() => {});
      const until = Date.now() + POLL_FOR_MS;
      const reauthorizing = credential()?.status === "reauthorize";
      stopPolling();
      poll = setInterval(async () => {
        if (Date.now() > until) return finishWaiting();
        const next = await read();
        if (next?.connected && !(reauthorizing && next.credential?.status === "reauthorize")) {
          finishWaiting();
          if (!next.credential?.config.areas.length) void chooseAreas();
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

  async function chooseAreas() {
    setChoosing(true);
    setBusy("installations");
    setFailure(null);
    try {
      const listed = githubInstallationsOf(await invoke("github_account_installations", { scope: props.scope }));
      if (disposed) return;
      setInstallations(listed.installations);
      if (listed.install_url) setInstallUrl(listed.install_url);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function toggleArea(i: GithubInstallation, on: boolean) {
    const current = credential()?.config.areas ?? [];
    const areas: GithubArea[] = on
      ? [...current.filter((a) => a.key !== i.key), { key: i.key, installation_id: i.installation_id, repository_ids: null }]
      : current.filter((a) => a.key !== i.key);
    setBusy("areas");
    setFailure(null);
    try {
      const reply = (await invoke("github_account_set_areas", { scope: props.scope, areas })) as { credential?: unknown };
      const next = githubCredentialOf(reply?.credential);
      if (next && !disposed) applyStatus({ ...(status() as GithubStatus), connected: true, credential: next });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!(await confirm(t("providers.github.account.disconnect_confirm"), { kind: "warning" }))) return;
    setBusy("disconnect");
    setFailure(null);
    try {
      await invoke("github_account_disconnect", { scope: props.scope });
      if (disposed) return;
      setChoosing(false);
      setInstallations(null);
      applyStatus({ connected: false, credential: null, install_url: installUrl() });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function machine(m: GithubMachine, restore: boolean) {
    const c = credential();
    if (!c) return;
    setBusy(`machine:${m.computer_id}`);
    setFailure(null);
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
  const areaKeys = (c: GithubCredential) => c.config.areas.map((a) => a.key);
  const openUrl = (url: string) => invoke("open_external", { target: url }).catch(() => {});

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
        <SettingsRow label={t("providers.github.account.migrate")} description={t("providers.github.account.migrate_help")}>
          <Button size="compact" disabled={busy() !== null} onClick={() => void connect()}>
            {t("providers.github.account.migrate_action")}
          </Button>
        </SettingsRow>
      </Show>

      <Show when={mode() === "account" && !connected() && !waiting()}>
        <SettingsRow label={t("providers.github.account.connect_row")} description={t("providers.github.account.connect_help")}>
          <Button size="sm" disabled={busy() !== null} onClick={() => void connect()}>
            {t("providers.github.account.connect")}
          </Button>
        </SettingsRow>
      </Show>

      <Show when={mode() === "account" && connected() ? credential() : null}>
        {(c) => (
          <>
            <Show when={c().status === "reauthorize" && !waiting()}>
              <SettingsRow
                label={<span class="inline-flex items-center gap-2"><Badge tone="warning">{t("providers.github.account.reauthorize_badge")}</Badge>{t("providers.github.account.reauthorize")}</span>}
                description={t("providers.github.account.reauthorize_help")}
              >
                <Button size="compact" disabled={busy() !== null} onClick={() => void connect()}>
                  {t("providers.github.account.reconnect")}
                </Button>
              </SettingsRow>
            </Show>
            <SettingsRow
              label={
                <span>
                  <strong>@{c().config.login}</strong>
                </span>
              }
              description={t("providers.github.account.connected_help")}
            >
              <Button variant="ghost" size="compact" class="hover:text-error-strong" disabled={busy() !== null} onClick={() => void disconnect()}>
                {t("providers.github.disconnect")}
              </Button>
            </SettingsRow>
            <SettingsRow
              label={t("providers.github.account.areas")}
              description={
                areaKeys(c()).length === 0
                  ? t("providers.github.account.no_areas")
                  : new Intl.ListFormat(manifiesto().formato).format(areaKeys(c()))
              }
            >
              <Button variant="outline" size="compact" disabled={busy() !== null} aria-expanded={choosing()} onClick={() => (choosing() ? setChoosing(false) : void chooseAreas())}>
                {choosing() ? t("providers.github.account.areas_done") : t("providers.github.account.choose_areas")}
              </Button>
            </SettingsRow>
            <Show when={choosing()}>
              <SettingsBlock class="gap-1.5">
                <Show when={installations()} fallback={<Skeleton filas={2} class="h-6" />}>
                  {(list) => (
                    <>
                      <Show when={list().length === 0}>
                        <p class="m-0 text-xs text-neutral-500">{t("providers.github.account.no_installations")}</p>
                      </Show>
                      <ul class="m-0 flex list-none flex-col gap-1 p-0" data-github-installations="">
                        <For each={list()}>
                          {(i) => {
                            const on = () => areaKeys(c()).includes(i.key);
                            return (
                              <li class="flex items-center gap-2 rounded-sm border border-border bg-surface px-2 py-1.5 text-xs">
                                <span class="min-w-0 flex-1 truncate">{i.account.login}</span>
                                <Show when={i.account.type}>{(type) => <span class="font-mono text-caption text-neutral-500">{type()}</span>}</Show>
                                <Toggle
                                  checked={on()}
                                  label={t("providers.github.account.area_toggle", { name: i.account.login })}
                                  disabled={busy() !== null}
                                  onChange={(next) => void toggleArea(i, next)}
                                />
                              </li>
                            );
                          }}
                        </For>
                      </ul>
                    </>
                  )}
                </Show>
                <Show when={installUrl()}>
                  {(url) => (
                    <a class={`${ENLACE} self-start text-xs`} href={url()} target="_blank" rel="noopener noreferrer" onClick={(ev) => { ev.preventDefault(); void openUrl(url()); }}>
                      {t("providers.github.account.install_more")}
                    </a>
                  )}
                </Show>
              </SettingsBlock>
            </Show>
            <Show when={c().machines.length > 0}>
              <SettingsRow
                class="flex-wrap gap-x-8 gap-y-2"
                label={t("providers.github.account.in_use")}
                description={new Intl.ListFormat(manifiesto().formato).format(c().machines.filter((m) => m.state !== "removed").map(machineName))}
              />
              <SettingsBlock class="gap-1">
                <ul class="m-0 flex list-none flex-col gap-1 p-0" data-github-machines="">
                  <For each={c().machines}>
                    {(m) => (
                      <li class="flex items-center gap-2 text-xs" data-github-machine={m.computer_id}>
                        <span class="min-w-0 flex-1 truncate">{machineName(m)}</span>
                        <Show when={m.state === "removed"}>
                          <Badge>{t("providers.github.account.machine_removed")}</Badge>
                        </Show>
                        <Button variant="ghost" size="compact" disabled={busy() !== null} onClick={() => void machine(m, m.state === "removed")}>
                          {m.state === "removed" ? t("providers.github.account.machine_restore") : t("providers.github.account.machine_remove")}
                        </Button>
                      </li>
                    )}
                  </For>
                </ul>
              </SettingsBlock>
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
