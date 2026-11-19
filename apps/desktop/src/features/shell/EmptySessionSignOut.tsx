import LogOut from "lucide-solid/icons/log-out";
import { createSignal, For, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { ITEM_DE_MENU } from "../../ui/Popover";
import { emptySessionEmails } from "./empty-session-emails";
import { confirmEmailClose, emailContextCount } from "./session-close-confirm";
import { sessionRailState } from "./session-groups";

/** Un correo sin ningún workspace no tiene cuadro en el riel: su «Cerrar sesión» queda en el pie. */
export function EmptySessionSignOut(props: { onDone: () => void }) {
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const rows = () => emptySessionEmails(sessionRailState()?.groups() ?? null);
  const close = async (row: { email: string | null; family: string }) => {
    const rail = sessionRailState();
    if (!rail || busy()) return;
    if (!confirmEmailClose(emailContextCount(rail.sessions.families(), row.email, row.family), (count) => t("shell.workspaces.close_email_confirm", { count, email: row.email ?? "" }), window.confirm.bind(window))) return;
    setBusy(true); setFailed(false);
    try { await rail.sessions.closeEmail(row.email, row.family); props.onDone(); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  };
  return <Show when={rows().length}>
    <div class="my-1 h-px bg-border" />
    <For each={rows()}>{(row) => <button type="button" class={cn(ITEM_DE_MENU, "flex items-center gap-2")} data-empty-session-sign-out={row.family} disabled={busy()} onClick={() => void close(row)}>
      <LogOut size={14} aria-hidden="true" class="shrink-0 text-neutral-500" />
      <span class="min-w-0 flex-1 truncate">{t("shell.workspaces.close_email", { email: row.email ?? "" })}</span>
    </button>}</For>
    <Show when={failed()}><p role="alert" class="m-0 px-2 py-1 text-caption text-error-strong">{t("shell.workspaces.sessions_failed")}</p></Show>
  </Show>;
}
