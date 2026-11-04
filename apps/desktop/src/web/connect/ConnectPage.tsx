import { createSignal, Match, onMount, Switch } from "solid-js";
import { t } from "../../lib/i18n";
import { requestAccessInPage, TerminusLicense } from "../../features/settings/TerminusLicense";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import type { Session } from "../session";
import { BrowserAccount } from "../BrowserAccount";
import "../phrases";
import { AccessRequest } from "../auth/AccessRequest";
import { approveDevice, denyDevice, type DeviceAnswer, type DeviceRequest, lookupDevice } from "./devices";
import { type DesktopHandoff, finishDesktop } from "./desktop";

export type ConnectView =
  | { t: "loading" }
  | { t: "missing" }
  | { t: "invalid" }
  | { t: "license" }
  | { t: "no_account" }
  | { t: "access_required" }
  | { t: "used" }
  | { t: "ambiguous" }
  | { t: "error" }
  | { t: "ask"; device: DeviceRequest }
  | { t: "approving"; device: DeviceRequest }
  | { t: "done" }
  | { t: "denied" };

/** `alfa-app.danil.ai/connect?code=…`: approves a Terminus that asked to join this account. */
export function ConnectPage(props: { session: Session; endpoint: string; code: string; desktop?: DesktopHandoff | null }) {
  const [view, setView] = createSignal<ConnectView>(props.code ? { t: "loading" } : { t: "missing" });
  const [name, setName] = createSignal("");

  /** A refused token is refreshed once; a second refusal has already sent the person to the login. */
  async function withToken<T>(call: (token: string) => Promise<DeviceAnswer<T>>): Promise<DeviceAnswer<T> | null> {
    const answer = await call(await props.session.getToken());
    if (answer.kind !== "unauthorized") return answer;
    if (!(await props.session.unauthorized())) return null;
    return call(await props.session.getToken());
  }

  const refused = (answer: DeviceAnswer<unknown>) => {
    if (answer.kind === "expired" || answer.kind === "invalid") setView({ t: "invalid" });
    else if (answer.kind === "access_required" || answer.kind === "license" || answer.kind === "no_account" || answer.kind === "used" || answer.kind === "ambiguous") setView({ t: answer.kind });
    else setView({ t: "error" });
  };

  async function load() {
    setView({ t: "loading" });
    const answer = await withToken((token) => lookupDevice(props.endpoint, token, props.code)).catch(() => null);
    if (!answer) return;
    if (answer.kind !== "ok") return refused(answer);
    setName(answer.value.name || answer.value.hostname);
    setView({ t: "ask", device: answer.value });
  }

  async function approve(device: DeviceRequest) {
    setView({ t: "approving", device });
    const chosen = name().trim() || device.hostname;
    const answer = await withToken((token) => approveDevice(props.endpoint, token, props.code, chosen)).catch(() => null);
    if (!answer) return;
    if (answer.kind !== "ok") return refused(answer);
    // La ventana recibe su sesión solo con el dispositivo ya aprobado.
    const back = props.desktop ? await finishDesktop(props.desktop, window.location.origin) : null;
    setView({ t: "done" });
    if (back) window.location.assign(back);
  }

  async function deny(device: DeviceRequest) {
    setView({ t: "approving", device });
    const answer = await withToken((token) => denyDevice(props.endpoint, token, props.code)).catch(() => null);
    if (!answer) return;
    if (answer.kind !== "ok") return refused(answer);
    setView({ t: "denied" });
  }

  onMount(() => {
    if (props.code) void load();
  });

  const device = () => {
    const v = view();
    return v.t === "ask" || v.t === "approving" ? v.device : null;
  };
  const note = (text: string) => <p class="m-0 max-w-[60ch] text-sm text-neutral-950">{text}</p>;

  return (
    <main class="flex h-full flex-col overflow-y-auto bg-bg px-10 py-10" data-web-connect={view().t}>
      <h1 class="m-0 mb-5 text-3xl leading-tight font-display font-bold tracking-[-0.03em] text-neutral-950">{t("common.brand_name")}</h1>
      <BrowserAccount session={props.session} disabled={view().t === "approving"} />
      <Switch>
        <Match when={view().t === "loading"}>
          <p class="m-0 text-sm text-neutral-500">{t("danil.connect.loading")}</p>
        </Match>
        <Match when={view().t === "missing"}>{note(t("danil.connect.missing_code"))}</Match>
        <Match when={view().t === "invalid"}>{note(t("danil.connect.invalid"))}</Match>
        <Match when={view().t === "license"}>
          <TerminusLicense onRequest={requestAccessInPage} onRetry={() => void load()} />
        </Match>
        <Match when={view().t === "access_required"}>
          {note(t("web.auth.access_required"))}
          <div class="mt-6 max-w-sm"><AccessRequest /></div>
        </Match>
        <Match when={view().t === "no_account"}>{note(t("danil.connect.no_account"))}</Match>
        <Match when={view().t === "used"}>{note(t("danil.connect.used"))}</Match>
        <Match when={view().t === "ambiguous"}>{note(t("danil.connect.ambiguous"))}</Match>
        <Match when={view().t === "done"}>{note(t("danil.connect.done"))}</Match>
        <Match when={view().t === "denied"}>{note(t("danil.connect.denied"))}</Match>
        <Match when={view().t === "error"}>
          {note(t("danil.connect.error"))}
          <div class="mt-6">
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              {t("danil.connect.retry")}
            </Button>
          </div>
        </Match>
        <Match when={device()}>
          {(d) => (
            <form
              class="grid max-w-md gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void approve(d());
              }}
            >
              <p class="m-0 text-base text-neutral-950">{t("danil.connect.ask", { hostname: d().hostname, platform: d().platform })}</p>
              <p class="m-0 text-xs text-neutral-500">{t("danil.connect.code", { code: props.code })}</p>
              <label class="grid gap-1.5 text-ui text-neutral-500">
                {t("danil.connect.name_label")}
                <Input class="min-h-11 border-neutral-500 text-base" value={name()} onInput={(e) => setName(e.currentTarget.value)} disabled={view().t === "approving"} data-machine-name="" />
                <span class="text-xs">{t("danil.connect.name_hint")}</span>
              </label>
              <div class="flex flex-wrap gap-2">
                <Button class="min-h-11" type="submit" size="sm" disabled={view().t === "approving"}>
                  {view().t === "approving" ? t("danil.connect.approving") : t("danil.connect.approve")}
                </Button>
                <Button class="min-h-11" type="button" size="sm" variant="ghost" disabled={view().t === "approving"} onClick={() => void deny(d())}>
                  {t("danil.connect.deny")}
                </Button>
              </div>
            </form>
          )}
        </Match>
      </Switch>
    </main>
  );
}
