import UserRound from "lucide-solid/icons/user-round";
import { type JSX } from "solid-js";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { Pressable } from "../../../ui/src/Pressable";

/** El pie representa las preferencias del equipo, independientemente de la cuenta abierta. */
export default function DanilFooterEntry(props: { collapsed: boolean; onOpen: () => void; fallback?: JSX.Element }) {
  return <Pressable data-danil-foot="preferences" aria-label={t("shell.profile.preferences")} title={t("shell.profile.preferences")} onClick={() => props.onOpen()} class="grid size-8 place-items-center rounded-md text-neutral-500 outline-none hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary">
    <UserRound size={17} aria-hidden="true" />
  </Pressable>;
}
