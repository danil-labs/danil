import { listen } from "../../../../apps/desktop/src/lib/serviceEvents";
import Copy from "lucide-solid/icons/copy";
import { createEffect, createSignal, Match, onCleanup, Show, Switch } from "solid-js";
import { createCopied } from "../../../host/src/clipboard";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { invoke } from "../../../engine-client/src/client.ts";
import { Button } from "../../../ui/src/Button";
import { prosaDe } from "../../../ui/src/Failure";
import { Input } from "../../../ui/src/Input";
import { createNow } from "../../../../apps/desktop/src/lib/sharedClock";

type Pairing = { code: string; expires_at_ms: number };

type TelegramStatus = {
  token_saved: boolean;
  bot_username: string | null;
  enabled: boolean;
  paired_chats: number;
  pairing: Pairing | null;
  topics_enabled: boolean;
  topics: number;
};

type AwakeMode = "on" | "agent" | "off";

const SECTION = "grid gap-2";
const LABEL = "text-xs font-semibold text-neutral-500";
const NOTE = "m-0 text-xs text-neutral-500";

/**
 * El bot de Telegram de este agente. Cada agente tiene el suyo: un bot no se
 * comparte entre dos. El token no vuelve nunca a la pantalla; solo se sabe si
 * está guardado y de qué bot es.
 */
export function TelegramSection(props: { project: string; name: string }) {
  const [status, setStatus] = createSignal<TelegramStatus | null>(null);
  const [token, setToken] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const { copied, copy } = createCopied(1500, (error) => setFailure(prosaDe(error)));
  const [failure, setFailure] = createSignal<string | null>(null);
  const now = createNow();
  const [replacing, setReplacing] = createSignal(false);
  const [awake, setAwake] = createSignal<AwakeMode | null>(null);

  let request = 0;
  async function refresh() {
    const mine = ++request;
    try {
      const next = await invoke<TelegramStatus>("telegram_status", {
        project: props.project,
        name: props.name,
      });
      if (mine === request) setStatus(next);
    } catch (error) {
      if (mine === request) setFailure(prosaDe(error));
    }
  }

  createEffect(() => {
    void props.project;
    void props.name;
    setStatus(null);
    void refresh();
  });
  const events = listen("telegram-changed", () => void refresh());
  void invoke<{ mode: AwakeMode }>("keep_awake_status")
    .then((s) => setAwake(s.mode))
    .catch(() => {});
  const awakeEvents = listen<{ mode: AwakeMode }>("keep-awake-changed", (e) =>
    setAwake(e.payload.mode),
  );
  onCleanup(() => {
    request++;
    void events.then((unlisten) => unlisten());
    void awakeEvents.then((unlisten) => unlisten());
  });

  async function run(action: () => Promise<unknown>) {
    setFailure(null);
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setFailure(prosaDe(error));
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  const saveToken = () =>
    run(async () => {
      await invoke("telegram_set_token", {
        project: props.project,
        name: props.name,
        token: token().trim(),
      });
      setToken("");
      setReplacing(false);
    });
  const startPairing = () =>
    run(() =>
      invoke<Pairing>("telegram_start_pairing", { project: props.project, name: props.name }),
    );
  const disable = () =>
    run(() => invoke("telegram_disable", { project: props.project, name: props.name }));
  const awakeAlways = () => run(() => invoke("set_keep_awake", { mode: "on" }));
  const awakeWhileWorking = () => run(() => invoke("set_keep_awake", { mode: "agent" }));

  const pending = () => {
    const p = status()?.pairing;
    return p && p.expires_at_ms > now() ? p : null;
  };
  const connected = () => {
    const s = status();
    return !!s && s.enabled && s.paired_chats > 0;
  };
  const remaining = (p: Pairing) => {
    const seconds = Math.max(0, Math.ceil((p.expires_at_ms - now()) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  };

  return (
    <section class={SECTION}>
      <span class={LABEL}>{t("projects.agents.telegram_title")}</span>
      <Show when={status()?.bot_username}>
        {(bot) => <span class={NOTE}>{t("projects.agents.telegram_bot", { bot: `@${bot()}` })}</span>}
      </Show>
      <Show when={status()}>
        {(s) => (
          <Switch>
            <Match when={!s().token_saved || replacing()}>
              <form
                class="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (token().trim()) void saveToken();
                }}
              >
                <Input
                  type="password"
                  autocomplete="off"
                  aria-label={t("projects.agents.telegram_token")}
                  placeholder={t("projects.agents.telegram_token")}
                  value={token()}
                  onInput={(e) => setToken(e.currentTarget.value)}
                />
                <Button size="sm" type="submit" disabled={busy() || !token().trim()}>
                  {t("projects.agents.telegram_token_save")}
                </Button>
              </form>
              <p class={NOTE}>{t("projects.agents.telegram_token_how")}</p>
              <Show when={replacing()}>
                <p class="m-0 text-xs text-warning-strong">
                  {t("projects.agents.telegram_token_change_what")}
                </p>
                <div>
                  <Button size="sm" variant="ghost" onClick={() => setReplacing(false)}>
                    {t("projects.agents.telegram_token_keep")}
                  </Button>
                </div>
              </Show>
            </Match>
            <Match when={pending()}>
              {(p) => (
                <>
                  <div class="flex items-center gap-3">
                    <span
                      class="font-mono text-2xl font-semibold tracking-[0.3em] select-all"
                      aria-label={t("projects.agents.telegram_code")}
                    >
                      {p().code}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => void copy(p().code)}>
                      <Copy size={14} />
                      {copied()
                        ? t("projects.agents.telegram_code_copied")
                        : t("projects.agents.telegram_code_copy")}
                    </Button>
                  </div>
                  <span class="text-xs text-neutral-500">
                    {t("projects.agents.telegram_code_expires", { time: remaining(p()) })}
                  </span>
                  <p class="m-0 text-ui text-neutral-700">
                    {t("projects.agents.telegram_code_how")}
                  </p>
                </>
              )}
            </Match>
            <Match when={connected()}>
              <span class="text-ui text-neutral-700">
                {t("projects.agents.telegram_connected", { count: s().paired_chats })}
              </span>
              <p class={NOTE}>
                {s().topics_enabled
                  ? t("projects.agents.telegram_topics_on", { count: s().topics })
                  : t("projects.agents.telegram_topics_off")}
              </p>
              <Show
                when={awake() === "on"}
                fallback={
                  <div class="grid gap-1">
                    <p class={NOTE}>{t("projects.agents.telegram_awake_off")}</p>
                    <div>
                      <Button size="sm" variant="ghost" disabled={busy()} onClick={() => void awakeAlways()}>
                        {t("projects.agents.telegram_awake_set")}
                      </Button>
                    </div>
                  </div>
                }
              >
                <div class="grid gap-1">
                  <p class={NOTE}>{t("projects.agents.telegram_awake_on")}</p>
                  <div>
                    <Button size="sm" variant="ghost" disabled={busy()} onClick={() => void awakeWhileWorking()}>
                      {t("projects.agents.telegram_awake_unset")}
                    </Button>
                  </div>
                </div>
              </Show>
              <div>
                <Button size="sm" variant="ghost" disabled={busy()} onClick={() => void disable()}>
                  {t("projects.agents.telegram_disconnect")}
                </Button>
              </div>
            </Match>
            <Match when={true}>
              <div>
                <Button size="sm" disabled={busy()} onClick={() => void startPairing()}>
                  {t("projects.agents.telegram_connect")}
                </Button>
              </div>
              <p class={NOTE}>{t("projects.agents.telegram_connect_what")}</p>
            </Match>
          </Switch>
        )}
      </Show>
      <Show when={status()?.token_saved && !replacing()}>
        <div>
          <Button size="sm" variant="ghost" onClick={() => setReplacing(true)}>
            {t("projects.agents.telegram_token_change")}
          </Button>
        </div>
      </Show>
      <Show when={failure()}>
        {(text) => <p class="m-0 text-xs text-error-strong">{text()}</p>}
      </Show>
    </section>
  );
}
