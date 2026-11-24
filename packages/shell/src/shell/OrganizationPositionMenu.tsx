import { t } from "../../../../apps/desktop/src/lib/i18n";
import { cn } from "../../../ui/src/lib/utils";
import { ITEM_DE_MENU } from "../../../ui/src/Popover";
import { Pressable } from "../../../ui/src/Pressable";

export function OrganizationPositionMenu(props: { pinned: boolean; index: number; count: number; onPin: () => void; onMove: (step: -1 | 1) => void }) {
  return <>
    <Pressable role="menuitem" class={ITEM_DE_MENU} onClick={() => props.onPin()}>{t(props.pinned ? "shell.rail.unpin" : "shell.rail.pin")}</Pressable>
    <Pressable role="menuitem" class={cn(ITEM_DE_MENU, "flex items-center justify-between gap-2")} disabled={props.index === 0} onClick={() => props.onMove(-1)}><span>{t("shell.rail.move_org_up")}</span><span class="text-caption text-neutral-500">⌥↑</span></Pressable>
    <Pressable role="menuitem" class={cn(ITEM_DE_MENU, "flex items-center justify-between gap-2")} disabled={props.index === props.count - 1} onClick={() => props.onMove(1)}><span>{t("shell.rail.move_org_down")}</span><span class="text-caption text-neutral-500">⌥↓</span></Pressable>
  </>;
}
