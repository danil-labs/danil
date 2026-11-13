import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { peso } from "../../lib/format";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import { capabilities } from "../../lib/platform";
import { listen } from "../../lib/serviceEvents";
import { Button } from "../../ui/Button";
import { asFailure, detalleDe, type Failure, FailureNote, prosaDe } from "../../ui/Failure";
import type { Requirement } from "./environment-store";
import { SettingsBlock, SettingsSection } from "./layout";
import "../../locales/settingsPhrases";

export default function BrowserNavigation(props: { requirement?: Requirement; onPrepared: () => Promise<void> }) {
  if (!capabilities().localSetup) return null;
  const [running, setRunning] = createSignal(false);
  const [cancelling, setCancelling] = createSignal(false);
  const [authorizing, setAuthorizing] = createSignal(false);
  const [prepared, setReady] = createSignal(false);
  const ready = () => prepared() || (props.requirement?.ok && !props.requirement.installable);
  const [failure, setFailure] = createSignal<Failure | null>(null);
  const [progress, setProgress] = createSignal({ done: 0, bytes: 0 });
  onMount(() => {
    void invoke<number>("install_size", { operation: "tool:browser-navigation" })
      .then((bytes) => { if (!running()) setProgress((p) => ({ ...p, bytes })); })
      .catch(() => {});
    const events = listen<{ operation: string; done: number; bytes: number }>("install", (e) => {
      if (e.payload.operation === "tool:browser-navigation" && running()) {
        setAuthorizing(false);
        setProgress(e.payload);
      }
    });
    onCleanup(() => void events.then((stop) => stop()));
  });

  async function install(allowSandbox = false) {
    if (running()) return;
    setRunning(true);
    setCancelling(false);
    setAuthorizing(allowSandbox);
    setFailure(null);
    setProgress((p) => ({ ...p, done: 0 }));
    try {
      await invoke("install_tool", { tool: allowSandbox ? "browser-navigation-sandbox" : "browser-navigation" });
      setReady(true);
      await props.onPrepared();
    } catch (e) {
      if (!prosaDe(e).includes("install.cancelled")) setFailure(asFailure(e));
    } finally {
      setRunning(false);
      setCancelling(false);
      setAuthorizing(false);
    }
  }

  async function cancel() {
    setCancelling(true);
    try {
      await invoke("cancel_install", { operation: "tool:browser-navigation" });
    } catch (e) {
      setFailure(asFailure(e));
      setCancelling(false);
    }
  }

  return (
    <SettingsSection title={t("settings.environment.browser.title")} description={t("settings.environment.browser.description")}>
      <SettingsBlock>
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="compact" disabled={running() || ready()} onClick={() => void install()}>
            {running() ? t("settings.environment.preparing") : ready() ? t("setup.row.ready") : failure() ? t("setup.retry") : props.requirement?.ok ? t("settings.environment.update") : t("settings.environment.browser.install")}
          </Button>
          <Show when={running() && !authorizing()}>
            <Button variant="ghost" size="compact" disabled={cancelling()} onClick={() => void cancel()}>
              {t("settings.integrations.cancel")}
            </Button>
          </Show>
          <Show when={progress().bytes > 0}>
            <span class="text-xs text-neutral-500" role="status">
              {running() ? t("settings.accounts.downloading", { done: peso(progress().done), total: peso(progress().bytes) }) : peso(progress().bytes)}
            </span>
          </Show>
        </div>
        <Show when={failure() && detalleDe(failure()).includes("browser_navigation_sandbox_required")}>
          <p class="text-sm text-neutral-500">{t("settings.environment.browser.sandbox_description")}</p>
          <Button variant="secondary" size="compact" disabled={running()} onClick={() => void install(true)}>
            {t("settings.environment.browser.sandbox_allow")}
          </Button>
        </Show>
        <Show when={failure()}>{(f) => <FailureNote f={f()} />}</Show>
      </SettingsBlock>
    </SettingsSection>
  );
}
