import { type JSX, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { type Project } from "../../../../ui/src/lib/model";
import { cn } from "../../../../ui/src/lib/utils";
import { ITEM_DE_MENU } from "../../../../ui/src/Popover";
import { Pressable } from "../../../../ui/src/Pressable";

/**
 * Una fila del selector de proyectos. Un oculto deja el sitio de su contador a
 * «Mostrar», que va encima de la fila: un botón no cabe dentro de otro, y así
 * la fila conserva su forma.
 */
export default function PickerRow(props: {
  project: Project;
  /** El ícono y el título del tipo de carpeta; los pone el selector, que ya los conoce. */
  icon: JSX.Element;
  kindLabel: string;
  /** Tareas activas; `null` si no se conoce, y entonces no se pinta número. */
  tasks: number | null;
  hidden: boolean;
  onPick: () => void;
  onShow?: () => void;
}) {
  const p = () => props.project;
  const mostrable = () => props.hidden && !!props.onShow;
  const contador = () => {
    if (props.tasks === null) return "";
    return props.tasks > 0 ? t("projects.picker.tasks", { count: props.tasks }) : t("projects.picker.no_tasks");
  };
  return (
    <div class="relative" data-picker-project={p().id} data-hidden={props.hidden ? "" : undefined}>
      <Pressable class={cn(ITEM_DE_MENU, "grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2")} onClick={() => props.onPick()}>
        {props.icon}
        <span class={cn("truncate", (props.hidden || props.tasks === 0) && "text-neutral-500")} title={props.kindLabel}>
          {p().name}
        </span>
        <span class={cn("text-caption whitespace-nowrap text-neutral-500", mostrable() && "invisible")} aria-hidden={mostrable() ? "true" : undefined}>
          {mostrable() ? t("projects.picker.show") : contador()}
        </span>
      </Pressable>
      <Show when={mostrable()}>
        <Pressable
          class="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm text-caption text-neutral-700 outline-none hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          data-show-project=""
          aria-label={t("projects.picker.show_label", { name: p().name })}
          onClick={() => props.onShow?.()}
        >
          {t("projects.picker.show")}
        </Pressable>
      </Show>
    </div>
  );
}
