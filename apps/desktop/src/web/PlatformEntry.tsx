import { createSignal, For, onMount, Show } from "solid-js";
import { render } from "solid-js/web";
import { aplicarLengua, t } from "../lib/i18n";
import { seguirElTema } from "../lib/theme";
import { Button } from "../ui/Button";
import { platformSession, PlatformSessionError, type PlatformProfile, type PlatformWorkspace } from "./platform-session";
import { workspaceSelection } from "./workspace-selection";
import { type WebSessionDeployment } from "./session-config";
import { PlatformInbox } from "./PlatformInbox";
import { platformInbox } from "./platform-inbox";
import { inboxReplyStore } from "./inbox-replies";
import { ToastStack } from "../ui/Toast";
import { UpdateNotice } from "./UpdateNotice";
import "./phrases";

export function startPlatform(options: WebSessionDeployment, root: HTMLElement) {
  aplicarLengua();
  seguirElTema();
  const api = platformSession(options);
  const inbox = platformInbox(options);
  const returnTo = new URL(import.meta.env.BASE_URL, window.location.origin).href;
  function PlatformEntry() {
    const [profile, setProfile] = createSignal<PlatformProfile>();
    const [workspaces, setWorkspaces] = createSignal<PlatformWorkspace[]>([]);
    const [active, setActive] = createSignal<string>();
    const [busy, setBusy] = createSignal(false);
    const [signedOut, setSignedOut] = createSignal(false);
    const [error, setError] = createSignal("");
    let selection = workspaceSelection(api);
    let replies = inboxReplyStore(inbox);
    const [uncertain, setUncertain] = createSignal(false);
    async function run(action: () => Promise<void>) {
      if (busy()) return;
      setBusy(true);
      setError("");
      try { await action(); }
      catch (cause) {
        if (cause instanceof PlatformSessionError && cause.status === 401) {
          setSignedOut(true);
          setProfile(undefined);
          setWorkspaces([]);
          setActive(undefined);
          selection = workspaceSelection(api);
          replies = inboxReplyStore(inbox);
        } else setError(cause instanceof PlatformSessionError && cause.status === 403 ? "web.platform.denied" : "web.platform.unavailable");
      } finally { setActive(selection.active() ?? undefined); setUncertain(selection.uncertain()); setBusy(false); }
    }
    const load = () => run(async () => {
      await selection.reconcile();
      const person = await api.me();
      const listed = await api.workspaces();
      const previous = profile();
      if (previous && previous.id !== person.id) replies = inboxReplyStore(inbox);
      setProfile(person);
      setWorkspaces(listed);
      setSignedOut(false);
    });
    async function select(id: string) {
      if (id === active() && !uncertain()) return;
      await run(async () => { await selection.choose(id); });
    }
    onMount(() => { void load(); });
    return <main class="min-h-full bg-bg px-6 py-10 text-neutral-950" data-platform-session="" aria-busy={busy()}>
      <ToastStack><UpdateNotice /></ToastStack>
      <div class="mx-auto grid max-w-6xl gap-6">
        <header class="flex items-center justify-between gap-4">
          <h1 class="m-0 font-display text-lead font-bold">{t("common.brand_name")}</h1>
          <Show when={profile()}><Button variant="ghost" disabled={busy()} onClick={() => void run(async () => { await api.logout(); setProfile(undefined); setWorkspaces([]); selection = workspaceSelection(api); replies = inboxReplyStore(inbox); setSignedOut(true); })}>{t("web.platform.sign_out")}</Button></Show>
        </header>
        <Show when={profile()}>{person => <h2 class="m-0 text-body font-semibold">{person().name}</h2>}</Show>
        <Show when={signedOut()}><Button as="a" href={api.loginUrl(returnTo)}>{t("web.auth.signin")}</Button></Show>
        <Show when={profile()}>
          <section class="grid gap-3" aria-label={t("web.platform.workspaces")}>
            <h2 class="m-0 text-ui font-semibold">{t("web.platform.workspaces")}</h2>
            <For each={workspaces()} fallback={<p class="text-ui text-neutral-500">{t("web.platform.empty")}</p>}>{row =>
              <Button variant="secondary" disabled={busy() || uncertain()} aria-pressed={active() === row.id} onClick={() => void select(row.id)}>{row.name}<Show when={active() === row.id}><span class="text-caption">{t("web.platform.active")}</span></Show></Button>
            }</For>
          </section>
        </Show>
        <Show when={busy()}><p class="m-0 text-ui text-neutral-500" role="status">{t("web.auth.waiting")}</p></Show>
        <Show when={error()}><div class="grid gap-3"><p class="m-0 text-ui text-error-strong" role="alert">{t(error())}</p><Button variant="secondary" disabled={busy()} onClick={() => void load()}>{t("web.computers.retry")}</Button></div></Show>
        <Show when={profile() && !busy() && !uncertain() && active()} keyed>{workspace => <PlatformInbox workspace={workspace} api={inbox} reply={replies(workspace)}/>}</Show>
      </div>
    </main>;
  }
  root.replaceChildren();
  render(() => <PlatformEntry />, root);
}
