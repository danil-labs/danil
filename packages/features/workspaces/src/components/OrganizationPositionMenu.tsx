import { cn, ITEM_DE_MENU } from "@danil/ui";
import { t } from "./i18n.ts";

export function OrganizationPositionMenu(props: {
  pinned: boolean;
  index: number;
  count: number;
  onPin: () => void;
  onMove: (step: -1 | 1) => void;
}) {
  return (
    <>
      <button type="button" role="menuitem" class={ITEM_DE_MENU} onClick={() => props.onPin()}>
        {t(props.pinned ? "shell.rail.unpin" : "shell.rail.pin")}
      </button>
      <button
        type="button"
        role="menuitem"
        class={cn(ITEM_DE_MENU, "flex items-center justify-between gap-2")}
        disabled={props.index === 0}
        onClick={() => props.onMove(-1)}
      >
        <span>{t("shell.rail.move_org_up")}</span>
        <span class="text-caption text-neutral-500">⌥↑</span>
      </button>
      <button
        type="button"
        role="menuitem"
        class={cn(ITEM_DE_MENU, "flex items-center justify-between gap-2")}
        disabled={props.index === props.count - 1}
        onClick={() => props.onMove(1)}
      >
        <span>{t("shell.rail.move_org_down")}</span>
        <span class="text-caption text-neutral-500">⌥↓</span>
      </button>
    </>
  );
}
