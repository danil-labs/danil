import { type Accessor, createMemo, createSignal, onCleanup, Show } from "solid-js";
import { KeyedList, Popover, PopoverAnchor, PopoverContent } from "@danil/ui";
import { t } from "./i18n.ts";
import { OrganizationAccountMenu } from "./OrganizationAccountMenu.tsx";
import { OrganizationPositionMenu } from "./OrganizationPositionMenu.tsx";
import { OrganizationStack } from "./OrganizationStack.tsx";
import { OrganizationWorkspaceTile } from "./OrganizationWorkspaceTile.tsx";
import type { AttentionState, OrgTile, RailOrganization } from "./organization-rail-model.ts";
import { AttentionBadge } from "./WorkspaceMarks.tsx";

export const ATTENTION_STATES = ["approving", "asked", "failed", "unseen"] as const;
export type TaskAttention = { session: string; project: string; state: AttentionState };

export function topState(tasks: TaskAttention[]): AttentionState | null {
  return ATTENTION_STATES.find((state) => tasks.some((task) => task.state === state)) ?? null;
}

function createEscapeCloser(isOpen: () => boolean, close: () => void) {
  const handler = (e: KeyboardEvent) => {
    if (e.key === "Escape" && isOpen()) {
      close();
    }
  };
  window.addEventListener("keydown", handler);
  onCleanup(() => window.removeEventListener("keydown", handler));
}

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

export type OrganizationRailActions = {
  sessions?: {
    sendOptional?: any;
    families?: () => any;
    close?: (opts: { context: string }) => Promise<void>;
    closeEmail?: (email: string | null, family?: string) => Promise<void>;
  };
  remove?: (contextId: string, id: string) => Promise<void> | void;
};

export function OrganizationRailGroup(props: {
  org: RailOrganization;
  web?: boolean;
  stacked: boolean;
  sessions?: OrganizationRailActions;
  active: { workspace: string; context: string } | null;
  tasksOf?: (id: string, context: string) => TaskAttention[];
  staleOf?: (id: string, context: string) => boolean;
  stateLabel?: (state: ReturnType<typeof topState>) => string;
  onOpen: (tile: OrgTile) => void;
  onManage?: () => void;
  onChange: (action: "pin" | "up" | "down") => void;
  index: number;
  count: number;
  credits?: any;
}) {
  const [menu, setMenu] = createSignal<{ key: string; stack: boolean; target: HTMLElement; rect: DOMRect } | null>(null);
  let returnFocus: HTMLElement | undefined;

  const tile = () => props.org.tiles.find((row) => row.key === menu()?.key);
  const accountRows = createMemo(() =>
    menu()?.stack
      ? props.org.contexts.map((context) => ({
          ...(props.org.tiles.find((row) => row.context.context_id === context.context_id) ?? props.org.tiles[0]),
          context,
        }))
      : tile()
        ? [tile()!]
        : [],
  );

  const active = (row: OrgTile) =>
    props.active?.workspace === row.id && props.active.context === row.context.context_id;

  const dismiss = () => {
    setMenu(null);
  };

  const show = (row: OrgTile, target: HTMLElement, stack = false) => {
    returnFocus = target;
    setMenu({ key: row.key, stack, target, rect: target.getBoundingClientRect() });
  };

  const stale = () => props.org.tiles.some((row) => props.staleOf?.(row.id, row.context.context_id));
  const tasksOf = (id: string, context: string) => props.tasksOf?.(id, context) ?? [];
  const state = () => topState(props.org.tiles.flatMap((row) => tasksOf(row.id, row.context.context_id)));
  const stateLabel = (s: ReturnType<typeof topState>) => (props.stateLabel ? props.stateLabel(s) : (s ?? ""));

  createEscapeCloser(() => menu() !== null, () => dismiss());

  const render = (row: Accessor<OrgTile>) => (
    <OrganizationWorkspaceTile
      stale={props.staleOf?.(row().id, row().context.context_id)}
      tile={row()}
      active={active(row())}
      state={topState(tasksOf(row().id, row().context.context_id))}
      stateLabel={stateLabel(topState(tasksOf(row().id, row().context.context_id)))}
      credits={props.credits}
      send={props.sessions?.sessions?.sendOptional}
      onOpen={() => props.onOpen(row())}
      onMenu={(target) => show(row(), target)}
      onMove={(step) => props.onChange(step === -1 ? "up" : "down")}
    />
  );

  return (
    <>
      <Show when={props.stacked} fallback={<KeyedList each={props.org.tiles} by={(row) => row.key}>{render}</KeyedList>}>
        <OrganizationStack
          organization={props.org}
          stale={stale()}
          state={state()}
          stateLabel={stale() ? t("shell.rail.attention_stale") : stateLabel(state())}
          badge={AttentionBadge}
          render={render}
          onPin={() => props.onChange("pin")}
          onMove={(step) => props.onChange(step === -1 ? "up" : "down")}
          onContextMenu={(event) => {
            event.preventDefault();
            const first = props.org.tiles[0];
            if (first) show(first, event.currentTarget as HTMLElement, true);
          }}
        />
      </Show>
      <Popover open={!!menu() && !!tile()} onOpenChange={(open) => { if (!open) dismiss(); }} placement="right-start" gutter={4}>
        <PopoverAnchor
          style={{
            position: "fixed",
            left: `${menu()?.rect.left ?? 0}px`,
            top: `${menu()?.rect.top ?? 0}px`,
            width: `${menu()?.rect.width ?? 0}px`,
            height: `${menu()?.rect.height ?? 0}px`,
            "pointer-events": "none",
          }}
        />
        <PopoverContent
          role="menu"
          class="w-56 p-1"
          onKeyDown={menuArrows}
          onCloseAutoFocus={(event: Event) => {
            event.preventDefault();
            const target = returnFocus?.isConnected
              ? returnFocus
              : [...document.querySelectorAll<HTMLButtonElement>("[data-workspace-context]")].find((button) =>
                  props.org.tiles.some(
                    (row) =>
                      row.context.context_id === button.dataset.workspaceContext &&
                      row.id === button.dataset.workspaceTile,
                  ),
                ) ?? document.querySelector<HTMLButtonElement>("[data-add-workspace]");
            target?.focus();
          }}
        >
          <Show when={menu()?.stack && accountRows().length > 1}>
            <OrganizationPositionMenu
              pinned={props.org.pinned}
              index={props.index}
              count={props.count}
              onPin={() => {
                props.onChange("pin");
                dismiss();
              }}
              onMove={(step) => props.onChange(step === -1 ? "up" : "down")}
            />
          </Show>
          <KeyedList each={accountRows()} by={(row) => row.context.context_id}>
            {(row) => (
              <OrganizationAccountMenu
                web={props.web}
                stack={menu()?.stack}
                organizationControls={!menu()?.stack || accountRows().length === 1}
                group={{
                  context: row().context.context_id,
                  org: props.org.id,
                  name: props.org.name,
                  plan: row().context.plan,
                  role: row().context.role,
                }}
                notice={
                  <Show when={row().context.empty_reason}>
                    {(reason) => <p role="status" class="m-0 px-2 py-1 text-caption text-neutral-500">{reason()}</p>}
                  </Show>
                }
                email={row().context.email ?? null}
                workspace={row().name}
                canHide={!active(row())}
                pinned={props.org.pinned}
                index={props.index}
                count={props.count}
                send={props.sessions?.sessions?.sendOptional}
                onOpen={() => {
                  props.onOpen(row());
                  dismiss();
                }}
                onManage={() => {
                  dismiss();
                  props.onManage?.();
                }}
                onHide={() => {
                  void props.sessions?.remove?.(row().context.context_id, row().id);
                  dismiss();
                }}
                onPin={() => {
                  props.onChange("pin");
                  dismiss();
                }}
                onMove={(step) => props.onChange(step === -1 ? "up" : "down")}
                onCloseOrg={
                  props.sessions?.sessions?.close
                    ? (context) => props.sessions!.sessions!.close!({ context })
                    : undefined
                }
                onCloseEmail={
                  props.sessions?.sessions?.closeEmail
                    ? (email, _context) => props.sessions!.sessions!.closeEmail!(email, row().context.family)
                    : undefined
                }
                onDismiss={dismiss}
              />
            )}
          </KeyedList>
        </PopoverContent>
      </Popover>
    </>
  );
}
