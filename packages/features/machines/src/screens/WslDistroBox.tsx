import { isFreeRouterAgent, isRetiredAgent } from "../../../../ui/src/lib/tasks.ts";
import { invoke } from "@tauri-apps/api/core";
import { For, Match, Show, Switch, createSignal, onMount } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { MarcaAgente } from "../../../../ui/src/icons";
import { Input } from "../../../../ui/src/Input";
import { SignalDot } from "../../../../ui/src/SignalDot";
import { Spinner } from "../../../../ui/src/Spinner";
import type { WslChild } from "../model/wsl";

type Surface = { id: string; provider: string; label: string; catalogo: string; usable: boolean; marca?: string | null; porque?: { clave?: string } | null };
type Login = { provider: string; id: string; url: string | null; confirm: string | null; wantsCode: boolean };

/** Una distro de WSL conectada: Linux, Danil y sus proveedores de IA. */
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
      setSurfaces(list.filter((s) => s.catalogo !== "gratuitos" && !isFreeRouterAgent(s.provider) && !isRetiredAgent(s.provider)));
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
          <span data-box-scope="">{t("danil.wsl.box.scope")}</span>
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
