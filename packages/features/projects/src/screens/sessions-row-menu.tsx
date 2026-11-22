import ChevronRight from "lucide-solid/icons/chevron-right";
import MoreVertical from "lucide-solid/icons/more-vertical";
import Pin from "lucide-solid/icons/pin";
import PinOff from "lucide-solid/icons/pin-off";
import { For, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { Button } from "../../../../ui/src/Button";
import {
  ITEM_DE_MENU,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../../ui/src/Popover";
import { ETAPAS } from "./TaskStage";
import { taskTree } from "../model/taskTree";
import { familySubtasks } from "@terminus/tasks";
import { Pressable } from "../../../../ui/src/Pressable";
import type { SessionRow, SessionsProps } from "./sessions-model";
import type { SessionsState } from "./sessions-state";

export function createFilaMenu(f: { s: SessionRow }, props: SessionsProps, state: SessionsState) {
  const { menu, setMenu, confirmando, setConfirmando, fijada, setPinned, empezarARenombrar, destinosDe, otherSpaces, projectOf, archiving, intentar, canBringHere, bringHereLabel } = state;
  const Menu = (m: { riel: boolean }) => (
    <Popover
      open={menu() === f.s.id}
      onOpenChange={(abierto) => {
        setMenu(abierto ? f.s.id : null);
        if (!abierto) setConfirmando(null);
      }}
      placement="right-start"
      gutter={6}
    >
      {/* Sin `onClick` propio: ver la cabecera del módulo. */}
      <PopoverTrigger
        as={(p: object) => (
          <Pressable
            {...p}
            class={m.riel
              ? cn(
                  "task-card-mark rounded-[5px] border-0 bg-transparent p-0 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-primary",
                  menu() === f.s.id && "bg-neutral-200 text-neutral-950",
                )
              : "grid place-items-center rounded-sm border-0 bg-transparent px-1 py-0.5 leading-[1.3] text-neutral-500 hover:bg-neutral-200 hover:text-neutral-950"}
            aria-label={t("projects.sessions.actions_named", {
              title: f.s.title,
            })}
            aria-haspopup="menu"
            title={t("projects.sessions.actions")}
          >
            <MoreVertical size={m.riel ? 14 : 15} />
          </Pressable>
        )}
      />
      <PopoverContent
        role={confirmando() === f.s.id ? "alertdialog" : "menu"}
        aria-label={confirmando() === f.s.id ? t("projects.sessions.delete") : undefined}
        class={confirmando() === f.s.id ? "w-72 p-3" : "max-h-72 w-56 overflow-y-auto p-1"}
      >
        <Show when={confirmando() === f.s.id} fallback={<>
            {/* En la tarjeta del riel fijar va primero: el alfiler ya no
                tiene botón propio en la fila. */}
            <Show when={props.onPin}>
              <Pressable
                role="menuitem"
                data-session-pin
                aria-label={fijada(f.s) ? t("projects.sessions.unpin_named", { title: f.s.title }) : t("projects.sessions.pin_named", { title: f.s.title })}
                class={`${ITEM_DE_MENU} flex items-center gap-2 font-semibold`}
                onClick={() => void setPinned(f.s)}
              >
                <Show when={fijada(f.s)} fallback={<Pin size={14} class="shrink-0 text-neutral-500" aria-hidden="true" />}>
                  <PinOff size={14} class="shrink-0 text-neutral-500" aria-hidden="true" />
                </Show>
                {fijada(f.s) ? t("projects.sessions.unpin") : t("projects.sessions.pin")}
              </Pressable>
              <span class="my-1 block h-px bg-border" />
            </Show>
            {/* La etapa no se marca desde la tarjeta del riel, que no la enseña. */}
            <Show when={!m.riel}>
            <Popover placement="right-start" gutter={6}>
              <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                <PopoverTrigger as={(trigger: object) => (
                  <Pressable {...trigger} role="menuitem" aria-haspopup="menu" class={`${ITEM_DE_MENU} flex items-center justify-between gap-2`}>
                    {t("projects.sessions.stage")}<ChevronRight size={14} />
                  </Pressable>
                )} />
              </div>
              <PopoverContent role="menu" class="w-56 p-1">
                <For each={ETAPAS}>
                  {(e) => (
                    <Pressable
                      role="menuitemradio"
                      aria-checked={f.s.stage === e.id}
                      class={cn(
                        ITEM_DE_MENU,
                        "truncate",
                        f.s.stage === e.id && "font-semibold",
                      )}
                      onClick={() => {
                        setMenu(null);
                        props.onEtapa(f.s.id, e.id);
                      }}
                    >
                      {e.rotulo()}
                    </Pressable>
                  )}
                </For>
                <Pressable
                  role="menuitemradio"
                  aria-checked={!f.s.stage}
                  class={cn(
                    ITEM_DE_MENU,
                    "truncate",
                    !f.s.stage && "font-semibold",
                  )}
                  onClick={() => {
                    setMenu(null);
                    props.onEtapa(f.s.id, null);
                  }}
                >
                  {t("projects.stage.none")}
                </Pressable>
              </PopoverContent>
            </Popover>
            <span class="my-1 block h-px bg-border" />
            </Show>

            {/* Renombrar está escrito, y el doble clic es el atajo.
              El gesto de la fila no lo encuentra quien no lo prueba, y
              con el teclado no se da: si la única forma de cambiarle el
              nombre a una tarea fuera un doble clic, para media pantalla
              no existiría. */}
            <Pressable
              role="menuitem"
              class={ITEM_DE_MENU}
              onClick={() => empezarARenombrar(f.s)}
            >
              {t("projects.sessions.rename")}
            </Pressable>
            <span class="my-1 block h-px bg-border" />

            <Show when={!f.s.parent && destinosDe(f.s).length > 0}>
              <Popover placement="right-start" gutter={6}>
                <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                  <PopoverTrigger as={(trigger: object) => (
                    <Pressable {...trigger} role="menuitem" aria-haspopup="menu" class={`${ITEM_DE_MENU} flex items-center justify-between gap-2`}>
                      {t("projects.sessions.move_to")}<ChevronRight size={14} />
                    </Pressable>
                  )} />
                </div>
                <PopoverContent role="menu" class="max-h-72 w-56 overflow-y-auto p-1">
                  <For each={destinosDe(f.s)}>
                    {(d) => (
                      <Pressable
                        role="menuitem"
                        class={`${ITEM_DE_MENU} truncate`}
                        onClick={() => {
                          setMenu(null);
                          props.onMove(f.s.id, d.id);
                        }}
                      >
                        {d.name}
                      </Pressable>
                    )}
                  </For>
                </PopoverContent>
              </Popover>
              <span class="my-1 block h-px bg-border" />
            </Show>

            <Show when={!f.s.parent && !f.s.archived && otherSpaces(f.s).length > 0}>
              <Popover placement="right-start" gutter={6}>
                <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                  <PopoverTrigger as={(trigger: object) => (
                    <Pressable {...trigger} role="menuitem" aria-haspopup="menu" data-move-space={f.s.id} class={`${ITEM_DE_MENU} flex items-center justify-between gap-2`}>
                      {t("spaces.move.to")}<ChevronRight size={14} />
                    </Pressable>
                  )} />
                </div>
                <PopoverContent role="menu" aria-label={t("spaces.move.to")} class="max-h-72 w-60 overflow-y-auto p-1">
                  <For each={otherSpaces(f.s)}>
                    {(d) => (
                      <Pressable
                        role="menuitem"
                        class={`${ITEM_DE_MENU} truncate`}
                        onClick={() => {
                          setMenu(null);
                          props.onMoveToSpace?.(f.s.id, d.id);
                        }}
                      >
                        {d.name}
                      </Pressable>
                    )}
                  </For>
                  <Show when={props.carpetaDe?.(f.s) ?? props.carpeta}>
                    {(c) => <p class="m-0 px-2 pt-1 pb-1.5 text-caption text-neutral-500">{t("spaces.move.folder_stays", { folder: c() })}</p>}
                  </Show>
                </PopoverContent>
              </Popover>
            </Show>

            <Show when={!f.s.parent && projectOf(f.s) !== ""}>
              <Pressable
                role="menuitem"
                class={ITEM_DE_MENU}
                onClick={() => {
                  setMenu(null);
                  props.onMove(f.s.id, "");
                }}
              >
                {t("projects.sessions.remove_from_project")}
              </Pressable>
            </Show>

            <Show when={props.onBringHere && f.s.machine && canBringHere()}>
              <Pressable
                role="menuitem"
                class={ITEM_DE_MENU}
                data-bring-here-menu
                onClick={() => {
                  setMenu(null);
                  props.onBringHere?.(f.s.id);
                }}
              >
                {bringHereLabel()}
              </Pressable>
            </Show>

            <Show when={!f.s.archived && !fijada(f.s)}>
              <Pressable
                role="menuitem"
                class={ITEM_DE_MENU}
                disabled={archiving().includes(f.s.id)}
                onClick={() => void intentar(f.s.id, false)}
              >
                {t("projects.sessions.archive")}
              </Pressable>
            </Show>
            <Show when={m.riel}><span class="my-1 block h-px bg-border" /></Show>
            <Pressable
              role="menuitem"
              class={`${ITEM_DE_MENU} text-error-strong`}
              onClick={() => {
                setConfirmando(f.s.id);
              }}
            >
              {t("projects.sessions.delete")}
            </Pressable>
        </>}>
          <div
            data-session-confirm
            class="min-w-0"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setConfirmando(null); setMenu(null); }
            }}
          >
            <p class="m-0 mb-1.5 text-xs leading-[1.4] text-neutral-500">
              <Show when={familySubtasks(taskTree(props.relatedSessions ?? props.sessions, false), f.s, fijada)} fallback={t("projects.sessions.delete_confirm")}>{count => t("projects.sessions.delete_confirm_family", { count: count() })}</Show>
            </p>
            <div class="flex gap-1.5">
              <Button
                variant="danger"
                size="compact"
                ref={(el: HTMLElement) =>
                  queueMicrotask(() => el.focus({ preventScroll: true }))
                }
                onClick={() => {
                  setConfirmando(null);
                  setMenu(null);
                  props.onDelete(f.s.id, 1 + familySubtasks(taskTree(props.relatedSessions ?? props.sessions, false), f.s, fijada));
                }}
              >
                {t("projects.sessions.delete")}
              </Button>
              <Button
                variant="outline"
                size="compact"
                onClick={() => { setConfirmando(null); setMenu(null); }}
              >
                {t("projects.sessions.keep")}
              </Button>
            </div>
          </div>
        </Show>
      </PopoverContent>
    </Popover>
  );
  return Menu;
}
