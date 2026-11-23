import Check from "lucide-solid/icons/check";
import GripVertical from "lucide-solid/icons/grip-vertical";
import { For, Show } from "solid-js";
import { createNavigationReorder } from "../../../../apps/desktop/src/lib/navigation-order";
import { type Space, spaceName } from "../../../../apps/desktop/src/lib/spaces";
import { cn } from "../../../../apps/desktop/src/lib/utils";
import { ITEM_DE_MENU } from "../../../ui/src/Popover";
import { Pressable } from "../../../ui/src/Pressable";
import type { AttentionState } from "./attention";
import { AttentionBadge } from "./WorkspaceColumn";

export function SpaceMenuList(props: {
  workspaceKey: string;
  spaces: Space[];
  activa: string | null;
  senal: (id: string) => AttentionState | null;
  reordering?: boolean;
  onReorder?: (ids: string[]) => void;
  onSelect: (id: string) => void;
}) {
  let list: HTMLDivElement | undefined;
  const canReorder = () => !!props.onReorder && props.spaces.length > 1;
  const reorder = createNavigationReorder({
    scope: () => props.workspaceKey,
    list: () => list,
    attribute: "data-space",
    axis: "y",
    ids: () => props.reordering || !props.onReorder ? [] : props.spaces.map((s) => s.id),
    save: (ids) => props.onReorder?.(ids),
  });
  const moveBy = (id: string, delta: number) => {
    if (!canReorder() || props.reordering) return;
    const ids = props.spaces.map((s) => s.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    ids.splice(from, 1);
    ids.splice(to, 0, id);
    props.onReorder?.(ids);
  };

  return (
    <div ref={list} class="flex flex-col">
      <For each={props.spaces}>
        {(space) => {
          const elegida = () => space.id === props.activa;
          const senal = () => (elegida() ? null : props.senal(space.id));
          return (
            <Pressable
              class={cn(
                ITEM_DE_MENU,
                "group relative flex items-center gap-2",
                canReorder() && "touch-none",
                reorder.source() === space.id && "cursor-grabbing opacity-40",
              )}
              data-space={space.id}
              aria-current={elegida() ? "true" : undefined}
              onPointerDown={(e) => { if (canReorder()) reorder.start(space.id, e); }}
              onKeyDown={(e) => {
                if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                  e.preventDefault();
                  moveBy(space.id, e.key === "ArrowUp" ? -1 : 1);
                }
              }}
              onClick={() => props.onSelect(space.id)}
            >
              <Show when={reorder.edge(space.id)}>
                {(edge) => (
                  <span
                    aria-hidden="true"
                    class={cn(
                      "pointer-events-none absolute right-1 left-1 h-0.5 bg-primary",
                      edge() === "before" ? "-top-0.5" : "-bottom-0.5",
                    )}
                  />
                )}
              </Show>
              <span class="grid w-3.5 shrink-0 text-neutral-950">
                <Show when={elegida()}><Check size={14} aria-hidden="true" /></Show>
              </span>
              <span class="min-w-0 flex-1 truncate">{spaceName(space)}</span>
              <Show when={senal()}>{(s) => <AttentionBadge state={s()} />}</Show>
              <Show when={canReorder()}>
                <GripVertical size={12} aria-hidden="true" class="shrink-0 text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100" />
              </Show>
            </Pressable>
          );
        }}
      </For>
    </div>
  );
}
