import "../../../ui/src/locales/danilPhrases";
import { createEffect, createMemo, createSignal, For, type JSX, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { t } from "../../../ui/src/lib/i18n";
import { invoke } from "../../../engine-client/src/client";
import { capabilities } from "../../../host/src/platform";
import { escribirPref, leerPref } from "../../../session/src/prefs";
import { listen } from "../../../host/src/serviceEvents.ts";
import { Button } from "../../../ui/src/Button";
import { Spinner } from "../../../ui/src/Spinner";
import { CabeceraDelAlta, rememberAccountWelcome } from "../../../features/onboarding/src";
import ControlesDeVentana from "./WindowControls";
import { said } from "../../../features/settings/src";
import { type EngineAdoption, engineAdoptionDone, engineAdoptionFinished, engineAdoptionProgress, engineAdoptionReport, engineOwnsAdoption, onEngineAdoption, readEngineAdoption } from "./engine-adoption";
import { accountWorkspaces } from "./session-account-workspaces";
import { engineFeatures } from "./engine-features";
import { type AdoptionStep, FIRST_LOGIN_KEY, firstLoginSignedIn, localCandidateCount, shouldMarkFirstLoginDone } from "./first-login";
import { createLinker } from "./first-login-link";
import { gateView, handAdoptionReport } from "./session-gate";
import { type PersonSession, personSessionSource, type SessionSource } from "./session-source";

/** Lo que espera la pantalla al servidor antes de soltar la app: lo pendiente sigue en el riel. */
const LINKING_LIMIT_MS = 60_000;
const STEP_KEYS: Record<AdoptionStep, string> = { waiting: "shell.first_login.step.waiting", working: "shell.first_login.step.working", done: "shell.first_login.step.done", later: "shell.first_login.step.later" };
const TITLE = "m-0 text-3xl leading-tight font-display font-bold tracking-[-0.03em] text-neutral-950";
const BODY = "m-0 text-sm text-neutral-700";
const ROW = "flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0";

/**
 * Nada de la app se monta sin una sesión de Desk confirmada (plan «desk-ligar-locales» § 2):
 * primero la carga, luego el login inicial y, la primera vez, el ligado de los locales.
 * Si la sesión se cierra con la app abierta, se desmonta y vuelve el login.
 */
export function SessionGate(props: { children: JSX.Element }) {
  const [status, setStatus] = createSignal<PersonSession | undefined>(undefined);
  const [done, setDone] = createSignal(leerPref<boolean>(FIRST_LOGIN_KEY, false) === true);
  const [confirmed, setConfirmed] = createSignal(false);
  const [linked, setLinked] = createSignal(false);
  const [linker, setLinker] = createSignal<ReturnType<typeof createLinker> | null>(null);
  // Con el rasgo de adopción del motor, «Ligando…» es lo que el motor reporta.
  const [engineRun, setEngineRun] = createSignal<EngineAdoption | null>(null);
  // Lo que el motor no reporta por workspace: los locales al empezar y lo que ya es de otra organización.
  const [engineLocals, setEngineLocals] = createSignal<{ id: string; name: string }[]>([]);
  const [engineKept, setEngineKept] = createSignal<{ id: string; name: string; org: string }[]>([]);
  const [count, setCount] = createSignal(0);
  const [signing, setSigning] = createSignal(false);
  const [problem, setProblem] = createSignal<string | null>(null);
  let source: Promise<SessionSource> | null = null;
  const origin = () => (source ??= personSessionSource(invoke, engineFeatures, listen));
  let running = false;

  const read = () => origin().then((s) => s.read()).then((s) => setStatus(s), () => setStatus(null));
  onMount(() => {
    if (!capabilities().nativeWindow) return;
    void read();
    void localCandidateCount(invoke, engineFeatures).then((n) => setCount(n ?? 0));
    const changes = origin().then((s) => s.changes(setStatus));
    // Una sesión que venció sin evento se nota al volver a la ventana.
    window.addEventListener("focus", read);
    onCleanup(() => { window.removeEventListener("focus", read); void changes.then((off) => off()); });
  });

  const view = createMemo(() => capabilities().nativeWindow
    ? linker() || engineRun() ? { t: "linking" as const } : gateView({ status: status(), done: done(), signedInThisRun: firstLoginSignedIn() || confirmed(), linked: linked() })
    : { t: "open" as const });

  const markDone = () => { escribirPref(FIRST_LOGIN_KEY, true); setDone(true); };
  const contexts = () => ((status() as { sessions?: { contexts?: { context_id: string; org: string; org_name?: string | null }[] }[] } | null)?.sessions ?? []).flatMap((s) => s.contexts ?? []);
  const contextOf = (org: string | null) => contexts().find((c) => c.org === org);
  /** El motor adopta solo: se espera a que cierre su repaso y se pinta lo que reporta. */
  async function linkByEngine(locals: number) {
    const first = await readEngineAdoption(invoke);
    if (!first) return void console.warn("[first-login] the engine owns adoption but reports no state");
    // Sin locales no hay nada que esperar; con locales, un `done` de antes del login no basta.
    if (locals === 0) return markDone();
    const candidates = await invoke<{ id: string; name: string; adoptable?: boolean }[]>("adoption_candidates").catch(() => []);
    setEngineLocals(candidates.filter((c) => c.adoptable !== false).map(({ id, name }) => ({ id, name })));
    setEngineKept(accountWorkspaces(await invoke("list_workspaces").catch(() => null)).map((w) => ({ id: w.id, name: w.name, org: w.account.org })));
    // Un repaso que ya cerró antes del login no cuenta: se espera el que corre ahora.
    let settled = first.state === "running" ? null : first;
    setEngineRun(first);
    let off: (() => void) | undefined;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, LINKING_LIMIT_MS);
      void onEngineAdoption(listen, (a) => {
        setEngineRun(a);
        if (a.state === "running") settled = null;
        else if (engineAdoptionFinished(a) && a !== settled) { clearTimeout(timer); resolve(); }
      }).then((stop) => { off = stop; });
      if (!settled && engineAdoptionFinished(first)) { clearTimeout(timer); resolve(); }
    });
    off?.();
    const last = engineRun();
    if (!last) return;
    const remaining = await localCandidateCount(invoke, engineFeatures);
    const target = contextOf(last.org);
    handAdoptionReport(engineAdoptionReport(last, target?.context_id, target?.org_name ?? null));
    if (engineAdoptionDone(last, remaining)) markDone();
    else console.warn("[first-login] the engine has not finished linking", { state: last.state, cause: last.cause, remaining });
  }
  async function link() {
    if (running) return;
    running = true;
    rememberAccountWelcome("connected");
    try {
      if (engineOwnsAdoption(await engineFeatures())) return void (await linkByEngine(await localCandidateCount(invoke, engineFeatures) ?? -1));
      const n = await localCandidateCount(invoke, engineFeatures);
      if (n === null) console.warn("[first-login] engine features unknown: the rail keeps trying");
      if (n) {
        setCount(n);
        const next = createLinker(invoke, engineFeatures);
        setLinker(next);
        const outcome = await Promise.race([next.run(), new Promise<"background">((resolve) => setTimeout(() => resolve("background"), LINKING_LIMIT_MS))]);
        handAdoptionReport(next.report());
        if (outcome === "background") console.warn("[first-login] linking continues in the background");
      }
      const remaining = n ? await localCandidateCount(invoke, engineFeatures) : n;
      if (shouldMarkFirstLoginDone({ signedIn: true, remaining })) markDone();
    } finally {
      setLinker(null);
      setEngineRun(null);
      setLinked(true);
      running = false;
    }
  }
  createEffect(() => { if (view().t === "linking" && !linker() && !engineRun()) void link(); });
  // Con la sesión confirmada aquí, el alta no vuelve a preguntar por la cuenta.
  createEffect(() => { if (view().t === "open" && status()?.state === "connected") rememberAccountWelcome("connected"); });
  // Un login por código termina con `danil-connect`, no al volver de `signIn`.
  createEffect(() => { if (signing() && status()?.state === "connected") { setSigning(false); setConfirmed(true); } });

  async function signIn() {
    setSigning(true);
    setProblem(null);
    try {
      await (await origin()).signIn();
      await read();
      // Recién entrado: no se vuelve a preguntar «Continuar como».
      if (status()?.state === "connected") { setConfirmed(true); setSigning(false); }
      else if (status()?.state !== "pending") setSigning(false);
    } catch (e) {
      setProblem((e as { detail?: string; code?: string } | null)?.detail ?? (e as { code?: string } | null)?.code ?? "failed");
      setSigning(false);
    }
  }

  const rows = () => { const e = engineRun(); return e ? engineAdoptionProgress(e, engineLocals()).rows : linker()?.progress()?.rows ?? []; };
  const groupOf = (org: string | undefined) => linker()?.groups()?.find((g) => g.org === org);
  const personalName = () => {
    const e = engineRun();
    if (e) return e.org ? contextOf(e.org)?.org_name ?? "" : "";
    const g = groupOf(linker()?.progress()?.org);
    return g?.org_name ?? g?.org ?? "";
  };
  const stays = () => {
    const e = engineRun();
    if (e) return e.org ? engineKept().filter((w) => w.org !== e.org).map((w) => ({ id: w.id, name: w.name, org_name: contextOf(w.org)?.org_name ?? null })) : [];
    const org = linker()?.progress()?.org;
    return org ? (linker()?.sealedElsewhere(org) ?? []).map((w) => ({ id: w.id, name: w.name, org_name: groupOf(w.org)?.org_name ?? null })) : [];
  };

  return (
    <Switch>
      <Match when={view().t === "open"}>{props.children}</Match>
      <Match when={true}>
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg" data-session-gate={view().t}>
          <CabeceraDelAlta ControlesDeVentana={ControlesDeVentana} />
          <div class="min-h-0 flex-1 overflow-y-auto">
            <section class="mx-auto flex w-full max-w-[520px] flex-col gap-6 px-8 py-12">
              <Switch>
                <Match when={view().t === "loading"}>
                  <p class="m-0 flex items-center gap-2 text-sm text-neutral-700" role="status"><Spinner size={16} label={t("danil.welcome.title")} /></p>
                </Match>
                <Match when={view().t === "linking"}>
                  <h1 class={TITLE}>{t("shell.first_login.linking_title")}</h1>
                  <Show when={personalName()}>{(name) => <p class={BODY}>{t("shell.first_login.linking_target", { org: name() })}</p>}</Show>
                  <ul class="m-0 grid list-none gap-0 rounded-lg border border-border bg-surface-raised p-0" data-first-login-rows="">
                    <For each={stays()}>{(w) => (
                      <li class={ROW} data-first-login-row={w.id} data-step="stays">
                        <span class="min-w-0 truncate text-neutral-950">{w.name}</span>
                        <span class="shrink-0 text-xs text-neutral-500">{w.org_name ? t("shell.first_login.stays", { org: w.org_name }) : t("shell.first_login.stays_other")}</span>
                      </li>
                    )}</For>
                    <For each={rows()}>{(row) => (
                      <li class={ROW} data-first-login-row={row.id} data-step={row.step}>
                        <span class="min-w-0 truncate text-neutral-950">{row.name}</span>
                        <Show when={row.step === "working"} fallback={<span class={row.step === "done" ? "shrink-0 text-xs text-success-strong" : "shrink-0 text-xs text-neutral-500"}>{t(STEP_KEYS[row.step])}</span>}>
                          <Spinner size={12} label={t(STEP_KEYS.working)} />
                        </Show>
                      </li>
                    )}</For>
                  </ul>
                  <p class="m-0 text-xs text-neutral-500">{t("shell.first_login.linking_note")}</p>
                </Match>
                <Match when={true}>
                  <h1 class={TITLE}>{t("danil.welcome.title")}</h1>
                  <Show when={view().t === "sign_in"}><p class={BODY}>{t("danil.welcome.connect_effect")}</p></Show>
                  <Show when={count() > 0 && !done()}><p class={BODY}>{t("shell.first_login.found", { n: count(), count: count() })}</p></Show>
                  <Show when={signing()} fallback={
                    <div class="flex flex-wrap items-center gap-2">
                      <Show when={(view() as { email?: string }).email} fallback={
                        <Button size="md" disabled={signing()} onClick={() => void signIn()} data-first-login-sign-in="">{t("danil.welcome.connect")}</Button>
                      }>{(email) => <>
                        <Button size="md" disabled={signing()} onClick={() => setConfirmed(true)} data-first-login-continue="">{t("danil.account.continue_as", { email: email() })}</Button>
                        <Button size="md" variant="ghost" disabled={signing()} onClick={() => void signIn()} data-first-login-other="">{t("danil.account.sign_in_other")}</Button>
                      </>}</Show>
                    </div>
                  }>
                    <p class="m-0 flex items-center gap-2 text-sm text-neutral-700" role="status"><Spinner size={14} />{t("danil.welcome.waiting")}</p>
                    <Show when={status()?.user_code}>{(code) => <strong class="self-start select-all rounded-sm bg-surface-muted px-3 py-2 font-mono text-2xl font-semibold tracking-[0.12em] text-neutral-950">{code()}</strong>}</Show>
                  </Show>
                  <Show when={problem()}>{(code) => <p class="m-0 text-xs text-error-strong" role="alert">{said(code())}</p>}</Show>
                </Match>
              </Switch>
            </section>
          </div>
        </div>
      </Match>
    </Switch>
  );
}
