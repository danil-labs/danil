// Todo va directo a la ventana, sin el reparto entre máquinas ni sus reintentos:
// repetir una instalación por un `app_unavailable` la correría dos veces.
import { invoke } from "@tauri-apps/api/core";
import Check from "lucide-solid/icons/check";
import Copy from "lucide-solid/icons/copy";
import { For, Match, Show, Switch, createSignal, onCleanup, onMount } from "solid-js";
import { createCopied } from "../../lib/clipboard";
import { prosaDe } from "../../lib/failure";
import { t } from "../../lib/i18n";
import { listen } from "../../lib/serviceEvents";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { SignalDot } from "../../ui/SignalDot";
import { Spinner } from "../../ui/Spinner";
import { SettingsBlock, SettingsSection } from "../settings/layout";
import { offersGuests } from "./guestChannels";
import { DistroBox, StepList, Technical } from "./WslMachine";
import { LIMA_CREATE, LIMA_INSTALL, LIMA_START, type WslChild, type WslJob } from "./wsl";

/** Una VM de Lima como la devuelve `guest_list { channel: "lima" }`. */
type LimaGuest = {
  channel: "lima";
  id: string;
  label: string;
  state: "running" | "stopped" | "installing" | "unknown";
  state_raw: string;
  arch: string | null;
  detail: string | null;
  default: boolean;
  system: boolean;
};

type Listed = { kind: "ok"; guests: LimaGuest[] } | { kind: "missing" } | { kind: "failed"; detail: string };

const STEPS = ["check", "already", "deps", "engine_download", "engine_verify", "engine", "service", "connect"] as const;
const KNOWN = new Set([
  "lima_missing",
  "lima_timeout",
  "lima_failed",
  "machine_off",
  "enrolled",
  "sudo_required",
  "no_systemd",
  "arch",
  "invalid_distro",
  "app_unavailable",
  "interrupted",
  "apt_lock",
  "network",
]);

const codeOf = (e: unknown) => (e && typeof e === "object" && typeof (e as { code?: unknown }).code === "string" ? (e as { code: string }).code : "");
const detailOf = (e: unknown) => (e && typeof e === "object" && typeof (e as { detail?: unknown }).detail === "string" ? (e as { detail: string }).detail : prosaDe(e));

/** La flota (Ejecutar en) vuelve a leer las máquinas locales. */
const fleetChanged = () => window.dispatchEvent(new CustomEvent("danil:guests-changed"));

type Workspaces = { workspaces?: { id: string; name?: string }[]; active?: string | null };

/** El workspace de la ventana: la VM lo crea con el mismo id. */
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

function stateLabel(state: LimaGuest["state"]): string {
  switch (state) {
    case "running":
      return t("danil.wsl.state.running");
    case "stopped":
      return t("danil.wsl.state.stopped");
    case "installing":
      return t("danil.wsl.state.installing");
    default:
      return t("danil.wsl.state.unknown");
  }
}

/** Configuración → Máquinas → Linux en esta Mac. El trabajo lo guarda la ventana (`guest_job`, `guest-job`). */
export function LimaMachineSection() {
  return (
    <Show when={offersGuests("lima")}>
      <Section />
    </Show>
  );
}

function Section() {
  const [listed, setListed] = createSignal<Listed | null>(null);
  const [children, setChildren] = createSignal<WslChild[]>([]);
  const [job, setJob] = createSignal<WslJob | null>(null);
  const [problem, setProblem] = createSignal<{ code: string; detail: string } | null>(null);

  async function load() {
    try {
      const guests = await invoke<LimaGuest[]>("guest_list", { channel: "lima" });
      setListed({ kind: "ok", guests });
    } catch (e) {
      setListed(codeOf(e) === "lima_missing" ? { kind: "missing" } : { kind: "failed", detail: detailOf(e) });
    }
    const all = await invoke<WslChild[]>("guest_children", { fresh: false }).catch(() => [] as WslChild[]);
    setChildren(all.filter((c) => c.channel === "lima"));
    const current = await invoke<WslJob | null>("guest_job").catch(() => null);
    setJob(current?.channel === "lima" ? current : null);
  }

  onMount(() => void load());
  const stopJob = listen<WslJob | null>("guest-job", (e) => setJob(e.payload?.channel === "lima" ? e.payload : null));
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
  const failed = () => {
    const j = job();
    return j?.finished && j.error ? j : null;
  };
  const dismiss = () => void invoke("wsl_job_dismiss").then(() => setJob(null));
  const guests = () => {
    const l = listed();
    return l?.kind === "ok" ? l.guests : [];
  };
  const own = () => guests().filter((g) => !g.system);
  const system = () => guests().filter((g) => g.system);
  const childOf = (g: LimaGuest) => children().find((c) => c.id === `lima:${g.id}`) ?? null;

  async function act(work: () => Promise<unknown>) {
    setProblem(null);
    try {
      await work();
    } catch (e) {
      setProblem({ code: codeOf(e), detail: detailOf(e) });
    }
  }
  async function connect(g: LimaGuest) {
    const ws = await activeWorkspace();
    await act(async () => setJob(await invoke<WslJob>("guest_connect", { channel: "lima", guest: g.id, name: g.id, workspace: ws?.id ?? null, workspaceName: ws?.name ?? null })));
  }
  async function turnOn(g: LimaGuest) {
    await act(async () => {
      const child = childOf(g);
      if (child) await invoke("guest_start", { machine: child.id });
      else throw { code: "machine_off", detail: g.id };
    });
    fleetChanged();
    void load();
  }

  return (
    <SettingsSection title={t("danil.lima.title")}>
      <SettingsBlock>
        <div class="grid gap-3" data-lima={listed()?.kind ?? "loading"}>
          <Switch>
            <Match when={!listed()}>
              <p class="m-0 flex items-center gap-2 text-sm text-neutral-500">
                <Spinner size={14} />
                {t("danil.lima.reading")}
              </p>
            </Match>
            <Match when={listed()?.kind === "missing"}>
              <MissingCard onRetry={() => void load()} />
            </Match>
            <Match when={listed()?.kind === "failed"}>
              <div class="grid gap-2 rounded-sm border border-border p-3" role="alert">
                <p class="m-0 text-sm text-error-strong">{t("danil.lima.fail.lima_failed")}</p>
                <Technical text={(listed() as { detail: string }).detail} />
                <Button size="sm" variant="secondary" class="justify-self-start" onClick={() => void load()}>
                  {t("danil.wsl.retry")}
                </Button>
              </div>
            </Match>
            <Match when={listed()?.kind === "ok"}>
              <Show when={running()}>{(j) => <JobProgress job={j()} />}</Show>
              <Show when={failed()}>{(j) => <JobFailure job={j()} onClose={dismiss} />}</Show>
              <Show when={problem()}>{(p) => <Problem code={p().code} detail={p().detail} onClose={() => setProblem(null)} />}</Show>
              <Show when={own().length === 0 && !running()}>
                <NoVms />
              </Show>
              <For each={own()}>
                {(g) => (
                  <Show
                    when={childOf(g)}
                    fallback={<GuestRow guest={g} busy={!!running()} onConnect={() => void connect(g)} />}
                  >
                    {(child) => (
                      <div class="grid gap-2">
                        <Show when={g.state !== "running"}>
                          <div class="flex flex-wrap items-center gap-2 rounded-sm border border-border p-3" data-lima-off={g.id}>
                            <SignalDot tone="off" />
                            <span class="min-w-0 flex-1 truncate text-ui font-[560] text-neutral-950">{child().name}</span>
                            <span class="text-xs text-neutral-500">{stateLabel(g.state)}</span>
                            <TurnOn onClick={() => turnOn(g)} />
                          </div>
                        </Show>
                        <Show when={g.state === "running"}>
                          <DistroBox
                            name={g.id}
                            child={child()}
                            onRemoved={() => {
                              fleetChanged();
                              void load();
                            }}
                          />
                        </Show>
                      </div>
                    )}
                  </Show>
                )}
              </For>
              <Show when={system().length}>
                <p class="m-0 text-xs text-neutral-500" data-lima-system="">
                  {t("danil.lima.system", { names: system().map((g) => g.id).join(", ") })}
                </p>
              </Show>
            </Match>
          </Switch>
        </div>
      </SettingsBlock>
    </SettingsSection>
  );
}

function MissingCard(props: { onRetry: () => void }) {
  const [failure, setFailure] = createSignal(false);
  const { copied, copy } = createCopied(2000, () => setFailure(true));
  return (
    <div class="grid gap-2 rounded-sm border border-border p-3" data-lima-missing="">
      <p class="m-0 text-sm font-[560] text-neutral-950">{t("danil.lima.missing.title")}</p>
      <div class="flex items-center gap-2">
        <code class="rounded-sm bg-surface-muted px-2 py-1 font-mono text-xs text-neutral-950">{LIMA_INSTALL}</code>
        <Button size="sm" variant="secondary" onClick={() => void copy(LIMA_INSTALL)} aria-label={t("danil.lima.copy")} data-lima-copy="">
          <Show when={copied()} fallback={<Copy size={13} aria-hidden="true" />}>
            <Check size={13} aria-hidden="true" />
          </Show>
          {copied() ? t("danil.lima.copied") : t("danil.lima.copy")}
        </Button>
      </div>
      <Show when={failure()}>
        <p class="m-0 text-xs text-error-strong">{t("common.clipboard.write_failed")}</p>
      </Show>
      <Button size="sm" class="justify-self-start" onClick={props.onRetry} data-lima-recheck="">
        {t("danil.lima.missing.recheck")}
      </Button>
    </div>
  );
}

function TurnOn(props: { onClick: () => Promise<void> }) {
  const [starting, setStarting] = createSignal(false);
  return (
    <Button
      size="sm"
      disabled={starting()}
      onClick={() => {
        setStarting(true);
        void props.onClick().finally(() => setStarting(false));
      }}
      data-lima-start=""
    >
      <Show when={starting()} fallback={t("danil.lima.start")}>
        <Spinner size={12} />
        {t("danil.lima.starting")}
      </Show>
    </Button>
  );
}

/** Una VM sin Danil: se conecta si está encendida. */
function GuestRow(props: { guest: LimaGuest; busy: boolean; onConnect: () => void }) {
  const on = () => props.guest.state === "running";
  return (
    <div class="flex flex-wrap items-center gap-2 rounded-sm border border-border p-3" data-lima-guest={props.guest.id}>
      <SignalDot tone={on() ? "success" : "off"} />
      <span class="min-w-0 flex-1 truncate text-ui font-[560] text-neutral-950">{props.guest.id}</span>
      <span class="text-xs text-neutral-500">{stateLabel(props.guest.state)}</span>
      <Show when={props.guest.arch}>{(a) => <Badge forma="dato" tone="neutral">{a()}</Badge>}</Show>
      <Show when={on()} fallback={<span class="text-xs text-neutral-500">{t("danil.lima.start_first")}</span>}>
        <Button size="sm" disabled={props.busy} onClick={props.onConnect} data-lima-connect={props.guest.id}>
          {t("danil.wsl.connect")}
        </Button>
      </Show>
    </div>
  );
}

/** Sin VMs propias: Danil no crea una; dice cómo crearla, para copiar. */
function NoVms() {
  return (
    <div class="grid gap-2 rounded-sm border border-border p-3" data-lima-empty="">
      <p class="m-0 text-sm text-neutral-700">{t("danil.lima.empty")}</p>
      <CopyLine text={LIMA_CREATE} />
      <CopyLine text={LIMA_START} />
    </div>
  );
}

/** Un comando para copiar, sin correrlo. */
function CopyLine(props: { text: string }) {
  const [failure, setFailure] = createSignal(false);
  const { copied, copy } = createCopied(2000, () => setFailure(true));
  return (
    <div class="grid gap-1">
      <div class="flex items-center gap-2">
        <code class="min-w-0 flex-1 rounded-sm bg-surface-muted px-2 py-1 font-mono text-xs break-all text-neutral-950" data-lima-command="">{props.text}</code>
        <Button size="sm" variant="secondary" onClick={() => void copy(props.text)} aria-label={t("danil.lima.copy")} data-lima-copy="">
          <Show when={copied()} fallback={<Copy size={13} aria-hidden="true" />}>
            <Check size={13} aria-hidden="true" />
          </Show>
        </Button>
      </div>
      <Show when={failure()}>
        <p class="m-0 text-xs text-error-strong">{t("common.clipboard.write_failed")}</p>
      </Show>
    </div>
  );
}

function Mounts(props: { count: number | null | undefined }) {
  return (
    <Show when={props.count !== null && props.count !== undefined}>
      <p class="m-0 text-xs text-neutral-700" data-lima-mounts={props.count}>
        {props.count ? t("danil.lima.mounts.some", { count: props.count }) : t("danil.lima.mounts.none")}
      </p>
    </Show>
  );
}

function JobProgress(props: { job: WslJob }) {
  return (
    <div class="grid gap-3 rounded-sm border border-border p-3" data-lima-job={props.job.step}>
      <p class="m-0 text-sm font-[560] text-neutral-950">
        {t("danil.wsl.job.connecting", { distro: props.job.label })}
      </p>
      <Mounts count={props.job.mounts} />
      <StepList steps={STEPS} current={props.job.step} done={false} labels="danil.lima.step" />
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

function JobFailure(props: { job: WslJob; onClose: () => void }) {
  return (
    <div class="grid gap-2" data-lima-failure={props.job.error?.code}>
      <Mounts count={props.job.mounts} />
      <Problem code={props.job.error?.code ?? ""} detail={props.job.error?.detail ?? ""} title={t("danil.wsl.fail.title", { distro: props.job.label })} onClose={props.onClose} />
    </div>
  );
}

/** Una falla dentro del bloque, con su salida. `sudo_required` trae el comando para copiar. */
function Problem(props: { code: string; detail: string; title?: string; onClose: () => void }) {
  const code = () => (KNOWN.has(props.code) ? props.code : "other");
  const { copied, copy } = createCopied(2000);
  return (
    <div class="grid gap-2 rounded-sm border border-border p-3" role="alert" data-lima-problem={props.code}>
      <Show when={props.title}>{(title) => <p class="m-0 text-sm font-[560] text-error-strong">{title()}</p>}</Show>
      <p class="m-0 text-xs text-neutral-700">{t(`danil.lima.fail.${code()}`)}</p>
      <Switch fallback={<Show when={props.detail}>{(d) => <Technical text={d()} />}</Show>}>
        <Match when={props.code === "sudo_required" && props.detail}>
          <div class="flex items-center gap-2">
            <code class="rounded-sm bg-surface-muted px-2 py-1 font-mono text-xs text-neutral-950">{props.detail}</code>
            <Button size="sm" variant="secondary" onClick={() => void copy(props.detail)} aria-label={t("danil.lima.copy")}>
              <Show when={copied()} fallback={<Copy size={13} aria-hidden="true" />}>
                <Check size={13} aria-hidden="true" />
              </Show>
            </Button>
          </div>
        </Match>
      </Switch>
      <Button size="sm" variant="secondary" class="justify-self-start" onClick={props.onClose}>
        {t("danil.wsl.close")}
      </Button>
    </div>
  );
}
