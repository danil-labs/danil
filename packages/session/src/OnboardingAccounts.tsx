import { isFreeRouterAgent, isRetiredAgent } from "../../ui/src/lib/tasks/agents.ts";
import { createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { nombreDeAgente } from "../../features/onboarding/src/queries/onboarding-store";
import { Pantalla } from "../../features/onboarding/src/components/Screen";
import { accountKeyUrl, hasLoopbackRedirect, loginCodeErrorText } from "../../ui/src/lib/account-auth.ts";
import type { AccountList, AgentOpt, LoginEvent } from "../../features/settings/src/queries/accounts-store";
import { LoginCodeForm, LoginUrlActions } from "../../features/settings/src/screens/LoginCodeForm";
import { t } from "../../ui/src/lib/i18n";
import { invoke } from "../../engine-client/src/client.ts";
import { machineOf } from "../../host/src/machine";
import { listen } from "../../host/src/serviceEvents";
import { Badge } from "../../ui/src/Badge";
import { Button } from "../../ui/src/Button";
import { asFailure, FailureNote } from "../../ui/src/Failure";
import { Input } from "../../ui/src/Input";
import { MarcaAgente } from "../../ui/src/icons";
import { Spinner } from "../../ui/src/Spinner";

/** Free Router rows and providers with an app of their own are never offered on a managed computer. */
const offered = (a: AgentOpt) => a.available && !a.sin_cuenta && !a.external_install_url && !isFreeRouterAgent(a.id) && !isRetiredAgent(a.id);

/** One card per cloud provider installed on the computer, each connecting its account in this browser. */
export function OnboardingAccounts(props: { workspace: string; onDone: () => void }) {
  const [providers, setProviders] = createSignal<AgentOpt[] | null>(null);
  const [connected, setConnected] = createSignal<Record<string, boolean>>({});
  const active = new Set<() => void>();

  onMount(() => {
    invoke<AgentOpt[]>("list_providers")
      .then((list) => setProviders(list.filter(offered)))
      .catch(() => setProviders([]));
  });

  const leave = () => {
    for (const stop of active) stop();
    props.onDone();
  };

  return (
    <Pantalla
      titulo={t("web.onboarding.accounts.title")}
      atras={leave}
      atrasRotulo={t("web.onboarding.accounts.later")}
      primario={{ rotulo: t("web.onboarding.accounts.finish"), onClick: leave, disabled: !Object.values(connected()).some(Boolean) }}
    >
      <Show when={providers()} fallback={<p role="status" class="m-0 text-sm text-neutral-500">{t("web.onboarding.providers_loading")}</p>}>
        {(list) => (
          <div class="grid gap-2.5">
            <For each={list()} fallback={<p class="m-0 text-sm text-neutral-500">{t("web.onboarding.accounts.none")}</p>}>
              {(provider) => (
                <ProviderCard
                  provider={provider}
                  onConnected={(yes) => setConnected((c) => ({ ...c, [provider.id]: yes }))}
                  register={(stop) => {
                    active.add(stop);
                    onCleanup(() => active.delete(stop));
                  }}
                />
              )}
            </For>
          </div>
        )}
      </Show>
    </Pantalla>
  );
}

type Phase =
  | { t: "idle" }
  | { t: "starting" }
  | { t: "browser"; url: string | null; code: string | null; notice: string | null; asks: boolean; submitting?: boolean; submitted?: boolean; codeError?: string | null }
  | { t: "key"; id: string };

function ProviderCard(props: { provider: AgentOpt; onConnected: (yes: boolean) => void; register: (stop: () => void) => void }) {
  const provider = props.provider.id;
  const [accounts, setAccounts] = createSignal<AccountList["accounts"]>([]);
  const [phase, setPhase] = createSignal<Phase>({ t: "idle" });
  const [running, setRunning] = createSignal<string | null>(null);
  const [failure, setFailure] = createSignal<unknown>(null);
  const [typed, setTyped] = createSignal("");
  // The account this card created for the login in progress: a failed login takes it back.
  let fresh: string | null = null;

  const signedIn = () => accounts().filter((a) => a.authenticated_at !== null);

  async function refresh() {
    try {
      const list = await invoke<AccountList>("list_accounts", { provider });
      setAccounts(list.accounts);
      props.onConnected(list.accounts.some((a) => a.authenticated_at !== null));
    } catch {}
  }

  function reset() {
    setRunning(null);
    setPhase({ t: "idle" });
    setTyped("");
  }

  async function discard(id: string) {
    if (fresh !== id) return;
    fresh = null;
    await invoke("discard_account", { provider, id }, machineOf(id)).catch(() => {});
  }

  /** An account that never signed in is reused: the login alone wakes an off computer. */
  async function accountToUse(): Promise<string> {
    const idle = accounts().find((a) => a.authenticated_at === null);
    if (idle) return idle.id;
    const created = await invoke<{ id: string }>("add_account", { provider, label: "" });
    fresh = created.id;
    return created.id;
  }

  async function connect() {
    setFailure(null);
    setPhase({ t: "starting" });
    let id: string | null = null;
    try {
      id = await accountToUse();
      if (accountKeyUrl(props.provider)) return setPhase({ t: "key", id });
      setRunning(id);
      await invoke("login_account", { provider, id, mode: "tuberia" }, machineOf(id));
    } catch (e) {
      reset();
      setFailure(e);
      if (id) await discard(id);
    }
  }

  async function cancel() {
    const id = running() ?? (phase() as { id?: string }).id ?? null;
    reset();
    if (!id) return;
    await invoke("cancel_login", { id }, machineOf(id)).catch(() => {});
    await discard(id);
  }

  async function sendCode() {
    const id = running();
    const valor = typed().trim();
    const cur = phase();
    if (!id || !valor || (cur.t === "browser" && cur.submitting)) return;
    setPhase((p) => (p.t === "browser" ? { ...p, submitting: true, codeError: null } : p));
    try {
      await invoke("submit_login_code", { id, code: valor }, machineOf(id));
      setTyped("");
      setPhase((p) => (p.t === "browser" ? { ...p, asks: false, submitting: false, submitted: true, codeError: null } : p));
    } catch (e) {
      setPhase((p) => (
        p.t === "browser"
          ? { ...p, submitting: false, submitted: false, codeError: loginCodeErrorText(e, t("settings.accounts.error.code")) }
          : p
      ));
    }
  }

  async function saveKey(id: string) {
    if (!typed().trim()) return;
    try {
      await invoke("set_api_key", { provider, id, key: typed().trim() }, machineOf(id));
      fresh = null;
      reset();
      await invoke("account_status", { provider, id }, machineOf(id)).catch(() => null);
      await refresh();
    } catch (e) {
      setFailure(e);
    }
  }

  onMount(() => {
    void refresh();
    props.register(() => void cancel());
    const off = listen<LoginEvent>("account", (e) => {
      const { account, kind, text } = e.payload;
      if (account !== running()) return;
      const shown = (): Extract<Phase, { t: "browser" }> => {
        const p = phase();
        return p.t === "browser" ? p : { t: "browser", url: null, code: null, notice: null, asks: false };
      };
      if (kind === "url") {
        setPhase({ ...shown(), url: text });
        // A headless computer has no browser: the page opens in a new tab of this one.
        invoke("open_external", { target: text }).catch(() => {});
      } else if (kind === "confirm") setPhase({ ...shown(), code: text });
      else if (kind === "code") setPhase({ ...shown(), asks: true, submitted: false, codeError: null });
      else if (kind === "notice") {
        const msg = text.trim();
        if (msg && !/^https?:\/\//.test(msg)) {
          setPhase({ ...shown(), notice: msg });
        }
      } else if (kind === "done") {
        reset();
        if (text) {
          setFailure({ what: t("web.onboarding.accounts.failed", { agent: nombreDeAgente(props.provider) }), detail: text });
          void discard(account);
          return;
        }
        fresh = null;
        void invoke("account_status", { provider, id: account }, machineOf(account))
          .catch(() => null)
          .then(() => refresh());
      }
    });
    onCleanup(() => void off.then((f) => f()));
  });

  return (
    <div class="grid gap-3 rounded-md border border-border bg-surface-raised px-4 py-3" data-provider-card={provider}>
      <div class="flex items-center gap-3">
        <MarcaAgente id={provider} size={20} />
        <div class="grid min-w-0 flex-1 gap-0.5">
          <strong class="text-sm font-semibold text-neutral-950">{nombreDeAgente(props.provider)}</strong>
          <For each={signedIn()}>
            {(a) => <span class="truncate text-xs text-neutral-500" data-connected-account="">{a.identity ?? a.label}</span>}
          </For>
        </div>
        <Switch>
          <Match when={phase().t === "idle" && signedIn().length > 0}>
            <Badge tone="success">{t("onboarding.accounts.connected")}</Badge>
            <Button size="sm" variant="ghost" onClick={() => void connect()}>
              {t("web.onboarding.accounts.another")}
            </Button>
          </Match>
          <Match when={phase().t === "idle"}>
            <Button size="sm" variant="secondary" onClick={() => void connect()}>
              {t("onboarding.accounts.connect")}
            </Button>
          </Match>
          <Match when={true}>
            <Button size="sm" variant="ghost" onClick={() => void cancel()}>
              {t("onboarding.cancel")}
            </Button>
          </Match>
        </Switch>
      </div>

      <Switch>
        <Match when={phase().t === "starting"}>
          <p role="status" class="m-0 text-xs text-neutral-500">{t("web.onboarding.accounts.starting")}</p>
        </Match>
        <Match when={phase().t === "browser" && (phase() as Extract<Phase, { t: "browser" }>)}>
          {(p) => {
            const loopback = () => hasLoopbackRedirect(p().url);
            return (
              <div class="grid gap-2 text-sm">
                <Show when={p().url} fallback={<p role="status" class="m-0 text-xs text-neutral-500">{t("web.onboarding.accounts.starting")}</p>}>
                  {(url) => <LoginUrlActions url={url()} openLabel={t("web.onboarding.accounts.open")} />}
                </Show>
                <Show when={p().code}>
                  {(code) => (
                    <p class="m-0 text-neutral-950" data-login-code="">
                      {t("web.onboarding.accounts.type_code")} <strong class="font-mono select-all">{code()}</strong>
                    </p>
                  )}
                </Show>
                <Show when={p().notice && !(p().asks && loopback())}>
                  {(notice) => <p class="m-0 text-xs text-neutral-500" data-login-notice="">{notice()}</p>}
                </Show>
                <Show when={p().asks}>
                  <div class="grid gap-1.5">
                    <p class="m-0 text-xs font-medium text-neutral-700">
                      {loopback() ? t("settings.accounts.step_callback_url") : t("settings.accounts.step_code")}
                    </p>
                    <Show when={loopback()}>
                      <p class="m-0 text-xs text-neutral-500" data-login-loopback-hint="">
                        {t("settings.accounts.step_callback_url_hint")}
                      </p>
                    </Show>
                    <LoginCodeForm
                      value={typed()}
                      onInput={(v) => {
                        setTyped(v);
                        setPhase((cur) => (cur.t === "browser" && cur.codeError ? { ...cur, codeError: null } : cur));
                      }}
                      onSubmit={() => void sendCode()}
                      submitting={p().submitting}
                      error={p().codeError}
                      mode={loopback() ? "callback_url" : "code"}
                    />
                  </div>
                </Show>
                <Show when={!p().asks && p().submitted}>
                  <p role="status" data-login-code-sent="" class="m-0 flex items-center gap-1.5 text-xs text-neutral-500">
                    <Spinner size={12} />
                    {loopback() ? t("settings.accounts.verifying_callback_url") : t("settings.accounts.verifying_code")}
                  </p>
                </Show>
              </div>
            );
          }}
        </Match>
        <Match when={phase().t === "key" && (phase() as Extract<Phase, { t: "key" }>)}>
          {(p) => (
            <form
              class="grid gap-2"
              onSubmit={(ev) => {
                ev.preventDefault();
                void saveKey(p().id);
              }}
            >
              <div class="flex gap-2">
                <Input
                  class="flex-1"
                  type="password"
                  autocomplete="off"
                  aria-label={t("web.onboarding.accounts.api_key")}
                  placeholder={t("web.onboarding.accounts.api_key")}
                  value={typed()}
                  onInput={(ev) => setTyped(ev.currentTarget.value)}
                />
                <Button size="sm" type="submit" disabled={!typed().trim()}>
                  {t("web.onboarding.accounts.save_key")}
                </Button>
              </div>
              <Show when={accountKeyUrl(props.provider)}>
                {(where) => (
                  <a class="text-xs text-primary underline" href={where()} target="_blank" rel="noopener noreferrer">
                    {t("web.onboarding.accounts.get_key")}
                  </a>
                )}
              </Show>
            </form>
          )}
        </Match>
      </Switch>

      <Show when={failure()}>{(f) => <FailureNote f={asFailure(f())} />}</Show>
    </div>
  );
}
