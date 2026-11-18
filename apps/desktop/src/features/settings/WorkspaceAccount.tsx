/**
 * La cuenta de Danil del workspace, dentro de su tarjeta en Workspaces o en Cuenta de
 * Danil: con qué cuenta está, iniciar sesión y desvincularla (se confirma). Chunk aparte.
 */
import "../../locales/danilPhrases";
import { createEffect, createSignal, on, onCleanup, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import { cn } from "../../lib/utils";
import { createDanilAccounts, type DanilAccounts } from "./danil-accounts";
import { said } from "./danil-session";
import { changeProblem, connectedSessions, setWorkspaceAccount, syncLine } from "./danil-sessions";
import { LICENSE_REQUIRED, requestAccessInBrowser, TerminusLicense } from "./TerminusLicense";

type Mode = "idle" | "confirm-unlink";

/**
 * `placement`: `card` en Workspaces; `section` dentro de Cuenta de Danil.
 */
export default function WorkspaceAccount(props: { workspace: string; name: string; placement?: "card" | "section"; onChanged?: (problem: string | null) => void; state?: DanilAccounts }) {
  const accounts = props.state ?? createDanilAccounts({ workspace: () => props.workspace });
  let generation = 0;
  onCleanup(() => {
    generation++;
  });

  const [mode, setMode] = createSignal<Mode>("idle");
  const [saving, setSaving] = createSignal(false);
  const [problem, setProblem] = createSignal<string | null>(null);

  createEffect(on(() => props.workspace, () => {
    generation++;
    reset();
  }, { defer: true }));

  function reset() {
    setMode("idle");
    setProblem(null);
  }

  const line = () => syncLine(accounts.of(), accounts.sessions());
  const hasAccount = () => Boolean(accounts.of()?.account);
  const adding = () => accounts.pending()?.status === "pending";
  const signedIn = () => connectedSessions(accounts.sessions());
  const message = () => problem() ?? accounts.problem();

  const lineText = () => {
    const l = line();
    if (l.kind === "synced") return t("danil.workspace.synced", { email: l.email });
    if (l.kind === "unlinked") return t("danil.workspace.unlinked", { email: l.email });
    if (l.kind === "none") return t("danil.workspace.no_account");
    return l.email ? t("danil.workspace.unsynced_account", { email: l.email }) : t("danil.workspace.unsynced");
  };

  /** Un código que el catálogo no conoce dice que no se pudo cambiar, no que falló iniciar sesión. */
  const problemText = (code: string) => {
    const text = said(code);
    return code === "failed" || text === t("danil.account.failed") ? t("danil.workspace.failed") : text;
  };

  async function signIn() {
    setProblem(null);
    await accounts.add();
  }

  async function unlink() {
    const mine = ++generation;
    setSaving(true);
    setProblem(null);
    try {
      const result = await setWorkspaceAccount(props.workspace, null);
      if (mine !== generation) return;
      accounts.setOf(result);
      props.onChanged?.(null);
      reset();
      void accounts.reload();
    } catch (e) {
      if (mine !== generation) return;
      setProblem(changeProblem(null, e));
    } finally {
      if (mine === generation) setSaving(false);
    }
  }

  return (
    <Show when={accounts.sessions() && accounts.of()}>
      <div class={cn("grid gap-1 text-xs", props.placement !== "section" && "pl-[27px]")} data-workspace-account={line().kind}>
        <Show when={props.placement !== "section"}>
          <span class="text-neutral-500">{t("danil.workspace.title")}</span>
        </Show>
        <p class="m-0 text-neutral-500" data-workspace-sync="">
          {lineText()}
        </p>
        <Show
          when={hasAccount()}
          fallback={
            <Show when={!signedIn().length}>
              <div class="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" disabled={accounts.busy() || adding()} onClick={() => void signIn()}>
                  {t("danil.account.sign_in")}
                </Button>
              </div>
            </Show>
          }
        >
          <div class="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={saving() || accounts.busy()}
              onClick={() => {
                setProblem(null);
                setMode("confirm-unlink");
              }}
              data-workspace-unlink=""
            >
              {t("danil.workspace.unlink")}
            </Button>
          </div>
        </Show>

        <Show when={mode() === "confirm-unlink"}>
          <div class="flex flex-wrap items-center gap-2" data-workspace-leave="">
            <span class="text-neutral-500">{t("danil.workspace.leave_confirm", { email: accounts.of()?.email || "" })}</span>
            <Button size="sm" variant="secondary" disabled={saving()} onClick={() => void unlink()} data-workspace-leave-yes="">
              {t("danil.workspace.unlink")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
              {t("danil.workspace.leave_no")}
            </Button>
          </div>
        </Show>

        <Show when={adding()}>
          <p class="m-0 text-neutral-500" data-workspace-adding="">
            {t("danil.account.pending", { code: accounts.pending()?.user_code ?? "" })}{" "}
            <button type="button" class="cursor-pointer border-0 bg-transparent p-0 text-xs text-primary underline" onClick={accounts.reopen}>
              {t("danil.account.open_again")}
            </button>
          </p>
        </Show>
        <Show when={message() === LICENSE_REQUIRED}>
          <TerminusLicense onRequest={requestAccessInBrowser} onRetry={() => void signIn()} busy={accounts.busy()} compact />
        </Show>
        <Show when={message() !== LICENSE_REQUIRED && message()}>
          {(code) => (
            <p class="m-0 text-error-strong" role="alert">
              {problemText(code())}
            </p>
          )}
        </Show>
      </div>
    </Show>
  );
}
