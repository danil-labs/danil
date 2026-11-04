/**
 * El primer paso del alta en la ventana: conectar la cuenta de Danil o seguir
 * sin ella. Conectar usa el mismo inicio de sesión de Configuración y toma el
 * workspace de Danil de esa cuenta; con varios, la persona elige.
 */
import type { DirectoryEntry } from "@terminus/computers";
import Cloud from "lucide-solid/icons/cloud";
import Laptop from "lucide-solid/icons/laptop";
import { createEffect, createSignal, For, type JSX, on, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { capabilities } from "../../lib/platform";
import { cn } from "../../lib/utils";
import { Button } from "../../ui/Button";
import { Spinner } from "../../ui/Spinner";
import { createDanilSession } from "../settings/danil-session";
import { defaultSession, readSessions, sessionKey, setWorkspaceAccount, changeProblem } from "../settings/danil-sessions";
import { linkProblem } from "../settings/workspace-link";
import { startTrialInBrowser, TerminusLicense } from "../settings/TerminusLicense";
import { rememberAccountWelcome } from "./account-welcome";
import { adoptDanilWorkspace, isTaken, pickWelcomeWorkspace } from "./welcome-workspace";
import { crearWorkspace } from "./onboarding-store";

type Step = "choose" | "signing" | "loading" | "pick" | "linking";

export type ConnectAccountResult = { workspace: { id: string; nombre: string } | null; connected: boolean };

const roleText = (role: string | null) => {
  if (role === "owner") return t("danil.workspace.role.owner");
  if (role === "admin") return t("danil.workspace.role.admin");
  if (role === "member") return t("danil.workspace.role.member");
  return role ?? "";
};

function Opcion(props: { icono: JSX.Element; titulo: string; efecto: string; disabled?: boolean; onClick: () => void; data: string }) {
  return (
    <button
      type="button"
      class="flex w-full items-start gap-3 rounded-lg border border-border bg-surface-raised px-4 py-3.5 text-left outline-none hover:bg-surface-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
      disabled={props.disabled}
      onClick={() => props.onClick()}
      {...{ [props.data]: "" }}
    >
      <span class="mt-0.5 shrink-0 text-neutral-700">{props.icono}</span>
      <span class="grid min-w-0 gap-0.5">
        <span class="text-sm font-semibold text-neutral-950">{props.titulo}</span>
        <span class="text-xs text-neutral-500">{props.efecto}</span>
      </span>
    </button>
  );
}

export default function ConnectAccount(props: { onListo: (result: ConnectAccountResult) => void }) {
  const session = createDanilSession({ oneClick: false });
  const [step, setStep] = createSignal<Step>("choose");
  const [entries, setEntries] = createSignal<DirectoryEntry[]>([]);
  const [account, setAccount] = createSignal<string | null>(null);
  const [problem, setProblem] = createSignal<string | null>(null);
  const [linking, setLinking] = createSignal<string | null>(null);
  /** Si el enlace falló después de crear el workspace local, se reusa al reintentar. */
  let created: { id: string; nombre: string } | null = null;

  const finish = (result: ConnectAccountResult) => {
    rememberAccountWelcome(result.connected ? "connected" : "local");
    props.onListo(result);
  };

  async function keyOfSession(): Promise<string | null> {
    const status = session.status();
    if (status?.account) return status.account;
    const sessions = await readSessions().catch(() => null);
    const main = defaultSession(sessions);
    return main ? sessionKey(main) : (status?.computer_id ?? null);
  }

  async function afterConnected() {
    setStep("loading");
    setProblem(null);
    const key = await keyOfSession();
    const directory = capabilities().workspaceDirectory;
    if (!key || !directory) return finish({ workspace: null, connected: true });
    setAccount(key);
    try {
      const listing = await directory.list(key);
      const pick = pickWelcomeWorkspace(listing.workspaces);
      if (pick.kind === "none") return finish({ workspace: null, connected: true });
      if (pick.kind === "one") return void adopt(pick.entry);
      setEntries(pick.entries);
      setStep("pick");
    } catch {
      setProblem("directory_failed");
      setStep("pick");
    }
  }

  async function adopt(entry: DirectoryEntry) {
    const key = account();
    const directory = capabilities().workspaceDirectory;
    if (!key || !directory) return;
    setStep("linking");
    setLinking(entry.name);
    setProblem(null);
    try {
      const workspace = await adoptDanilWorkspace(entry, key, t("onboarding.workspace.default"), {
        createWorkspace: async (name) => created ?? (await crearWorkspace(name)),
        link: (id, danilId, who) => directory.link(id, danilId, who),
        setAccount: (id, who) => setWorkspaceAccount(id, who),
      });
      finish({ workspace, connected: true });
    } catch (e) {
      const partial = (e as { workspace?: { id: string; nombre: string } } | null)?.workspace;
      if (partial) created = partial;
      setProblem(linkProblem(changeProblem(null, e)));
      setEntries((list) => (list.length ? list : [entry]));
      setStep("pick");
    } finally {
      setLinking(null);
    }
  }

  function connect() {
    setProblem(null);
    if (session.status()?.state === "connected") return void afterConnected();
    setStep("signing");
    void session.withBrowser();
  }

  createEffect(
    on(
      () => session.status()?.state,
      (state) => {
        if (step() === "signing" && state === "connected") void afterConnected();
      },
    ),
  );

  async function cancelSigning() {
    await session.signOut();
    setStep("choose");
  }

  const problemText = (code: string) => {
    if (code === "taken") return t("danil.workspace.taken_error");
    if (code === "not_admin") return t("danil.workspace.not_admin");
    if (code === "directory_failed") return t("danil.workspace.directory_failed");
    return t("danil.welcome.link_failed");
  };

  const signInMessage = () => (step() === "signing" || step() === "choose" ? session.message() : null);

  return (
    <div class="min-h-0 flex-1 overflow-y-auto" data-account-welcome={step()}>
      <section class="mx-auto flex w-full max-w-[520px] flex-col gap-6 px-8 py-12">
        <h1 class="m-0 text-3xl leading-tight font-display font-bold tracking-[-0.03em] text-neutral-950">
          {t("danil.welcome.title")}
        </h1>

        <Show when={step() === "choose"}>
          <div class="grid gap-2.5">
            <Opcion
              data="data-account-welcome-connect"
              icono={<Cloud size={18} />}
              titulo={t("danil.welcome.connect")}
              efecto={t("danil.welcome.connect_effect")}
              disabled={session.busy() || session.view().t === "loading"}
              onClick={connect}
            />
            <Opcion
              data="data-account-welcome-local"
              icono={<Laptop size={18} />}
              titulo={t("danil.welcome.local")}
              efecto={t("danil.welcome.local_effect")}
              onClick={() => finish({ workspace: null, connected: false })}
            />
          </div>
        </Show>

        <Show when={step() === "signing"}>
          <div class="grid gap-3">
            <p class="m-0 flex items-center gap-2 text-sm text-neutral-700" role="status">
              <Spinner size={14} />
              {t("danil.welcome.waiting")}
            </p>
            <Show when={session.status()?.user_code}>
              {(code) => (
                <strong class="self-start select-all rounded-sm bg-surface-muted px-3 py-2 font-mono text-2xl font-semibold tracking-[0.12em] text-neutral-950">
                  {code()}
                </strong>
              )}
            </Show>
            <div class="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={session.reopen} disabled={!session.status()?.verification_uri_complete}>
                {t("danil.account.open_again")}
              </Button>
              <Button size="sm" variant="ghost" disabled={session.busy()} onClick={() => void cancelSigning()} data-account-welcome-cancel="">
                {t("onboarding.cancel")}
              </Button>
            </div>
          </div>
        </Show>

        <Show when={step() === "loading" || step() === "linking"}>
          <p class="m-0 flex items-center gap-2 text-sm text-neutral-700" role="status">
            <Spinner size={14} />
            {linking() ? t("danil.welcome.linking", { name: linking() ?? "" }) : t("danil.welcome.loading")}
          </p>
        </Show>

        <Show when={step() === "pick"}>
          <div class="grid gap-2" data-account-welcome-pick="">
            <Show when={session.status()?.email}>
              {(email) => <p class="m-0 text-xs text-neutral-500">{t("danil.welcome.connected_as", { email: email() })}</p>}
            </Show>
            <Show when={entries().length}>
              <h2 class="m-0 text-sm font-semibold text-neutral-950">{t("danil.welcome.choose")}</h2>
            </Show>
            <div class="grid gap-1">
              <For each={entries()}>
                {(entry) => (
                  <button
                    type="button"
                    class={cn(
                      "flex min-w-0 items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left text-sm outline-none hover:bg-surface-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50",
                    )}
                    disabled={isTaken(entry)}
                    data-account-welcome-option={entry.key}
                    data-taken={isTaken(entry) ? "" : undefined}
                    onClick={() => void adopt(entry)}
                  >
                    <span class="grid min-w-0 flex-1">
                      <span class="truncate font-medium text-neutral-950">{entry.name || t("shell.directory.unnamed")}</span>
                      <Show when={entry.organization?.name}>
                        {(org) => <span class="truncate text-caption text-neutral-500">{org()}</span>}
                      </Show>
                    </span>
                    <span class="shrink-0 text-caption text-neutral-500">
                      {isTaken(entry) ? t("danil.workspace.taken") : roleText(entry.role)}
                    </span>
                  </button>
                )}
              </For>
            </div>
            <Button
              size="sm"
              variant="ghost"
              class="justify-self-start"
              onClick={() => finish({ workspace: created, connected: true })}
              data-account-welcome-skip-link=""
            >
              {t("danil.welcome.continue_unlinked")}
            </Button>
          </div>
        </Show>

        <Show when={session.license() && step() !== "pick"}>
          <TerminusLicense onStart={startTrialInBrowser} onRetry={() => void session.retry()} busy={session.busy()} compact />
        </Show>
        <Show when={signInMessage()}>
          {(m) => (
            <p class="m-0 text-xs text-error-strong" role="alert">
              {m()}
            </p>
          )}
        </Show>
        <Show when={problem()}>
          {(code) => (
            <p class="m-0 text-xs text-error-strong" role="alert">
              {problemText(code())}
            </p>
          )}
        </Show>
      </section>
    </div>
  );
}
