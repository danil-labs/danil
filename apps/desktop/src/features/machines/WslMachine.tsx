import { For, Match, Show, Switch, createSignal } from "solid-js";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke";
import { capabilities } from "../../lib/platform";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { SignalDot } from "../../ui/SignalDot";
import { Spinner } from "../../ui/Spinner";
import { SettingsBlock, SettingsSection } from "../settings/layout";
import { WSL_INSTALL, WSL_INSTALL_UBUNTU, type WslDetection, wslFailureCode, wslState } from "./wsl";

function stateLabel(state: string): string {
  const found = wslState(state);
  switch (found.state) {
    case "running":
      return t("danil.wsl.state.running");
    case "stopped":
      return t("danil.wsl.state.stopped");
    case "installing":
      return t("danil.wsl.state.installing");
    case "other":
      return t("danil.wsl.state.other", { state });
    default:
      return t("danil.wsl.state.unknown");
  }
}

/** Configuración → Máquinas → Agregar WSL: detecta y lista los distros de este equipo. */
export function WslMachineSection() {
  if (!capabilities().wsl) return null;
  return <Section />;
}

function Section() {
  const [open, setOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [found, setFound] = createSignal<WslDetection | null>(null);
  const [failure, setFailure] = createSignal<string | null>(null);

  async function detect() {
    setBusy(true);
    setFailure(null);
    try {
      setFound(await invoke<WslDetection>("wsl_detect"));
    } catch (error) {
      setFound(null);
      setFailure(wslFailureCode(error));
    } finally {
      setBusy(false);
    }
  }

  function start() {
    setOpen(true);
    void detect();
  }

  return (
    <SettingsSection title={t("danil.wsl.title")}>
      <SettingsBlock>
        <Show
          when={open()}
          fallback={
            <Button size="sm" variant="secondary" class="justify-self-start" onClick={start} data-wsl-open="">
              {t("danil.wsl.button")}
            </Button>
          }
        >
          <div class="grid gap-3" data-wsl-state={busy() ? "busy" : (failure() ?? "ready")}>
            <Switch>
              <Match when={busy()}>
                <p class="m-0 flex items-center gap-2 text-sm text-neutral-500">
                  <Spinner size={14} />
                  {t("danil.wsl.detecting")}
                </p>
              </Match>
              <Match when={failure()}>
                {(code) => (
                  <div class="grid gap-1 rounded-sm border border-border p-2" role="alert" data-wsl-failure={code()}>
                    <p class="m-0 text-sm text-error-strong">{t(`danil.wsl.error.${code()}`)}</p>
                    <Show when={code() === "wsl_missing"}>
                      <code class="font-mono text-xs text-neutral-950">{WSL_INSTALL}</code>
                    </Show>
                  </div>
                )}
              </Match>
              <Match when={found()?.distros.length === 0}>
                <div class="grid gap-1 rounded-sm border border-border p-2" data-wsl-empty="">
                  <p class="m-0 text-sm text-neutral-950">{t("danil.wsl.empty")}</p>
                  <code class="font-mono text-xs text-neutral-950">{WSL_INSTALL_UBUNTU}</code>
                </div>
              </Match>
              <Match when={found()}>
                {(detection) => (
                  <ul class="m-0 grid list-none gap-2 p-0" data-wsl-distros="">
                    <For each={detection().distros}>
                      {(distro) => (
                        <li class="flex min-w-0 items-center gap-2 rounded-sm border border-border p-2" data-wsl-distro={distro.name}>
                          <SignalDot tone={wslState(distro.state).tone} />
                          <span class="min-w-0 flex-1 truncate text-ui text-neutral-950">{distro.name}</span>
                          <Show when={distro.default}>
                            <Badge tone="active">{t("danil.wsl.default")}</Badge>
                          </Show>
                          <span class="text-xs text-neutral-500">{stateLabel(distro.state)}</span>
                          <Show
                            when={distro.version}
                            fallback={<Badge forma="dato" tone="neutral">{t("danil.wsl.version_unknown")}</Badge>}
                          >
                            {(version) => <Badge forma="dato" tone="neutral">{t("danil.wsl.version", { version: version() })}</Badge>}
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                )}
              </Match>
            </Switch>
            <div>
              <Button size="sm" variant="secondary" disabled={busy()} onClick={() => void detect()}>
                {t("danil.wsl.refresh")}
              </Button>
            </div>
          </div>
        </Show>
      </SettingsBlock>
    </SettingsSection>
  );
}
