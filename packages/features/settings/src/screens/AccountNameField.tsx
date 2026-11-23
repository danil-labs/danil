import { Show, createSignal } from "solid-js";
import { Input } from "../../../../ui/src/Input";
import { enfocarYSeleccionar } from "../../../../../apps/desktop/src/lib/focus";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { t } from "../../../../../apps/desktop/src/lib/i18n";

const ACCOUNT_LABEL_MAX_LENGTH = 80;

export function AccountNameField(props: {
  name: string;
  active: boolean;
  row: boolean;
  onRename?: (label: string) => void | Promise<unknown>;
}) {
  const [renaming, setRenaming] = createSignal(false);
  const [draft, setDraft] = createSignal("");

  function startRename() {
    if (!props.onRename) return;
    setDraft(props.name);
    setRenaming(true);
  }

  return (
    <Show
      when={renaming()}
      fallback={
        <span
          class={cn(
            "min-w-0 truncate",
            props.onRename && "cursor-text",
            props.row
              ? "text-sm font-semibold"
              : ["text-xs", props.active ? "font-semibold" : "font-medium"],
          )}
          title={
            props.onRename
              ? t("settings.account_card.rename_hint", { name: props.name })
              : props.name
          }
          onDblClick={startRename}
        >
          {props.name}
        </span>
      }
    >
      <form
        class="min-w-0 flex-1 rounded-sm bg-neutral-200 px-1.5"
        data-owns-escape
        onSubmit={(e) => {
          e.preventDefault();
          const next = draft().trim();
          setRenaming(false);
          if (next && next !== props.name) {
            void props.onRename?.(next);
          }
        }}
      >
        <Input
          ref={enfocarYSeleccionar}
          variant="ghost"
          data-owns-escape
          class={cn(
            "block h-auto min-h-0 rounded-none border-0 p-0 font-sans leading-[1.25] text-inherit [font-weight:inherit]",
            props.row
              ? "text-sm font-semibold"
              : ["text-xs", props.active ? "font-semibold" : "font-medium"],
          )}
          maxlength={ACCOUNT_LABEL_MAX_LENGTH}
          value={draft()}
          aria-label={t("settings.account_card.rename_label", { name: props.name })}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onBlur={() => setRenaming(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setRenaming(false);
            }
          }}
        />
      </form>
    </Show>
  );
}
