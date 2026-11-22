import { invoke } from "@tauri-apps/api/core";
import { For, Show, createSignal } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Button } from "../../../../ui/src/Button";
import { SignalDot } from "../../../../ui/src/SignalDot";
import { Spinner } from "../../../../ui/src/Spinner";
import type { WslJob } from "../model/wsl";
import { activeWorkspace } from "./wsl-common";
import { PasswordFields } from "./WslFields";

export function MissingCard(props: { onEnable: () => void }) {
  return (
    <div class="grid gap-2 rounded-sm border border-border p-3" data-wsl-missing="">
      <p class="m-0 text-sm font-[560] text-neutral-950">{t("danil.wsl.missing.title")}</p>
      <p class="m-0 text-xs text-neutral-500">{t("danil.wsl.missing.body")}</p>
      <div class="flex items-center gap-2">
        <Button size="sm" onClick={props.onEnable} data-wsl-enable="">
          {t("danil.wsl.missing.enable")}
        </Button>
        <span class="text-xs text-neutral-500">{t("danil.wsl.missing.time")}</span>
      </div>
    </div>
  );
}

export function EnablingCard() {
  const steps = ["permission", "platform", "subsystem"] as const;
  return (
    <div class="grid gap-2 rounded-sm border border-border p-3" data-wsl-enabling="">
      <p class="m-0 flex items-center gap-2 text-sm font-[560] text-neutral-950">
        <Spinner size={14} />
        {t("danil.wsl.enabling.title")}
      </p>
      <ol class="m-0 grid list-none gap-1 p-0">
        <For each={steps}>
          {(step) => (
            <li class="flex items-center gap-2 text-ui text-neutral-700">
              <SignalDot tone="working" />
              {t(`danil.wsl.enabling.${step}`)}
            </li>
          )}
        </For>
      </ol>
      <p class="m-0 text-xs text-neutral-500">{t("danil.wsl.can_leave")}</p>
    </div>
  );
}

export function RebootCard(props: { resume: { label: string; user: string } | null }) {
  const [asked, setAsked] = createSignal(false);
  return (
    <div class="grid gap-2 rounded-sm border border-border p-3" data-wsl-reboot="">
      <p class="m-0 text-sm font-[560] text-neutral-950">{t("danil.wsl.reboot.title")}</p>
      <p class="m-0 text-xs text-neutral-500">{t("danil.wsl.reboot.body")}</p>
      <Show when={props.resume}>
        {(r) => <p class="m-0 text-xs text-neutral-700">{t("danil.wsl.reboot.pending", { distro: r().label, user: r().user })}</p>}
      </Show>
      <div class="flex items-center gap-2">
        <Button size="sm" disabled={asked()} onClick={() => void invoke("wsl_reboot").then(() => setAsked(true))} data-wsl-reboot-now="">
          {t("danil.wsl.reboot.now")}
        </Button>
        <Show when={asked()}>
          <span class="text-xs text-neutral-500">{t("danil.wsl.reboot.soon")}</span>
        </Show>
      </div>
    </div>
  );
}

export function ResumeCard(props: { resume: { name: string; label: string; url: string; sha256: string; user: string }; onStarted: (j: WslJob) => void; onForget: () => void }) {
  const [password, setPassword] = createSignal({ value: "", ok: false });
  async function go() {
    const ws = await activeWorkspace();
    const r = props.resume;
    props.onStarted(
      await invoke<WslJob>("wsl_install", {
        name: r.name,
        label: r.label,
        url: r.url,
        sha256: r.sha256,
        user: r.user,
        password: password().value,
        workspace: ws?.id ?? null,
        workspaceName: ws?.name ?? null,
      }),
    );
  }
  return (
    <div class="grid gap-2 rounded-sm border border-border p-3" data-wsl-resume="">
      <p class="m-0 text-sm font-[560] text-neutral-950">{t("danil.wsl.resume.title")}</p>
      <p class="m-0 text-xs text-neutral-500">{t("danil.wsl.resume.body", { distro: props.resume.label, user: props.resume.user })}</p>
      <PasswordFields onChange={(value, ok) => setPassword({ value, ok })} />
      <div class="flex gap-2">
        <Button size="sm" disabled={!password().ok} onClick={() => void go()}>
          {t("danil.wsl.resume.go", { distro: props.resume.label })}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void invoke("wsl_resume_forget").then(props.onForget)}>
          {t("danil.wsl.resume.other")}
        </Button>
      </div>
    </div>
  );
}
