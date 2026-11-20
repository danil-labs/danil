import "../../locales/danilPhrases";
import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke";
import { capabilities } from "../../lib/platform";
import { escribirPref, leerPref } from "../../lib/prefs";
import { Button } from "../../ui/Button";
import { Spinner } from "../../ui/Spinner";
import { createDanilSession } from "../settings";
import { type AdoptionStep, FIRST_LOGIN_KEY, firstLoginPhase, type FirstLoginPhase, firstLoginSignedIn, linkingOutcome, localCandidateCount, shouldMarkFirstLoginDone } from "./first-login";
import type { sessionRail } from "./session-groups";

type Rail = ReturnType<typeof sessionRail>;
/** Lo que tarda la pantalla en soltar el riel si el servidor no avanza: lo demás sigue en segundo plano. */
const LINKING_LIMIT_MS = 60_000;
const STEP_KEYS: Record<AdoptionStep, string> = { waiting: "shell.first_login.step.waiting", working: "shell.first_login.step.working", done: "shell.first_login.step.done", later: "shell.first_login.step.later" };
const TITLE = "m-0 text-3xl leading-tight font-display font-bold tracking-[-0.03em] text-neutral-950";
const BODY = "m-0 text-sm text-neutral-700";

/**
 * El login del primer arranque de esta versión, antes del riel (plan «desk-ligar-locales» § 2).
 * No tiene pantalla de error: lo que falla se reintenta solo y el riel queda libre.
 */
export function FirstLogin(props: { sessions: Rail; active: () => string | null; onOpen: (id: string, context?: string) => void }) {
  const [phase, setPhase] = createSignal<FirstLoginPhase>({ t: "hidden" });
  const [count, setCount] = createSignal(0);
  const session = createDanilSession({ oneClick: false });
  const [signing, setSigning] = createSignal(false);
  let seen: { progress: unknown; outcome: unknown } = { progress: null, outcome: null };
  let limit: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(limit));

  const close = () => { clearTimeout(limit); setPhase({ t: "hidden" }); props.sessions.releaseAdoption(); };
  async function finish() {
    const remaining = await localCandidateCount(invoke);
    if (shouldMarkFirstLoginDone({ signedIn: true, remaining })) escribirPref(FIRST_LOGIN_KEY, true);
    close();
    const personal = props.sessions.groups()?.find((g) => g.free);
    if (!personal?.free || props.active()) return;
    const id = personal.added?.has(personal.free.id) ? personal.free.id : await props.sessions.createFree(personal.context_id).catch(() => null);
    if (id) props.onOpen(id, personal.context_id);
  }
  async function proceed() {
    setSigning(false);
    const n = await localCandidateCount(invoke);
    setCount(n);
    if (!n) return void finish();
    seen = { progress: props.sessions.adoptionProgress(), outcome: props.sessions.personalOutcome() };
    setPhase({ t: "linking" });
    limit = setTimeout(close, LINKING_LIMIT_MS);
    props.sessions.releaseAdoption();
  }

  onMount(() => {
    if (!capabilities().nativeWindow || leerPref<boolean>(FIRST_LOGIN_KEY, false) === true) return props.sessions.releaseAdoption();
    void Promise.all([invoke<{ state?: string; email?: string | null }>("danil_session_status").catch(() => null), localCandidateCount(invoke)]).then(([status, n]) => {
      setCount(n);
      const next = firstLoginPhase({ done: false, status, signedInThisRun: firstLoginSignedIn() });
      if (next.t === "linking") void proceed();
      else setPhase(next);
    });
  });
  // El login del navegador vuelve por `danil-connect`: con la sesión puesta, se sigue.
  createEffect(on(() => session.status()?.state, (state) => { if (signing() && state === "connected") void proceed(); }));
  createEffect(() => {
    if (phase().t !== "linking") return;
    const progress = props.sessions.adoptionProgress(), outcome = props.sessions.personalOutcome();
    const fresh = linkingOutcome(progress === seen.progress ? null : progress, outcome === seen.outcome ? null : outcome);
    if (fresh === "done") void finish();
    else if (fresh === "background") close();
  });

  async function signIn() {
    setSigning(true);
    await session.withBrowser();
    // Cancelado o rechazado: vuelve el botón con la causa. Una sesión que ya estaba no cambia de estado.
    if (signing()) session.status()?.state === "connected" && !session.message() ? void proceed() : setSigning(false);
  }
  const rows = () => props.sessions.adoptionProgress()?.rows ?? [];
  const personalName = () => {
    const org = props.sessions.adoptionProgress()?.org;
    const group = props.sessions.groups()?.find((g) => g.org === org) ?? props.sessions.groups()?.find((g) => g.free);
    return group?.org_name ?? group?.org ?? "";
  };
  const stays = () => {
    const org = props.sessions.adoptionProgress()?.org;
    return org ? props.sessions.sealedElsewhere(org) : [];
  };
  const orgName = (org: string) => props.sessions.groups()?.find((g) => g.org === org)?.org_name;

  return (
    <Show when={phase().t !== "hidden"}>
      <Portal>
        <div class="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-bg" data-first-login={phase().t}>
          <section class="mx-auto flex w-full max-w-[520px] flex-col gap-6 px-8 py-12">
            <Show when={phase().t === "linking"} fallback={
              <>
                <h1 class={TITLE}>{t("danil.welcome.title")}</h1>
                <Show when={phase().t === "sign_in"}><p class={BODY}>{t("danil.welcome.connect_effect")}</p></Show>
                <Show when={count() > 0}><p class={BODY}>{t("shell.first_login.found", { n: count(), count: count() })}</p></Show>
                <Show when={signing()} fallback={
                  <div class="flex flex-wrap items-center gap-2">
                    <Show when={phase().t === "continue" && (phase() as { email: string }).email} fallback={
                      <Button size="md" disabled={session.busy()} onClick={() => void signIn()} data-first-login-sign-in="">{t("danil.welcome.connect")}</Button>
                    }>{(email) => <>
                      <Button size="md" disabled={session.busy()} onClick={() => void proceed()} data-first-login-continue="">{t("danil.account.continue_as", { email: email() })}</Button>
                      <Button size="md" variant="ghost" disabled={session.busy()} onClick={() => void signIn()} data-first-login-other="">{t("danil.account.sign_in_other")}</Button>
                    </>}</Show>
                  </div>
                }>
                  <p class="m-0 flex items-center gap-2 text-sm text-neutral-700" role="status"><Spinner size={14} />{t("danil.welcome.waiting")}</p>
                </Show>
                <Show when={session.message()}>{(m) => <p class="m-0 text-xs text-error-strong" role="alert">{m()}</p>}</Show>
              </>
            }>
              <h1 class={TITLE}>{t("shell.first_login.linking_title")}</h1>
              <Show when={personalName()}>{(name) => <p class={BODY}>{t("shell.first_login.linking_target", { org: name() })}</p>}</Show>
              <ul class="m-0 grid list-none gap-0 rounded-lg border border-border bg-surface-raised p-0" data-first-login-rows="">
                <For each={stays()}>{(w) => (
                  <li class="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0" data-first-login-row={w.id} data-step="stays">
                    <span class="min-w-0 truncate text-neutral-950">{w.name}</span>
                    <span class="shrink-0 text-xs text-neutral-500">{orgName(w.org) ? t("shell.first_login.stays", { org: orgName(w.org)! }) : t("shell.first_login.stays_other")}</span>
                  </li>
                )}</For>
                <For each={rows()}>{(row) => (
                  <li class="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0" data-first-login-row={row.id} data-step={row.step}>
                    <span class="min-w-0 truncate text-neutral-950">{row.name}</span>
                    <Show when={row.step === "working"} fallback={<span class={row.step === "done" ? "shrink-0 text-xs text-success-strong" : "shrink-0 text-xs text-neutral-500"}>{t(STEP_KEYS[row.step])}</span>}>
                      <Spinner size={12} label={t(STEP_KEYS.working)} />
                    </Show>
                  </li>
                )}</For>
              </ul>
              <p class="m-0 text-xs text-neutral-500">{t("shell.first_login.linking_note")}</p>
            </Show>
          </section>
        </div>
      </Portal>
    </Show>
  );
}
