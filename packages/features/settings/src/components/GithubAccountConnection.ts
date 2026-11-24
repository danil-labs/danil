import { confirm } from "@tauri-apps/plugin-dialog";
import type { GithubInstallation, GithubInstallations, GithubMachine, GithubStatus } from "../../../../platform-client/src/github.ts";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { accountCredentialRemoveMachine, accountCredentialRestoreMachine, danilWorkspaceAccount, githubAccountAuthorize, githubAccountDisconnect, githubAccountInstallations, githubAccountStatus, githubAuthorizeOf, githubCredentialOf, githubInstallationsOf, githubStatusOf } from "../queries/engine-github";
import { openExternal } from "../queries/engine-open";
import { capabilities } from "../../../../host/src/platform";
import { type Failure } from "../../../../ui/src/Failure";
import { accountPathDown, githubAccountCode, githubAccountFailureOf, notHere, silent } from "../model/github-account-failures.ts";
import { type GithubAccountMode, type WorkspaceAccountOf, POLL_FOR_MS, POLL_MS } from "./GithubAccountTypes";
import type GithubAccount from "./GithubAccountView";

export function createConexionDeGithub(props: Parameters<typeof GithubAccount>[0]) {
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
  const fail = (e: unknown, what?: unknown) => {
    const c = githubAccountCode(e);
    setCode(c);
    // Estos tres se dicen en la fila de la cuenta, con su acción.
    setFailure(c === "github_unavailable" || c === "github_reauthorize" || c === "license_required" ? null : (githubAccountFailureOf(e, what) as Failure));
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
      const of = await danilWorkspaceAccount<WorkspaceAccountOf>({ workspace: props.scope }).catch(() => null);
      setSession(!!of?.signed_in);
      if (!of?.signed_in) {
        setAvailable(false);
        return null;
      }
    } else {
      setSession(true);
    }
    try {
      const raw = await githubAccountStatus<unknown>({ scope: props.scope });
      const notice = (raw as { adopt_notice?: { login?: unknown; account_login?: unknown } } | null)?.adopt_notice;
      if (notice && typeof notice.login === "string" && typeof notice.account_login === "string") {
        setAdoptNotice({ login: notice.login, account_login: notice.account_login });
      }
      const next = githubStatusOf(raw);
      if (!disposed) applyStatus(next);
      return next;
    } catch (e) {
      if (disposed) return null;
      // Sin GitHub de la cuenta aquí (o sin su camino por el relay) manda la conexión de esta máquina; un fallo al releer no la cambia.
      if (notHere(e) || available() !== true) setAvailable(false);
      if (!silent(e) && !(available() === false && accountPathDown(e))) fail(e, t("providers.github.account.error.status"));
      return null;
    }
  }

  async function readInstallations(): Promise<GithubInstallations | null> {
    try {
      const listed = githubInstallationsOf(await githubAccountInstallations({ scope: props.scope }));
      if (disposed) return null;
      setInstalls(listed);
      if (listed.install_url) setInstallUrl(listed.install_url);
      return listed;
    } catch (e) {
      if (!disposed) fail(e, t("providers.github.account.error.installations"));
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
      const { url, opened } = githubAuthorizeOf(await githubAccountAuthorize({ scope: props.scope }));
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
      await githubAccountDisconnect({ scope: props.scope });
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
        ? await accountCredentialRestoreMachine(args)
        : await accountCredentialRemoveMachine(args)) as { credential?: unknown };
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
  const openUrl = (url: string) => openExternal({ target: url }).catch(() => {});
  const scopeOf = (i: GithubInstallation) =>
    i.repository_selection === "all"
      ? t("providers.github.account.scope_all")
      : i.repository_selection === "selected" && i.repository_count !== null
        ? t("providers.github.account.scope_count", { count: i.repository_count })
        : t("providers.github.account.scope_some");
  const changeUrl = (i: GithubInstallation) => i.html_url ?? installUrl();
  return {
    reauthorize, license, unavailable, busy, check, disconnect, connect, openUrl, machineName, machine,
    mode, waiting, finishWaiting, available, connected, credential, adoptNotice, installs, scopeOf,
    changeUrl, pendingHidden, setPendingHidden, installUrl, failure,
  };
}
