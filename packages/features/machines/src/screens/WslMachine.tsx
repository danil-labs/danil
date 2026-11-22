// Todo va directo a la ventana, sin el reparto entre máquinas ni sus reintentos:
// repetir una instalación por un `app_unavailable` la correría dos veces.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "../../../../../apps/desktop/src/lib/serviceEvents";
import { For, Match, Show, Switch, createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { offersGuests } from "../queries/guestChannels";
import { Button } from "../../../../ui/src/Button";
import { Spinner } from "../../../../ui/src/Spinner";
import { SettingsBlock, SettingsRow, SettingsSection } from "../../../../ui/src/SettingsLayout";
import type { WslChild, WslJob, WslLinuxState } from "../model/wsl";
import { fleetChanged } from "./wsl-common";
import { EnablingCard, MissingCard, RebootCard, ResumeCard } from "./WslCards";
import { Distro } from "./WslDistro";
import { Installer } from "./WslInstaller";
import { JobFailure, JobProgress, Technical } from "./WslJob";

export { DistroBox } from "./WslDistroBox";
export { StepList, Technical } from "./WslJob";

/**
 * Configuración → Máquinas → Linux en esta PC. Lo que se ve lo guarda la
 * ventana (`wsl_state`, `guest-job`), no esta pantalla: salir de Configuración
 * o reiniciar no pierde el avance (`docs/wsl-local-machine.md`).
 */
export function WslMachineSection() {
  return (
    <Show when={offersGuests("wsl")}>
      <Section />
    </Show>
  );
}

function Section() {
  const [linux, setLinux] = createSignal<WslLinuxState | null>(null);
  const [job, setJob] = createSignal<WslJob | null>(null);
  const [reading, setReading] = createSignal(false);
  const [installing, setInstalling] = createSignal(false);

  async function load() {
    setReading(true);
    try {
      const next = await invoke<WslLinuxState>("wsl_state");
      setLinux(next);
      setJob(next.job);
    } catch {
      setLinux({ wsl: "unknown", distros: [], job: null, resume: null, detail: null });
    } finally {
      setReading(false);
    }
  }

  onMount(() => void load());
  const stopJob = listen<WslJob | null>("guest-job", (e) => setJob(e.payload));
  const stopState = listen("guest-state-changed", () => {
    fleetChanged();
    void load();
  });
  onCleanup(() => {
    void stopJob.then((f) => f());
    void stopState.then((f) => f());
  });

  const running = () => {
    const j = job();
    return j && !j.finished ? j : null;
  };
  const ended = () => {
    const j = job();
    return j && j.finished ? j : null;
  };
  const dismiss = () => {
    void invoke("wsl_job_dismiss").then(() => setJob(null));
  };
  const enable = () => {
    void invoke<WslJob>("wsl_enable").then(setJob);
  };

  return (
    <SettingsSection title={t("danil.wsl.title")}>
      <SettingsBlock>
        <div class="grid gap-3" data-wsl={linux()?.wsl ?? "loading"}>
          <p class="m-0 text-xs text-neutral-500">{t("danil.wsl.lead")}</p>
          <Switch>
            <Match when={!linux()}>
              <p class="m-0 flex items-center gap-2 text-sm text-neutral-500">
                <Spinner size={14} />
                {t("danil.wsl.reading")}
              </p>
            </Match>
            <Match when={running()?.kind === "enable"}>
              <EnablingCard />
            </Match>
            <Match when={ended()?.kind === "enable" && ended()?.error}>
              <JobFailure job={ended()!} onRetry={enable} onClose={dismiss} />
            </Match>
            <Match when={linux()?.wsl === "missing"}>
              <MissingCard onEnable={enable} />
            </Match>
            <Match when={linux()?.wsl === "reboot"}>
              <RebootCard resume={linux()?.resume ?? null} />
            </Match>
            <Match when={linux()?.wsl === "virtualization"}>
              <div class="grid gap-1 rounded-sm border border-border p-3" data-wsl-virtualization="">
                <p class="m-0 text-sm font-[560] text-neutral-950">{t("danil.wsl.virtualization.title")}</p>
                <p class="m-0 text-xs text-neutral-500">{t("danil.wsl.virtualization.body")}</p>
              </div>
            </Match>
            <Match when={linux()?.wsl === "unsupported"}>
              <p class="m-0 text-sm text-neutral-500">{t("danil.wsl.unsupported")}</p>
            </Match>
            <Match when={linux()?.wsl === "unknown"}>
              <div class="grid gap-2 rounded-sm border border-border p-3" role="alert">
                <p class="m-0 text-sm text-error-strong">{t("danil.wsl.unknown")}</p>
                <Show when={linux()?.detail}>
                  {(d) => <Technical text={d()} />}
                </Show>
                <Button size="sm" variant="secondary" class="justify-self-start" disabled={reading()} onClick={() => void load()}>
                  {t("danil.wsl.retry")}
                </Button>
              </div>
            </Match>
            <Match when={linux()?.wsl === "ready"}>
              <div class="grid gap-3">
                <Show when={linux()?.resume && !running()}>
                  <ResumeCard resume={linux()!.resume!} onStarted={setJob} onForget={() => void load()} />
                </Show>
                <Show when={running() || ended()}>
                  {(j) => (
                    <Show when={j().kind !== "enable"}>
                      <Show
                        when={j().error}
                        fallback={<Show when={!j().finished}><JobProgress job={j()} /></Show>}
                      >
                        <JobFailure job={j()} onClose={dismiss} />
                      </Show>
                    </Show>
                  )}
                </Show>
                <Show when={linux()!.distros.length === 0 && !running()}>
                  <p class="m-0 text-sm text-neutral-700">{t("danil.wsl.empty")}</p>
                </Show>
                <For each={linux()!.distros.filter((d) => !d.system)}>
                  {(d) => <Distro row={d} busy={!!running()} onStarted={setJob} onChanged={() => { fleetChanged(); void load(); }} />}
                </For>
                <Show when={linux()!.distros.some((d) => d.system)}>
                  <p class="m-0 text-xs text-neutral-500">
                    {t("danil.wsl.system_distros", { names: linux()!.distros.filter((d) => d.system).map((d) => d.name).join(", ") })}
                  </p>
                </Show>
                <Show
                  when={installing()}
                  fallback={
                    <Show when={!running()}>
                      <Button size="sm" class="justify-self-start" onClick={() => setInstalling(true)} data-wsl-install="">
                        {t("danil.wsl.install")}
                      </Button>
                    </Show>
                  }
                >
                  <Installer
                    installed={linux()!.distros.map((d) => d.name)}
                    onCancel={() => setInstalling(false)}
                    onStarted={(j) => {
                      setInstalling(false);
                      setJob(j);
                    }}
                  />
                </Show>
              </div>
            </Match>
          </Switch>
        </div>
      </SettingsBlock>
    </SettingsSection>
  );
}

/** Las distribuciones conectadas, como una máquina más en «Máquinas de este workspace». Solo existen en esta PC. */
export function WslMachineRows() {
  const [rows, setRows] = createSignal<WslChild[]>([]);
  const offered = () => offersGuests("wsl");
  const read = () => {
    if (!offered()) return;
    void invoke<WslChild[]>("guest_children", { fresh: false }).then(setRows).catch(() => setRows([]));
  };
  createEffect(on(offered, read));
  window.addEventListener("danil:guests-changed", read);
  onCleanup(() => window.removeEventListener("danil:guests-changed", read));
  return (
    <For each={rows()}>
      {(c) => (
        <SettingsRow
          data-account-computer={c.id}
          data-wsl-machine=""
          label={<span class="truncate">{c.name}</span>}
          description={c.online ? t("danil.wsl.row.online") : t("danil.wsl.row.off")}
        />
      )}
    </For>
  );
}
