import { type Component, For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { cn } from "../../../../apps/desktop/src/lib/utils";
import { TITULO_DE_GRUPO } from "../../../ui/src/ContextMenu";
import { ITEM_DE_MENU } from "../../../ui/src/Popover";
import { type AttentionState, type TaskAttention, topState } from "./attention";
import { matchesName } from "./hidden-workspaces";
import WorkspaceSearch, { SEARCH_FROM } from "./WorkspaceSearch";

type Named = { id: string; name: string };

/** Los de Danil para el «+»: `toAdd` es `null` mientras la fuente no se asienta. */
export type DanilMenu = {
  signedIn: boolean;
  organization: string | null;
  toAdd: readonly Named[] | null;
  others: readonly Named[];
  onList: () => void;
  onAdd: (id: string) => void;
  onSwitch: (id: string) => void;
};

const NOTE = "m-0 px-2 py-1.5 text-caption text-neutral-500";

/** «Agregar workspace» en el «+»: solo con sesión. */
export function DanilAddEntry(props: { danil: DanilMenu; web?: boolean; onStep: () => void }) {
  return (
    <Show when={props.web || props.danil.signedIn}>
      <button
        type="button"
        role="menuitem"
        class={ITEM_DE_MENU}
        data-add-danil-step=""
        onClick={() => {
          props.onStep();
          if (!props.web) props.danil.onList();
        }}
      >
        {t("shell.workspaces.add_danil")}
      </button>
    </Show>
  );
}

/** «Cambiar a…» por cada otra organización: abre el selector de organización existente. */
export function DanilSwitchRows(props: { danil: DanilMenu; onClose: () => void }) {
  return (
    <For each={props.danil.signedIn ? props.danil.others : []}>
      {(o) => (
        <button type="button" role="menuitem" class={ITEM_DE_MENU} data-switch-organization={o.id} onClick={() => (props.onClose(), props.danil.onSwitch(o.id))}>
          {t("shell.workspaces.switch_to", { name: o.name })}
        </button>
      )}
    </For>
  );
}

/** La lista de los de Danil de la organización activa que todavía no están en el riel, con buscador. */
export function DanilStep(props: {
  danil: DanilMenu;
  query: string;
  onQuery: (value: string) => void;
  tasksOf: (id: string) => TaskAttention[];
  badge: Component<{ state: AttentionState; class?: string }>;
  onClose: () => void;
}) {
  const rows = () => (props.danil.toAdd ?? []).filter((w) => matchesName(w.name, props.query));
  return (
    <div data-danil-workspaces="">
      <p class={cn("m-0", TITULO_DE_GRUPO)}>{t("shell.workspaces.add_danil")}</p>
      <Show when={props.danil.organization} fallback={<p class={NOTE}>{t("shell.workspaces.danil_none")}</p>}>
        <Show when={props.danil.toAdd} fallback={<p class={NOTE}>{t("shell.workspaces.danil_loading")}</p>}>
          {(list) => (
            <Show when={list().length > 0} fallback={<p class={NOTE}>{t("shell.workspaces.danil_empty")}</p>}>
              <Show when={list().length >= SEARCH_FROM}>
                <WorkspaceSearch value={props.query} onInput={props.onQuery} />
              </Show>
              <div class="max-h-64 overflow-y-auto p-0.5">
                <For each={rows()}>
                  {(w) => {
                    const state = () => topState(props.tasksOf(w.id));
                    return (
                      <button
                        type="button"
                        role="menuitem"
                        data-add-danil={w.id}
                        class={cn(ITEM_DE_MENU, "flex min-w-0 items-center gap-2")}
                        aria-label={t("shell.workspaces.add_named", { name: w.name })}
                        onClick={() => {
                          props.onClose();
                          props.danil.onAdd(w.id);
                        }}
                      >
                        <span class="min-w-0 flex-1 truncate">{w.name}</span>
                        <Show when={state()}>{(s) => <Dynamic component={props.badge} state={s()} />}</Show>
                        <span class="shrink-0 text-caption text-neutral-500">{t("shell.workspaces.add_row")}</span>
                      </button>
                    );
                  }}
                </For>
              </div>
            </Show>
          )}
        </Show>
      </Show>
    </div>
  );
}
