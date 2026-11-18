import UserRound from "lucide-solid/icons/user-round";
import { type JSX, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";

/** El pie representa las preferencias del equipo, independientemente de la cuenta abierta. */
export default function DanilFooterEntry(props: { collapsed: boolean; onOpen: () => void; fallback?: JSX.Element }) {
  return <button type="button" data-danil-foot="preferences" aria-label={t("shell.profile.preferences")} title={t("shell.profile.preferences")} onClick={() => props.onOpen()} class={cn("flex h-7 min-w-0 items-center gap-2 rounded-md text-xs text-neutral-700 hover:bg-neutral-100", props.collapsed ? "w-7 justify-center" : "flex-1 px-1.5")}>
    <UserRound size={17} aria-hidden="true" />
    <Show when={!props.collapsed}><span class="min-w-0 truncate">{t("shell.profile.preferences")}</span></Show>
  </button>;
}
