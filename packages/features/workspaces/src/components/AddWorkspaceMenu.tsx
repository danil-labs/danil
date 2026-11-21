import { createSignal } from "solid-js";
import { cn, ITEM_DE_MENU, Popover, PopoverContent, PopoverTrigger } from "@danil/ui";
import { t } from "./i18n.ts";

function menuArrows(event: KeyboardEvent) {
  if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
  event.preventDefault();
  const items = [
    ...((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not([disabled])',
    ) ?? []),
  ];
  const at = items.indexOf(document.activeElement as HTMLButtonElement);
  items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
}

function PlusIcon(props: { size?: number }) {
  return (
    <svg
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

export interface AddWorkspaceMenuProps {
  onAddAccountOrOrg?: () => void;
  class?: string;
}

/**
 * El «+» del riel: menú para agregar cuenta u organización (portado de apps/desktop).
 * Las acciones las provee la pantalla contenedora.
 */
export function AddWorkspaceMenu(props: AddWorkspaceMenuProps) {
  const [open, setOpen] = createSignal(false);
  const close = () => setOpen(false);

  const label = () => t("shell.workspaces.add");

  return (
    <Popover
      open={open()}
      onOpenChange={(value) => (value ? setOpen(true) : close())}
      placement="right-start"
      gutter={4}
    >
      <PopoverTrigger
        type="button"
        data-add-workspace=""
        class={cn(
          "relative mt-1 grid size-8 shrink-0 place-items-center rounded-md border border-dashed border-neutral-500 text-neutral-500 outline-none hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          props.class,
        )}
        aria-label={label()}
        title={label()}
      >
        <PlusIcon size={16} />
      </PopoverTrigger>
      <PopoverContent role="menu" class="w-64 p-1" onKeyDown={menuArrows}>
        <button
          type="button"
          role="menuitem"
          class={ITEM_DE_MENU}
          onClick={() => {
            close();
            props.onAddAccountOrOrg?.();
          }}
        >
          {t("shell.workspaces.add_session")}
        </button>
      </PopoverContent>
    </Popover>
  );
}

export default AddWorkspaceMenu;
