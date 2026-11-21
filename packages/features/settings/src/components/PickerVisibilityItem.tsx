import { Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { ITEM_DE_MENU } from "../../../../ui/src/Popover";

/**
 * «Ocultar del selector» / «Mostrar en el selector», junto a «Quitar proyecto».
 * Solo cambia el selector de la tarea nueva: el proyecto sigue en el riel y
 * aquí, y ninguna tarea cambia.
 */
export function PickerVisibilityItem(props: { id: string; hidden: boolean; onSet?: (id: string, hide: boolean) => void; onDone: () => void }) {
  const oculto = () => props.hidden;
  return (
    <Show when={props.onSet}>
      {(apartar) => (
        <button
          role="menuitem"
          class={ITEM_DE_MENU}
          data-picker-visibility={oculto() ? "hidden" : "shown"}
          onClick={() => {
            const ocultar = !oculto();
            props.onDone();
            apartar()(props.id, ocultar);
          }}
        >
          {oculto() ? t("settings.projects.show_in_picker") : t("settings.projects.hide_in_picker")}
        </button>
      )}
    </Show>
  );
}
