// Todo va directo a la ventana, sin el reparto entre máquinas ni sus reintentos:
// repetir una instalación por un `app_unavailable` la correría dos veces.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "../../lib/serviceEvents";
import { For, Match, Show, Switch, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import { t } from "../../lib/i18n";
import { offersGuests } from "./guestChannels";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { MarcaAgente } from "../../ui/icons";
import { Input } from "../../ui/Input";
import { ProgressBar } from "../../ui/ProgressBar";
import { SignalDot } from "../../ui/SignalDot";
import { Spinner } from "../../ui/Spinner";
import { SettingsBlock, SettingsRow, SettingsSection } from "../settings/layout";
import {
  linuxUserSlug,
  type WslCatalogItem,
  type WslChild,
  type WslDistroRow,
  type WslDistroUser,
  type WslJob,
  type WslLinuxState,
  wslState,
  wslUserProblem,
} from "./wsl";

const MB = 1024 * 1024;
const mb = (bytes: number | null | undefined) => Math.max(0, Math.round((bytes ?? 0) / MB));

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

/** La flota (Ejecutar en) vuelve a leer las distribuciones conectadas. */
const fleetChanged = () => window.dispatchEvent(new CustomEvent("danil:guests-changed"));

type Workspaces = { workspaces?: { id: string; name?: string }[]; active?: string | null };

/** El workspace de la ventana: la distribución lo crea con el mismo id. */
async function activeWorkspace(): Promise<{ id: string; name: string } | null> {
  try {
    const list = await invoke<Workspaces>("list_workspaces");
    const id = list?.active ?? null;
    if (!id) return null;
    return { id, name: list.workspaces?.find((w) => w.id === id)?.name ?? id };
  } catch {
    return null;
  }
}

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

function MissingCard(props: { onEnable: () => void }) {
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

function EnablingCard() {
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

function RebootCard(props: { resume: { label: string; user: string } | null }) {
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

function ResumeCard(props: { resume: { name: string; label: string; url: string; sha256: string; user: string }; onStarted: (j: WslJob) => void; onForget: () => void }) {
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

function PasswordFields(props: { onChange: (password: string, ok: boolean) => void }) {
  const [p1, setP1] = createSignal("");
  const [p2, setP2] = createSignal("");
  const ok = () => p1().length > 0 && p1() === p2();
  const emit = () => props.onChange(p1(), ok());
  return (
    <div class="grid gap-2 sm:grid-cols-2">
      <label class="grid gap-1 text-xs text-neutral-500">
        {t("danil.wsl.password")}
        <Input type="password" value={p1()} autocomplete="new-password" placeholder={t("danil.wsl.password_placeholder")} onInput={(e) => { setP1(e.currentTarget.value); emit(); }} />
      </label>
      <label class="grid gap-1 text-xs text-neutral-500">
        {t("danil.wsl.password_again")}
        <Input type="password" value={p2()} autocomplete="new-password" placeholder={t("danil.wsl.password_again_placeholder")} onInput={(e) => { setP2(e.currentTarget.value); emit(); }} />
        <Show when={p2() && !ok()}>
          <span class="text-xs text-error-strong">{t("danil.wsl.password_mismatch")}</span>
        </Show>
      </label>
    </div>
  );
}

/** Usuario y contraseña de Linux, como la primera vez que se abre Ubuntu. */
function UserFields(props: { onChange: (user: string, password: string, ok: boolean) => void }) {
  const [user, setUser] = createSignal("");
  const [password, setPassword] = createSignal({ value: "", ok: false });
  const problem = () => wslUserProblem(user());
  const emit = () => props.onChange(user(), password().value, problem() === null && password().ok);
  return (
    <div class="grid gap-2" data-wsl-user="">
      <label class="grid gap-1 text-xs text-neutral-500">
        {t("danil.wsl.user")}
        <Input
          value={user()}
          maxLength={32}
          autocomplete="off"
          placeholder={t("danil.wsl.user_placeholder")}
          onInput={(e) => {
            const slug = linuxUserSlug(e.currentTarget.value);
            if (slug !== e.currentTarget.value) e.currentTarget.value = slug;
            setUser(slug);
            emit();
          }}
        />
        <span class="text-xs text-neutral-500">{t("danil.wsl.user_rule")}</span>
      </label>
      <Show when={user() && problem()}>{(p) => <span class="text-xs text-error-strong">{t(`danil.wsl.user_problem.${p()}`)}</span>}</Show>
      <PasswordFields
        onChange={(value, ok) => {
          setPassword({ value, ok });
          emit();
        }}
      />
      <p class="m-0 text-xs text-neutral-500">{t("danil.wsl.password_kept")}</p>
    </div>
  );
}

function Installer(props: { installed: string[]; onCancel: () => void; onStarted: (j: WslJob) => void }) {
  const [items, setItems] = createSignal<WslCatalogItem[] | null>(null);
  const [failed, setFailed] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [picked, setPicked] = createSignal<string | null>(null);
  const [step, setStep] = createSignal<"pick" | "user">("pick");
  const [cred, setCred] = createSignal({ user: "", password: "", ok: false });
  invoke<WslCatalogItem[]>("wsl_catalog")
    .then((list) => {
      setItems(list);
      const first = list.find((i) => i.supported && i.default && !props.installed.includes(i.name)) ?? list.find((i) => i.supported && !props.installed.includes(i.name));
      setPicked(first?.name ?? null);
    })
    .catch(() => setFailed(true));
  const item = () => items()?.find((i) => i.name === picked()) ?? null;
  const shown = createMemo(() => {
    const q = query().trim().toLowerCase();
    return (items() ?? []).filter((i) => !q || i.label.toLowerCase().includes(q) || i.name.toLowerCase().includes(q));
  });
  async function go() {
    const i = item();
    if (!i) return;
    const ws = await activeWorkspace();
    props.onStarted(
      await invoke<WslJob>("wsl_install", {
        name: i.name,
        label: i.label,
        url: i.url,
        sha256: i.sha256,
        user: cred().user,
        password: cred().password,
        workspace: ws?.id ?? null,
        workspaceName: ws?.name ?? null,
      }),
    );
  }
  return (
    <div class="grid gap-3 rounded-sm border border-border p-3" data-wsl-installer={step()}>
      <Switch>
        <Match when={step() === "pick"}>
          <p class="m-0 text-sm font-[560] text-neutral-950">{t("danil.wsl.catalog.title")}</p>
          <Input value={query()} placeholder={t("danil.wsl.catalog.search")} onInput={(e) => setQuery(e.currentTarget.value)} />
          <Switch>
            <Match when={failed()}>
              <p class="m-0 text-xs text-error-strong">{t("danil.wsl.catalog.failed")}</p>
            </Match>
            <Match when={!items()}>
              <p class="m-0 flex items-center gap-2 text-xs text-neutral-500"><Spinner size={12} />{t("danil.wsl.catalog.loading")}</p>
            </Match>
            <Match when={items()}>
              <div class="grid max-h-72 gap-1 overflow-auto">
                <For each={shown()}>
                  {(i) => {
                    const have = props.installed.includes(i.name);
                    const off = have || !i.supported;
                    return (
                      <label class={`flex items-center gap-2 rounded-sm border border-border px-2 py-1.5 text-ui ${off ? "text-neutral-500" : "text-neutral-950"}`} data-wsl-option={i.name}>
                        <input type="radio" name="wsl-distro" disabled={off} checked={picked() === i.name} onChange={() => setPicked(i.name)} />
                        <span class="flex-1">{i.label}</span>
                        <Show when={i.default && !off}><Badge tone="active">{t("danil.wsl.catalog.recommended")}</Badge></Show>
                        <Show when={have}><Badge forma="dato" tone="neutral">{t("danil.wsl.catalog.installed")}</Badge></Show>
                        <Show when={!i.supported && !have}><span class="text-xs">{t("danil.wsl.catalog.not_yet")}</span></Show>
                        <Show when={i.size}>{(s) => <span class="font-mono text-xs text-neutral-500">{t("danil.wsl.mb", { mb: mb(s()) })}</span>}</Show>
                      </label>
                    );
                  }}
                </For>
              </div>
            </Match>
          </Switch>
          <div class="flex gap-2">
            <Button size="sm" disabled={!item()} onClick={() => setStep("user")} data-wsl-pick-next="">{t("danil.wsl.next")}</Button>
            <Button size="sm" variant="secondary" onClick={props.onCancel}>{t("danil.wsl.cancel")}</Button>
          </div>
        </Match>
        <Match when={step() === "user"}>
          <p class="m-0 text-sm font-[560] text-neutral-950">{t("danil.wsl.user_title", { distro: item()?.label ?? "" })}</p>
          <UserFields onChange={(user, password, ok) => setCred({ user, password, ok })} />
          <div class="grid gap-1 rounded-sm bg-surface-muted p-2 text-xs text-neutral-700">
            <span>{t("danil.wsl.summary.distro", { distro: item()?.label ?? "", mb: mb(item()?.size) })}</span>
            <span>{t("danil.wsl.summary.engine")}</span>
          </div>
          <div class="flex gap-2">
            <Button size="sm" disabled={!cred().ok} onClick={() => void go()} data-wsl-install-go="">{t("danil.wsl.install_go")}</Button>
            <Button size="sm" variant="secondary" onClick={() => setStep("pick")}>{t("danil.wsl.back")}</Button>
          </div>
        </Match>
      </Switch>
    </div>
  );
}

const DISTRO_STEPS = ["download", "verify", "register", "user"] as const;
const ENGINE_STEPS = ["check", "deps", "engine_download", "engine_verify", "engine", "service", "connect"] as const;

export function StepList(props: { steps: readonly string[]; current: string; done: boolean; labels?: string }) {
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

function JobProgress(props: { job: WslJob }) {
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

function JobFailure(props: { job: WslJob; onRetry?: () => void; onClose: () => void }) {
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

/** Una distribución. Conectada, es la caja de la maqueta: Linux, Danil y sus proveedores de IA. */
function Distro(props: { row: WslDistroRow; busy: boolean; onStarted: (j: WslJob) => void; onChanged: () => void }) {
  const [asking, setAsking] = createSignal<null | { needsUser: boolean }>(null);
  const [cred, setCred] = createSignal({ user: "", password: "", ok: false });

  async function ask() {
    let needsUser = false;
    try {
      needsUser = (await invoke<WslDistroUser>("wsl_distro_user", { distro: props.row.name })).uid === 0;
    } catch {
      needsUser = false;
    }
    if (!needsUser) return void connect(null, null);
    setAsking({ needsUser });
  }

  async function connect(user: string | null, password: string | null) {
    const ws = await activeWorkspace();
    setAsking(null);
    props.onStarted(await invoke<WslJob>("wsl_connect", { distro: props.row.name, user, password, workspace: ws?.id ?? null, workspaceName: ws?.name ?? null }));
  }

  return (
    <Show
      when={props.row.child}
      fallback={
        <div class="grid gap-2 rounded-sm border border-border p-3" data-wsl-distro={props.row.name}>
          <div class="flex flex-wrap items-center gap-2">
            <SignalDot tone={wslState(props.row.state).tone} />
            <span class="min-w-0 flex-1 truncate text-ui font-[560] text-neutral-950">{props.row.name}</span>
            <span class="text-xs text-neutral-500">{stateLabel(props.row.state)}</span>
            <Show when={props.row.version}>{(v) => <Badge forma="dato" tone="neutral">{t("danil.wsl.version", { version: v() })}</Badge>}</Show>
            <Show
              when={props.row.version !== 1}
              fallback={<span class="text-xs text-neutral-500">{t("danil.wsl.wsl1")}</span>}
            >
              <Button size="sm" disabled={props.busy || !!asking()} onClick={() => void ask()} data-wsl-connect={props.row.name}>
                {t("danil.wsl.connect")}
              </Button>
            </Show>
          </div>
          <Show when={asking()?.needsUser}>
            <p class="m-0 text-xs text-neutral-500">{t("danil.wsl.connect_needs_user", { distro: props.row.name })}</p>
            <UserFields onChange={(user, password, ok) => setCred({ user, password, ok })} />
            <div class="flex gap-2">
              <Button size="sm" disabled={!cred().ok} onClick={() => void connect(cred().user, cred().password)}>{t("danil.wsl.connect")}</Button>
              <Button size="sm" variant="secondary" onClick={() => setAsking(null)}>{t("danil.wsl.cancel")}</Button>
            </div>
          </Show>
        </div>
      }
    >
      {(child) => <DistroBox name={props.row.name} child={child()} onRemoved={props.onChanged} />}
    </Show>
  );
}

type Surface = { id: string; provider: string; label: string; catalogo: string; usable: boolean; marca?: string | null; porque?: { clave?: string } | null };
type Login = { provider: string; id: string; url: string | null; confirm: string | null; wantsCode: boolean };

/** Un huésped conectado (WSL o Lima): Linux, Danil y sus proveedores de IA. */
export function DistroBox(props: { name: string; child: WslChild; onRemoved: () => void }) {
  const machine = props.child.id;
  const call = <T,>(command: string, args: Record<string, unknown> = {}, timeoutMs?: number) =>
    invoke<T>("guest_call", { machine, command, args, workspace: null, folder: null, timeoutMs: timeoutMs ?? null });
  const [surfaces, setSurfaces] = createSignal<Surface[] | null>(null);
  const [problem, setProblem] = createSignal<string | null>(null);
  const [doing, setDoing] = createSignal<string | null>(null);
  const [login, setLogin] = createSignal<Login | null>(null);
  const [code, setCode] = createSignal("");
  let cursor: number | null = null;
  let watching = false;

  async function load() {
    try {
      const list = await call<Surface[]>("list_surfaces");
      setSurfaces(list.filter((s) => s.catalogo !== "gratuitos" && s.provider !== "opencode-local"));
      setProblem(null);
    } catch (e) {
      setProblem(String((e as { detail?: unknown })?.detail ?? (e as { code?: unknown })?.code ?? e));
    }
  }
  onMount(() => void load());
  const ready = () => surfaces()?.some((s) => s.usable) ?? false;

  async function watch() {
    if (watching) return;
    watching = true;
    try {
      cursor = (await invoke<{ cursor: number | null }>("guest_events", { machine, cursor: null })).cursor ?? null;
      while (login()) {
        const page = await invoke<{ cursor: number | null; events?: { name: string; payload: { account?: string; kind?: string; text?: string } }[] }>("guest_events", { machine, cursor });
        if (page.cursor !== null && page.cursor !== undefined) cursor = page.cursor;
        for (const ev of page.events ?? []) {
          const l = login();
          if (!l || ev.name !== "account" || ev.payload.account !== l.id) continue;
          const text = ev.payload.text ?? "";
          if (ev.payload.kind === "url") {
            setLogin({ ...l, url: text });
            void invoke("open_external", { target: text }).catch(() => {});
          } else if (ev.payload.kind === "confirm") setLogin({ ...l, confirm: text });
          else if (ev.payload.kind === "code") setLogin({ ...l, wantsCode: true });
          else if (ev.payload.kind === "done") {
            setLogin(null);
            void load();
          }
        }
        await new Promise((r) => setTimeout(r, 800));
      }
    } catch {
      // Si se corta, «Conectar» se puede volver a pulsar.
    } finally {
      watching = false;
    }
  }

  async function connect(s: Surface) {
    setDoing(s.provider);
    setCode("");
    try {
      if (s.porque?.clave === "surfaces.not_installed") await call("install_provider", { provider: s.provider }, 600_000);
      const account = await call<{ id: string }>("add_account", { provider: s.provider, label: "" });
      setLogin({ provider: s.provider, id: account.id, url: null, confirm: null, wantsCode: false });
      void watch();
      await call("login_account", { provider: s.provider, id: account.id, mode: "tuberia" });
    } catch (e) {
      setProblem(String((e as { detail?: unknown })?.detail ?? (e as { code?: unknown })?.code ?? e));
      setLogin(null);
    } finally {
      setDoing(null);
    }
  }

  const remove = () => {
    void invoke("guest_remove", { machine }).then(props.onRemoved);
  };

  async function sendCode() {
    const l = login();
    if (!l || !code().trim()) return;
    await call("submit_login_code", { id: l.id, code: code().trim() }).catch(() => {});
    setLogin({ ...l, wantsCode: false });
  }

  return (
    <div class="grid gap-3 rounded-sm border border-border p-3" data-wsl-box={props.name}>
      <div class="flex flex-wrap items-center gap-2">
        <SignalDot tone={props.child.online ? "success" : "off"} />
        <span class="min-w-0 flex-1 truncate text-ui font-[560] text-neutral-950">{props.child.name}</span>
        <Show
          when={props.child.online}
          fallback={<Badge forma="dato" tone="neutral">{t("danil.wsl.box.off")}</Badge>}
        >
          <Show when={ready()} fallback={<Badge tone="warning">{t("danil.wsl.box.needs_ai")}</Badge>}>
            <Badge tone="success">{t("danil.wsl.box.ready")}</Badge>
          </Show>
        </Show>
      </div>
      <ol class="m-0 grid list-none gap-1 p-0">
        <li class="flex items-center gap-2 text-ui text-neutral-950"><SignalDot tone="success" />{t("danil.wsl.box.linux", { user: props.child.user })}</li>
        <li class="flex items-center gap-2 text-ui text-neutral-950"><SignalDot tone="success" />{t("danil.wsl.box.danil")}</li>
        <li class="flex items-center gap-2 text-ui text-neutral-950"><SignalDot tone={ready() ? "success" : "working"} />{t("danil.wsl.box.ai", { distro: props.child.name })}</li>
      </ol>
      <Show when={problem()}>{(p) => <p class="m-0 text-xs text-error-strong" role="alert">{p()}</p>}</Show>
      <Show when={surfaces()} fallback={<Show when={props.child.online}><p class="m-0 flex items-center gap-2 text-xs text-neutral-500"><Spinner size={12} />{t("danil.wsl.box.loading")}</p></Show>}>
        {(list) => (
          <ul class="m-0 grid list-none gap-1 p-0">
            <For each={list()}>
              {(s) => (
                <li class="flex items-center gap-2 rounded-sm border border-border px-2 py-1.5" data-wsl-agent={s.provider}>
                  <span class="grid size-5 shrink-0 place-items-center"><MarcaAgente id={s.provider} size={16} /></span>
                  <span class="flex-1 text-ui text-neutral-950">{s.label}</span>
                  <Switch>
                    <Match when={s.usable}><Badge tone="success">{t("danil.wsl.agent.connected")}</Badge></Match>
                    <Match when={doing() === s.provider || login()?.provider === s.provider}><Spinner size={12} /></Match>
                    <Match when={true}>
                      <Button size="sm" variant="secondary" disabled={!!doing() || !!login()} onClick={() => void connect(s)}>{t("danil.wsl.agent.connect")}</Button>
                    </Match>
                  </Switch>
                </li>
              )}
            </For>
          </ul>
        )}
      </Show>
      <Show when={login()}>
        {(l) => (
          <div class="grid gap-2 rounded-sm border border-border p-2" data-wsl-login={l().provider}>
            <Show when={l().url} fallback={<p class="m-0 flex items-center gap-2 text-xs text-neutral-500"><Spinner size={12} />{t("danil.wsl.login.waiting")}</p>}>
              {(url) => (
                <Button size="sm" variant="secondary" class="justify-self-start" onClick={() => void invoke("open_external", { target: url() }).catch(() => {})}>
                  {t("danil.wsl.login.open")}
                </Button>
              )}
            </Show>
            <Show when={l().confirm}>{(c) => <p class="m-0 text-xs text-neutral-700">{t("danil.wsl.login.confirm", { code: c() })}</p>}</Show>
            <Show when={l().wantsCode || l().provider === "claude"}>
              <div class="flex gap-2">
                <Input value={code()} placeholder={t("danil.wsl.login.code")} onInput={(e) => setCode(e.currentTarget.value)} />
                <Button size="sm" disabled={!code().trim()} onClick={() => void sendCode()}>{t("danil.wsl.login.send")}</Button>
              </div>
            </Show>
            <Button size="sm" variant="secondary" class="justify-self-start" onClick={() => { void call("cancel_login", { id: l().id }).catch(() => {}); setLogin(null); }}>
              {t("danil.wsl.cancel")}
            </Button>
          </div>
        )}
      </Show>
      <Show when={ready()}>
        <p class="m-0 text-xs text-neutral-500">{t("danil.wsl.box.run_on")}</p>
      </Show>
      <details class="text-xs text-neutral-500">
        <summary class="cursor-pointer">{t("danil.wsl.box.more")}</summary>
        <div class="mt-2 grid gap-2">
          <span>{t("danil.wsl.box.folder", { home: props.child.home })}</span>
          <span>{t("danil.wsl.box.scope")}</span>
          <div class="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={remove} data-wsl-remove="">
              {t("danil.wsl.box.remove")}
            </Button>
            <span>{t("danil.wsl.box.remove_keeps")}</span>
          </div>
        </div>
      </details>
    </div>
  );
}

/** Las distribuciones conectadas, como una máquina más en «Máquinas de este workspace». Solo existen en esta PC. */
export function WslMachineRows() {
  const [rows, setRows] = createSignal<WslChild[]>([]);
  const offered = () => offersGuests("wsl") || offersGuests("lima");
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
          description={c.channel === "lima" ? (c.online ? t("danil.lima.row.online") : t("danil.lima.row.off")) : c.online ? t("danil.wsl.row.online") : t("danil.wsl.row.off")}
        />
      )}
    </For>
  );
}
