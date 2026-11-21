/**
 * La cuenta de Danil del workspace, dentro de su tarjeta en Workspaces o en Cuenta de
 * Danil: con qué cuenta está, iniciar sesión y desvincularla (se confirma). Chunk aparte.
 */
import "../../../../../apps/desktop/src/locales/danilPhrases";
import { createEffect, createSignal, on, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Button } from "../../../../ui/src/Button";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { isDanilWorkspace } from "../../../machines/src";
import { MoveWorkspaceDialog, sessionRailState } from "../../../../shell/src/shell";
import { createDanilAccounts, type DanilAccounts } from "../queries/danil-accounts";
import { said } from "./danil-session";
import { connectedSessions, syncLine } from "../queries/danil-sessions";
import { LICENSE_REQUIRED, requestAccessInBrowser, TerminusLicense } from "../screens/TerminusLicense";

/** `placement`: `card` en Workspaces; `section` dentro de Cuenta de Danil. Un local nunca ofrece iniciar sesión. */
export default function WorkspaceAccount(props: { workspace: string; name: string; placement?: "card" | "section"; onChanged?: (problem: string | null) => void; state?: DanilAccounts }) {
  const accounts = props.state ?? createDanilAccounts({ workspace: () => props.workspace });

  const [problem, setProblem] = createSignal<string | null>(null);
  const [moving, setMoving] = createSignal(false);

  createEffect(on(() => props.workspace, () => reset(), { defer: true }));

  function reset() {
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

  return (
    <Show when={accounts.sessions() && accounts.of()}>
      <div class={cn("grid gap-1 text-xs", props.placement !== "section" && "pl-[27px]")} data-workspace-account={line().kind}>
        <Show when={props.placement !== "section"}>
          <span class="text-neutral-500">{t("danil.workspace.title")}</span>
        </Show>
        <p class="m-0 text-neutral-500" data-workspace-sync="">
          {lineText()}
        </p>
        <Show when={hasAccount() && sessionRailState()}>
          <div>
            <Button size="sm" variant="ghost" data-workspace-move="" onClick={() => setMoving(true)}>
              {t("shell.workspaces.move.entry")}
            </Button>
          </div>
        </Show>
        <Show when={moving() && sessionRailState()}>{(rail) => (
          <MoveWorkspaceDialog sessions={rail()} workspace={{ id: props.workspace, name: props.name }} onClose={() => { setMoving(false); props.onChanged?.(null); }} />
        )}</Show>
        {/* El vínculo de cuenta lo retiró el motor (E1): sin cuenta, solo un workspace de Danil ofrece iniciar sesión. */}
        <Show when={!hasAccount() && !signedIn().length && isDanilWorkspace(props.workspace)}>
          <div class="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={accounts.busy() || adding()} onClick={() => void signIn()}>
              {t("danil.account.sign_in")}
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
