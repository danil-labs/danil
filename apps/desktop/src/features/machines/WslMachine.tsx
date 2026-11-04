import { listen } from "@tauri-apps/api/event";
import { For, Match, Show, Switch, createSignal, onCleanup } from "solid-js";
import { t } from "../../lib/i18n";
// Todo va directo a la ventana, sin el reparto entre máquinas ni sus reintentos:
// repetir una instalación por un `app_unavailable` la correría dos veces.
import { invoke } from "@tauri-apps/api/core";
import { capabilities } from "../../lib/platform";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { ProgressBar } from "../../ui/ProgressBar";
import { SignalDot } from "../../ui/SignalDot";
import { Spinner } from "../../ui/Spinner";
import { SettingsBlock, SettingsSection } from "../settings/layout";
import {
  isSystemDistro,
  WSL_DISTRO_STEPS,
  WSL_ENGINE_STEPS,
  WSL_INSTALL,
  WSL_INSTALL_UBUNTU,
  type WslCatalogItem,
  type WslChild,
  type WslDetection,
  type WslDistroUser,
  wslErrorCode,
  wslErrorDetail,
  wslFailureCode,
  type WslProgress,
  wslState,
  wslUserProblem,
} from "./wsl";

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

const changed = () => window.dispatchEvent(new CustomEvent("danil:wsl-changed"));

type Workspaces = { workspaces?: { id: string; name?: string }[]; active?: string | null };

/** El workspace de la ventana: la distro lo crea con el mismo id. */
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
 * Configuración → Máquinas → Linux en esta PC: las distros de WSL de este
 * equipo. Una distro conectada es una máquina hija con su propio motor,
 * agentes, cuentas y archivos; sólo se usa desde esta PC o pasando por ella
 * (`docs/wsl-local-machine.md`).
 */
export function WslMachineSection() {
  if (!capabilities().wsl) return null;
  return <Section />;
}

type Busy = { target: string; kind: "distro" | "engine"; step: string; done: number | null; total: number | null; line: string | null };

function Section() {
  const [open, setOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [found, setFound] = createSignal<WslDetection | null>(null);
  const [failure, setFailure] = createSignal<string | null>(null);
  const [children, setChildren] = createSignal<WslChild[]>([]);
  const [work, setWork] = createSignal<Busy | null>(null);
  const [workError, setWorkError] = createSignal<{ code: string; detail: string } | null>(null);
  const [form, setForm] = createSignal<null | { kind: "install" } | { kind: "connect"; distro: string; needsUser: boolean }>(null);
  const [manage, setManage] = createSignal<string | null>(null);
  const [enabling, setEnabling] = createSignal<"idle" | "busy" | "restart" | "refused">("idle");

  const stop = listen<WslProgress>("wsl-progress", (e) => {
    const w = work();
    if (!w || e.payload.target !== w.target) return;
    setWork({
      ...w,
      step: e.payload.step,
      done: e.payload.done ?? (e.payload.step === w.step ? w.done : null),
      total: e.payload.total ?? (e.payload.step === w.step ? w.total : null),
      line: e.payload.line ?? (e.payload.step === w.step ? w.line : null),
    });
  });
  onCleanup(() => void stop.then((f) => f()));

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
    try {
      setChildren(await invoke<WslChild[]>("wsl_children", { fresh: true }));
    } catch {
      setChildren([]);
    }
  }

  function start() {
    setOpen(true);
    void detect();
  }

  const childOf = (distro: string) => children().find((c) => c.distro === distro) ?? null;

  async function enable() {
    setEnabling("busy");
    try {
      await invoke("wsl_enable");
      setEnabling("restart");
    } catch {
      setEnabling("refused");
    }
  }

  async function connect(distro: string, user: string | null, password: string | null, name: string) {
    setWorkError(null);
    setWork({ target: distro, kind: "engine", step: "check", done: null, total: null, line: null });
    try {
      const ws = await activeWorkspace();
      await invoke<WslChild>("wsl_engine_install", { distro, name, user, password, workspace: ws?.id ?? null, workspaceName: ws?.name ?? null });
      setForm(null);
      setWork(null);
      setManage(distro);
      changed();
      await detect();
    } catch (error) {
      setWorkError({ code: wslErrorCode(error), detail: wslErrorDetail(error) });
    }
  }

  async function install(item: WslCatalogItem, user: string, password: string) {
    setWorkError(null);
    setWork({ target: item.name, kind: "distro", step: "download", done: 0, total: null, line: null });
    try {
      await invoke("wsl_distro_install", { name: item.name, url: item.url, sha256: item.sha256, user, password });
      await connect(item.name, null, null, item.name);
    } catch (error) {
      setWorkError({ code: wslErrorCode(error), detail: wslErrorDetail(error) });
    }
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
              <Match when={busy() && !found()}>
                <p class="m-0 flex items-center gap-2 text-sm text-neutral-500">
                  <Spinner size={14} />
                  {t("danil.wsl.detecting")}
                </p>
              </Match>
              <Match when={failure()}>
                {(code) => (
                  <div class="grid gap-2 rounded-sm border border-border p-2" role="alert" data-wsl-failure={code()}>
                    <p class="m-0 text-sm text-error-strong">{t(`danil.wsl.error.${code()}`)}</p>
                    <Show when={code() === "wsl_missing"}>
                      <p class="m-0 text-xs text-neutral-500">{t("danil.wsl.enable_hint")}</p>
                      <div class="flex flex-wrap items-center gap-2">
                        <Button size="sm" disabled={enabling() === "busy"} onClick={() => void enable()} data-wsl-enable="">
                          {t("danil.wsl.enable")}
                        </Button>
                        <code class="font-mono text-xs text-neutral-500">{WSL_INSTALL}</code>
                      </div>
                      <Show when={enabling() === "restart"}>
                        <p class="m-0 text-xs text-warning-strong">{t("danil.wsl.enable_restart")}</p>
                      </Show>
                      <Show when={enabling() === "refused"}>
                        <p class="m-0 text-xs text-error-strong">{t("danil.wsl.enable_refused")}</p>
                      </Show>
                    </Show>
                  </div>
                )}
              </Match>
              <Match when={found()}>
                {(detection) => (
                  <div class="grid gap-2">
                    <Show when={detection().distros.length === 0}>
                      <div class="grid gap-1 rounded-sm border border-border p-2" data-wsl-empty="">
                        <p class="m-0 text-sm text-neutral-950">{t("danil.wsl.empty")}</p>
                        <code class="font-mono text-xs text-neutral-500">{WSL_INSTALL_UBUNTU}</code>
                      </div>
                    </Show>
                    <ul class="m-0 grid list-none gap-2 p-0" data-wsl-distros="">
                      <For each={detection().distros}>
                        {(distro) => {
                          const child = () => childOf(distro.name);
                          const system = isSystemDistro(distro.name);
                          return (
                            <li class="grid gap-2 rounded-sm border border-border p-2" data-wsl-distro={distro.name}>
                              <div class="flex min-w-0 flex-wrap items-center gap-2">
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
                                <Switch>
                                  <Match when={child()}>
                                    {(c) => (
                                      <>
                                        <Badge tone={c().online ? "success" : "neutral"}>{c().online ? t("danil.wsl.connected") : t("danil.wsl.connected_off")}</Badge>
                                        <Button size="sm" variant="secondary" onClick={() => setManage(manage() === distro.name ? null : distro.name)} data-wsl-manage={distro.name}>
                                          {manage() === distro.name ? t("danil.wsl.close") : t("danil.wsl.manage")}
                                        </Button>
                                      </>
                                    )}
                                  </Match>
                                  <Match when={system}>
                                    <span class="text-xs text-neutral-500">{t("danil.wsl.system_distro")}</span>
                                  </Match>
                                  <Match when={distro.version === 1}>
                                    <span class="text-xs text-neutral-500">{t("danil.wsl.wsl1")}</span>
                                  </Match>
                                  <Match when={!work()}>
                                    <Button
                                      size="sm"
                                      onClick={async () => {
                                        setWorkError(null);
                                        let needsUser = false;
                                        try {
                                          needsUser = (await invoke<WslDistroUser>("wsl_distro_user", { distro: distro.name })).uid === 0;
                                        } catch {
                                          needsUser = false;
                                        }
                                        setForm({ kind: "connect", distro: distro.name, needsUser });
                                      }}
                                      data-wsl-connect={distro.name}
                                    >
                                      {t("danil.wsl.connect")}
                                    </Button>
                                  </Match>
                                </Switch>
                              </div>
                              <Show when={child() && manage() === distro.name}>
                                <ChildDetail child={child()!} onRemoved={() => { setManage(null); changed(); void detect(); }} />
                              </Show>
                              <Show when={form()?.kind === "connect" && (form() as { distro: string }).distro === distro.name && !work()}>
                                <ConnectForm
                                  distro={distro.name}
                                  needsUser={(form() as { needsUser: boolean }).needsUser}
                                  onCancel={() => setForm(null)}
                                  onSubmit={(user, password, name) => void connect(distro.name, user, password, name)}
                                />
                              </Show>
                            </li>
                          );
                        }}
                      </For>
                    </ul>
                  </div>
                )}
              </Match>
            </Switch>

            <Show when={work()}>{(w) => <ProgressPanel work={w()} error={workError()} onClose={() => { setWork(null); setWorkError(null); }} />}</Show>

            <Show when={form()?.kind === "install" && !work()}>
              <InstallForm onCancel={() => setForm(null)} onSubmit={(item, user, password) => void install(item, user, password)} />
            </Show>

            <div class="flex flex-wrap gap-2">
              <Show when={found() && !work() && form()?.kind !== "install"}>
                <Button size="sm" onClick={() => setForm({ kind: "install" })} data-wsl-install="">
                  {t("danil.wsl.install")}
                </Button>
              </Show>
              <Button size="sm" variant="secondary" disabled={busy() || !!work()} onClick={() => void detect()}>
                {t("danil.wsl.refresh")}
              </Button>
            </div>
          </div>
        </Show>
      </SettingsBlock>
    </SettingsSection>
  );
}

/** Usuario y contraseña de Linux, como la primera vez que se abre Ubuntu. */
function UserFields(props: { onChange: (user: string, password: string, ok: boolean) => void }) {
  const [user, setUser] = createSignal("");
  const [p1, setP1] = createSignal("");
  const [p2, setP2] = createSignal("");
  const problem = () => wslUserProblem(user());
  const passwordOk = () => p1().length > 0 && p1() === p2();
  const emit = () => props.onChange(user(), p1(), problem() === null && passwordOk());
  return (
    <div class="grid gap-2" data-wsl-user="">
      <p class="m-0 text-xs text-neutral-500">{t("danil.wsl.user_hint")}</p>
      <label class="grid gap-1 text-xs text-neutral-500">
        {t("danil.wsl.user")}
        <Input value={user()} maxLength={32} autocomplete="off" placeholder={t("danil.wsl.user_placeholder")} onInput={(e) => { setUser(e.currentTarget.value); emit(); }} />
      </label>
      <Show when={user() && problem()}>{(p) => <span class="text-xs text-error-strong">{t(`danil.wsl.user_problem.${p()}`)}</span>}</Show>
      <label class="grid gap-1 text-xs text-neutral-500">
        {t("danil.wsl.password")}
        <Input type="password" value={p1()} autocomplete="new-password" onInput={(e) => { setP1(e.currentTarget.value); emit(); }} />
      </label>
      <label class="grid gap-1 text-xs text-neutral-500">
        {t("danil.wsl.password_again")}
        <Input type="password" value={p2()} autocomplete="new-password" onInput={(e) => { setP2(e.currentTarget.value); emit(); }} />
      </label>
      <Show when={p2() && !passwordOk()}>
        <span class="text-xs text-error-strong">{t("danil.wsl.password_mismatch")}</span>
      </Show>
      <p class="m-0 text-xs text-neutral-500">{t("danil.wsl.password_note")}</p>
    </div>
  );
}

function InstallForm(props: { onCancel: () => void; onSubmit: (item: WslCatalogItem, user: string, password: string) => void }) {
  const [items, setItems] = createSignal<WslCatalogItem[] | null>(null);
  const [failed, setFailed] = createSignal(false);
  const [picked, setPicked] = createSignal<string | null>(null);
  const [cred, setCred] = createSignal<{ user: string; password: string; ok: boolean }>({ user: "", password: "", ok: false });
  invoke<WslCatalogItem[]>("wsl_catalog")
    .then((list) => {
      setItems(list);
      setPicked(list.find((i) => i.default)?.name ?? list[0]?.name ?? null);
    })
    .catch(() => setFailed(true));
  const item = () => items()?.find((i) => i.name === picked()) ?? null;
  return (
    <div class="grid gap-3 rounded-sm border border-border p-3" data-wsl-install-form="">
      <p class="m-0 text-sm font-[560] text-neutral-950">{t("danil.wsl.install_title")}</p>
      <Switch>
        <Match when={failed()}>
          <p class="m-0 text-xs text-error-strong">{t("danil.wsl.catalog_failed")}</p>
        </Match>
        <Match when={!items()}>
          <p class="m-0 flex items-center gap-2 text-xs text-neutral-500"><Spinner size={12} />{t("danil.wsl.catalog_loading")}</p>
        </Match>
        <Match when={items()}>
          {(list) => (
            <div class="grid gap-1">
              <For each={list()}>
                {(i) => (
                  <label class="flex items-center gap-2 rounded-sm border border-border px-2 py-1.5 text-ui text-neutral-950">
                    <input type="radio" name="wsl-distro" checked={picked() === i.name} onChange={() => setPicked(i.name)} />
                    <span class="flex-1">{i.label}</span>
                    <Show when={i.default}><Badge tone="active">{t("danil.wsl.recommended")}</Badge></Show>
                  </label>
                )}
              </For>
            </div>
          )}
        </Match>
      </Switch>
      <UserFields onChange={(user, password, ok) => setCred({ user, password, ok })} />
      <div class="flex gap-2">
        <Button size="sm" disabled={!item() || !cred().ok} onClick={() => item() && props.onSubmit(item()!, cred().user, cred().password)} data-wsl-install-go="">
          {t("danil.wsl.install_go")}
        </Button>
        <Button size="sm" variant="secondary" onClick={props.onCancel}>{t("danil.wsl.cancel")}</Button>
      </div>
    </div>
  );
}

function ConnectForm(props: { distro: string; needsUser: boolean; onCancel: () => void; onSubmit: (user: string | null, password: string | null, name: string) => void }) {
  const [cred, setCred] = createSignal<{ user: string; password: string; ok: boolean }>({ user: "", password: "", ok: !props.needsUser });
  return (
    <div class="grid gap-3 rounded-sm border border-border p-3" data-wsl-connect-form={props.distro}>
      <p class="m-0 text-xs text-neutral-500">{t("danil.wsl.connect_hint", { distro: props.distro })}</p>
      <Show when={props.needsUser}>
        <UserFields onChange={(user, password, ok) => setCred({ user, password, ok })} />
      </Show>
      <div class="flex gap-2">
        <Button size="sm" disabled={!cred().ok} onClick={() => props.onSubmit(props.needsUser ? cred().user : null, props.needsUser ? cred().password : null, props.distro)} data-wsl-connect-go="">
          {t("danil.wsl.connect_go")}
        </Button>
        <Button size="sm" variant="secondary" onClick={props.onCancel}>{t("danil.wsl.cancel")}</Button>
      </div>
    </div>
  );
}

const MB = 1024 * 1024;

function ProgressPanel(props: { work: Busy; error: { code: string; detail: string } | null; onClose: () => void }) {
  const steps = () => (props.work.kind === "distro" ? [...WSL_DISTRO_STEPS, ...WSL_ENGINE_STEPS.filter((s) => s !== "download" && s !== "verify")] : [...WSL_ENGINE_STEPS]);
  const index = () => Math.max(0, steps().indexOf(props.work.step as never));
  return (
    <div class="grid gap-2 rounded-sm border border-border p-3" data-wsl-progress={props.work.step}>
      <p class="m-0 text-sm font-[560] text-neutral-950">
        {props.work.kind === "distro" ? t("danil.wsl.progress_distro", { distro: props.work.target }) : t("danil.wsl.progress_engine", { distro: props.work.target })}
      </p>
      <ol class="m-0 grid list-none gap-1 p-0">
        <For each={steps()}>
          {(step, i) => {
            const state = () => (props.work.step === "done" || i() < index() ? "done" : i() === index() ? (props.error ? "failed" : "now") : "todo");
            return (
              <li class="flex items-start gap-2 text-ui" data-step={step} data-state={state()}>
                <span class="grid size-4 shrink-0 place-items-center">
                  <Switch fallback={<SignalDot tone="off" />}>
                    <Match when={state() === "done"}><SignalDot tone="success" /></Match>
                    <Match when={state() === "now"}><Spinner size={12} /></Match>
                    <Match when={state() === "failed"}><SignalDot tone="error" /></Match>
                  </Switch>
                </span>
                <span class="grid flex-1 gap-1">
                  <span class={state() === "todo" ? "text-neutral-500" : "text-neutral-950"}>{t(`danil.wsl.step.${step}`)}</span>
                  <Show when={state() === "now" && props.work.done !== null && props.work.total}>
                    <ProgressBar value={props.work.done ?? 0} max={props.work.total ?? 1} label={t(`danil.wsl.step.${step}`)} />
                    <span class="font-mono text-xs text-neutral-500">
                      {t("danil.wsl.downloaded", { done: Math.round((props.work.done ?? 0) / MB), total: Math.round((props.work.total ?? 0) / MB) })}
                    </span>
                  </Show>
                  <Show when={state() === "now" && props.work.line}>
                    <span class="truncate font-mono text-xs text-neutral-500">{props.work.line}</span>
                  </Show>
                </span>
              </li>
            );
          }}
        </For>
      </ol>
      <Show when={props.error}>
        {(e) => (
          <div class="grid gap-1" role="alert">
            <p class="m-0 text-xs text-error-strong">{t(`danil.wsl.fail.${e().code}`, { detail: e().detail }) || e().code}</p>
            <Show when={e().detail}>
              <pre class="m-0 max-h-32 overflow-auto font-mono text-xs whitespace-pre-wrap text-neutral-500">{e().detail}</pre>
            </Show>
            <Button size="sm" variant="secondary" class="justify-self-start" onClick={props.onClose}>{t("danil.wsl.close")}</Button>
          </div>
        )}
      </Show>
    </div>
  );
}

type Surface = { id: string; provider: string; label: string; catalogo: string; usable: boolean; marca?: string | null; porque?: { clave?: string } | null };

/** Lo que se administra de una distro conectada: sus cuentas de IA y quitarla. */
function ChildDetail(props: { child: WslChild; onRemoved: () => void }) {
  const machine = props.child.id;
  const call = <T,>(command: string, args: Record<string, unknown> = {}, timeoutMs?: number) =>
    invoke<T>("wsl_child_call", { machine, command, args, workspace: null, folder: null, timeoutMs: timeoutMs ?? null });
  const [surfaces, setSurfaces] = createSignal<Surface[] | null>(null);
  const [failed, setFailed] = createSignal<string | null>(null);
  const [doing, setDoing] = createSignal<string | null>(null);
  const [login, setLogin] = createSignal<{ provider: string; id: string; url: string | null; confirm: string | null; wantsCode: boolean; notice: string | null } | null>(null);
  const [code, setCode] = createSignal("");
  const [removing, setRemoving] = createSignal(false);
  let cursor: number | null = null;
  let polling = false;

  async function load() {
    setFailed(null);
    try {
      const list = await call<Surface[]>("list_surfaces");
      setSurfaces(list.filter((s) => s.catalogo !== "gratuitos" && s.provider !== "opencode-local"));
    } catch (e) {
      setFailed(wslErrorDetail(e) || wslErrorCode(e));
    }
  }
  void load();

  async function installAgent(provider: string) {
    setDoing(provider);
    try {
      await call("install_provider", { provider }, 600_000);
    } catch (e) {
      setFailed(wslErrorDetail(e) || wslErrorCode(e));
    } finally {
      setDoing(null);
      void load();
    }
  }

  async function watchLogin() {
    if (polling) return;
    polling = true;
    try {
      const first = await invoke<{ cursor: number | null }>("wsl_child_events", { machine, cursor: null });
      cursor = first.cursor ?? null;
      while (login()) {
        const page = await invoke<{ cursor: number | null; events?: { name: string; payload: { account?: string; kind?: string; text?: string } }[] }>("wsl_child_events", { machine, cursor });
        if (page.cursor !== null && page.cursor !== undefined) cursor = page.cursor;
        for (const ev of page.events ?? []) {
          const l = login();
          if (!l || ev.name !== "account" || ev.payload.account !== l.id) continue;
          const kind = ev.payload.kind;
          const text = ev.payload.text ?? "";
          if (kind === "url") {
            setLogin({ ...l, url: text });
            void invoke("open_external", { target: text }).catch(() => {});
          } else if (kind === "confirm") setLogin({ ...l, confirm: text });
          else if (kind === "code") setLogin({ ...l, wantsCode: true });
          else if (kind === "notice" && !text.startsWith("Enlace")) setLogin({ ...l, notice: text });
          else if (kind === "done") {
            setLogin(null);
            void load();
          }
        }
        await new Promise((r) => setTimeout(r, 800));
      }
    } catch {
      // Si se corta, la persona puede volver a pulsar «Conectar».
    } finally {
      polling = false;
    }
  }

  async function connectAgent(provider: string) {
    setDoing(provider);
    setCode("");
    try {
      const account = await call<{ id: string }>("add_account", { provider, label: "" });
      setLogin({ provider, id: account.id, url: null, confirm: null, wantsCode: false, notice: null });
      void watchLogin();
      await call("login_account", { provider, id: account.id, mode: "tuberia" });
    } catch (e) {
      setFailed(wslErrorDetail(e) || wslErrorCode(e));
      setLogin(null);
    } finally {
      setDoing(null);
    }
  }

  async function sendCode() {
    const l = login();
    if (!l || !code().trim()) return;
    try {
      await call("submit_login_code", { id: l.id, code: code().trim() });
      setLogin({ ...l, wantsCode: false, notice: t("danil.wsl.login_checking") });
    } catch (e) {
      setFailed(wslErrorDetail(e) || wslErrorCode(e));
    }
  }

  async function remove() {
    setRemoving(true);
    try {
      await invoke("wsl_child_remove", { machine });
      props.onRemoved();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div class="grid gap-3 border-t border-border pt-2" data-wsl-child={props.child.distro}>
      <div class="grid gap-1 text-xs text-neutral-500">
        <span>{t("danil.wsl.detail_user", { user: props.child.user, home: props.child.home })}</span>
        <span>{t("danil.wsl.detail_local")}</span>
      </div>
      <div class="grid gap-2">
        <p class="m-0 text-ui font-[560] text-neutral-950">{t("danil.wsl.agents_title")}</p>
        <Show when={failed()}>{(f) => <p class="m-0 text-xs text-error-strong" role="alert">{f()}</p>}</Show>
        <Show when={surfaces()} fallback={<p class="m-0 flex items-center gap-2 text-xs text-neutral-500"><Spinner size={12} />{t("danil.wsl.agents_loading")}</p>}>
          {(list) => (
            <ul class="m-0 grid list-none gap-1 p-0">
              <For each={list()}>
                {(s) => {
                  const missing = () => s.porque?.clave === "surfaces.not_installed";
                  return (
                    <li class="flex flex-wrap items-center gap-2 rounded-sm border border-border px-2 py-1.5" data-wsl-agent={s.provider}>
                      <SignalDot tone={s.usable ? "success" : "off"} />
                      <span class="flex-1 text-ui text-neutral-950">{s.label}</span>
                      <span class="text-xs text-neutral-500">{s.usable ? t("danil.wsl.agent_ready") : (s.marca ?? "")}</span>
                      <Show when={doing() === s.provider}><Spinner size={12} /></Show>
                      <Show when={!s.usable && !doing()}>
                        <Show
                          when={missing()}
                          fallback={<Button size="sm" variant="secondary" onClick={() => void connectAgent(s.provider)}>{t("danil.wsl.agent_connect")}</Button>}
                        >
                          <Button size="sm" variant="secondary" onClick={() => void installAgent(s.provider)}>{t("danil.wsl.agent_install")}</Button>
                        </Show>
                      </Show>
                    </li>
                  );
                }}
              </For>
            </ul>
          )}
        </Show>
        <Show when={login()}>
          {(l) => (
            <div class="grid gap-2 rounded-sm border border-border p-2" data-wsl-login={l().provider}>
              <Show when={l().url} fallback={<p class="m-0 flex items-center gap-2 text-xs text-neutral-500"><Spinner size={12} />{t("danil.wsl.login_waiting")}</p>}>
                {(url) => (
                  <Button size="sm" variant="secondary" class="justify-self-start" onClick={() => void invoke("open_external", { target: url() }).catch(() => {})}>
                    {t("danil.wsl.login_open")}
                  </Button>
                )}
              </Show>
              <Show when={l().confirm}>{(c) => <p class="m-0 text-xs text-neutral-700">{t("danil.wsl.login_confirm", { code: c() })}</p>}</Show>
              <Show when={l().wantsCode || l().provider === "claude"}>
                <div class="flex gap-2">
                  <Input value={code()} placeholder={t("danil.wsl.login_code")} onInput={(e) => setCode(e.currentTarget.value)} />
                  <Button size="sm" disabled={!code().trim()} onClick={() => void sendCode()}>{t("danil.wsl.login_send")}</Button>
                </div>
              </Show>
              <Show when={l().notice}>{(n) => <p class="m-0 text-xs text-neutral-500">{n()}</p>}</Show>
              <Button size="sm" variant="secondary" class="justify-self-start" onClick={() => { void call("cancel_login", { id: l().id }).catch(() => {}); setLogin(null); }}>
                {t("danil.wsl.cancel")}
              </Button>
            </div>
          )}
        </Show>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={removing()} onClick={() => void remove()} data-wsl-remove="">
          {t("danil.wsl.remove")}
        </Button>
      </div>
    </div>
  );
}
