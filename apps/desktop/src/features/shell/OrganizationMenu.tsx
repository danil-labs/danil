import Check from "lucide-solid/icons/check";
import { createSignal, For, onCleanup, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { ITEM_DE_MENU } from "../../ui/Popover";
import type { OrganizationSelection, OrganizationState } from "./organization-selection";

/** Lo mismo que un `createSignal` sobre el store, sin que el store dependa de Solid. */
export function useOrganizations(selection: OrganizationSelection) {
  const [state, setState] = createSignal<OrganizationState>(selection.state());
  const [needed, setNeeded] = createSignal(selection.needed());
  onCleanup(selection.subscribe(() => {
    setState(selection.state());
    setNeeded(selection.needed());
  }));
  return { state, needed };
}

/**
 * La sección «Organización» del menú de la cuenta, encima de los workspaces. Con una sola,
 * su nombre; con varias, la lista con la activa marcada. Oculta si el servidor aún no la tiene.
 */
export default function OrganizationMenu(props: { selection: OrganizationSelection; onClose: () => void }) {
  const { state } = useOrganizations(props.selection);
  const ready = () => {
    const s = state();
    return s.kind === "ready" && s.items.length > 0 ? s : null;
  };
  return (
    <Show when={ready()}>
      {(s) => (
        <div data-organization-menu="">
          <p class="m-0 px-2 pt-1 pb-1 text-caption font-medium text-neutral-500">{t("shell.organization.title")}</p>
          <Show
            when={s().items.length > 1}
            fallback={<p class="m-0 truncate px-2 pb-1 text-ui" title={s().items[0].name}>{s().items[0].name}</p>}
          >
            <For each={s().items}>
              {(org) => (
                <button
                  type="button"
                  class={cn(ITEM_DE_MENU, "flex items-center gap-2")}
                  aria-pressed={s().active === org.id}
                  disabled={s().busy}
                  data-organization={org.id}
                  title={org.name}
                  onClick={() => {
                    if (s().active === org.id) return props.onClose();
                    void props.selection.choose(org.id).then(() => {
                      const after = props.selection.state();
                      if (after.kind === "ready" && after.active === org.id) props.onClose();
                    });
                  }}
                >
                  <span class="min-w-0 flex-1 truncate">{org.name}</span>
                  <Show when={s().active === org.id}>
                    <Check size={14} aria-hidden="true" class="shrink-0 text-neutral-500" />
                  </Show>
                </button>
              )}
            </For>
          </Show>
          <Show when={s().error}>
            <p class="m-0 px-2 pt-1 text-caption text-error-strong" role="alert">{t("shell.organization.error")}</p>
          </Show>
          <div class="my-1 h-px bg-border" />
        </div>
      )}
    </Show>
  );
}
