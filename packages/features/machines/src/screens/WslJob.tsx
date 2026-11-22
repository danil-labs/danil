import { invoke } from "@tauri-apps/api/core";
import { For, Match, Show, Switch } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Button } from "../../../../ui/src/Button";
import { ProgressBar } from "../../../../ui/src/ProgressBar";
import { SignalDot } from "../../../../ui/src/SignalDot";
import { Spinner } from "../../../../ui/src/Spinner";
import type { WslJob } from "../model/wsl";
import { MB, mb } from "./wsl-common";

const DISTRO_STEPS = ["download", "verify", "register", "user"] as const;
const ENGINE_STEPS = ["check", "deps", "engine_download", "engine_verify", "engine", "service", "connect"] as const;

function StepList(props: { steps: readonly string[]; current: string; done: boolean; labels?: string }) {
  const index = () => props.steps.indexOf(props.current);
  return (
    <ol class="m-0 grid list-none gap-1 p-0">
      <For each={props.steps}>
        {(step, i) => {
          const state = () => (props.done || (index() >= 0 && i() < index()) ? "done" : i() === index() ? "now" : "todo");
          return (
            <li class="flex items-center gap-2 text-ui" data-step={step} data-state={state()}>
              <span class="grid size-4 shrink-0 place-items-center">
                <Switch fallback={<SignalDot tone="off" />}>
                  <Match when={state() === "done"}><SignalDot tone="success" /></Match>
                  <Match when={state() === "now"}><Spinner size={12} /></Match>
                </Switch>
              </span>
              <span class={state() === "todo" ? "text-neutral-500" : "text-neutral-950"}>{t(`${props.labels ?? "danil.wsl.step"}.${step}`)}</span>
            </li>
          );
        }}
      </For>
    </ol>
  );
}

export function JobProgress(props: { job: WslJob }) {
  const inDistro = () => props.job.kind === "install" && (DISTRO_STEPS as readonly string[]).includes(props.job.step);
  const left = () => {
    const j = props.job;
    if (!j.total || !j.speed || !j.done) return null;
    return Math.max(0, Math.round((j.total - j.done) / j.speed));
  };
  return (
    <div class="grid gap-3 rounded-sm border border-border p-3" data-wsl-job={props.job.step}>
      <p class="m-0 text-sm font-[560] text-neutral-950">
        {props.job.kind === "install" ? t("danil.wsl.job.installing", { distro: props.job.label }) : t("danil.wsl.job.connecting", { distro: props.job.label })}
      </p>
      <Show when={props.job.step === "download" && props.job.total}>
        <div class="grid gap-1">
          <ProgressBar value={props.job.done ?? 0} max={props.job.total ?? 1} label={t("danil.wsl.step.download")} />
          <div class="flex items-center gap-2">
            <span class="flex-1 font-mono text-xs text-neutral-500">
              <Show
                when={!props.job.paused}
                fallback={t("danil.wsl.job.paused", { done: mb(props.job.done), total: mb(props.job.total) })}
              >
                {t("danil.wsl.job.downloaded", { done: mb(props.job.done), total: mb(props.job.total), speed: (props.job.speed ?? 0) / MB >= 0.1 ? ((props.job.speed ?? 0) / MB).toFixed(1) : "0", left: left() ?? "…" })}
              </Show>
            </span>
            <Button size="sm" variant="secondary" onClick={() => void invoke("wsl_job_pause", { paused: !props.job.paused })} data-wsl-pause="">
              {props.job.paused ? t("danil.wsl.job.resume") : t("danil.wsl.job.pause")}
            </Button>
          </div>
        </div>
      </Show>
      <Show when={props.job.kind === "install"}>
        <div class="grid gap-1">
          <p class="m-0 text-xs font-[560] text-neutral-500">{t("danil.wsl.job.part_distro")}</p>
          <StepList steps={DISTRO_STEPS} current={props.job.step} done={!inDistro()} />
        </div>
      </Show>
      <div class="grid gap-1">
        <Show when={props.job.kind === "install"}>
          <p class="m-0 text-xs font-[560] text-neutral-500">{t("danil.wsl.job.part_engine")}</p>
        </Show>
        <StepList steps={ENGINE_STEPS} current={inDistro() ? "" : props.job.step} done={false} />
      </div>
      <Show when={props.job.lines.length}>
        <details class="text-xs text-neutral-500">
          <summary class="cursor-pointer">{t("danil.wsl.job.lines")}</summary>
          <pre class="m-0 mt-1 max-h-40 overflow-auto font-mono text-xs whitespace-pre-wrap">{props.job.lines.slice(-30).join("\n")}</pre>
        </details>
      </Show>
      <p class="m-0 text-xs text-neutral-500">{t("danil.wsl.can_leave")}</p>
    </div>
  );
}

export function Technical(props: { text: string }) {
  return (
    <details class="text-xs text-neutral-500">
      <summary class="cursor-pointer">{t("danil.wsl.technical")}</summary>
      <pre class="m-0 mt-1 max-h-32 overflow-auto font-mono text-xs whitespace-pre-wrap">{props.text}</pre>
    </details>
  );
}

const KNOWN = new Set(["reboot_required", "apt_lock", "already_installed", "network", "checksum", "interrupted", "user_required", "invalid_user", "invalid_password", "elevation_refused", "app_unavailable", "wsl_missing", "wsl_timeout", "arch"]);

export function JobFailure(props: { job: WslJob; onRetry?: () => void; onClose: () => void }) {
  const code = () => (KNOWN.has(props.job.error?.code ?? "") ? props.job.error!.code : "other");
  return (
    <div class="grid gap-2 rounded-sm border border-border p-3" role="alert" data-wsl-failure={props.job.error?.code}>
      <p class="m-0 text-sm font-[560] text-error-strong">
        {props.job.kind === "enable" ? t("danil.wsl.fail.enable") : t("danil.wsl.fail.title", { distro: props.job.label })}
      </p>
      <p class="m-0 text-xs text-neutral-700">{t(`danil.wsl.fail.${code()}`)}</p>
      <Show when={props.job.error?.detail}>{(d) => <Technical text={d()} />}</Show>
      <div class="flex gap-2">
        <Show when={props.onRetry}>
          <Button size="sm" onClick={props.onRetry}>{t("danil.wsl.retry")}</Button>
        </Show>
        <Button size="sm" variant="secondary" onClick={props.onClose}>{t("danil.wsl.close")}</Button>
      </div>
    </div>
  );
}
