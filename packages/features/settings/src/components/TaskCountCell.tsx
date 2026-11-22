import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { TableCell } from "../../../../ui/src/Table";

/**
 * La columna «Tareas» de Ajustes → Proyectos: las tareas activas, sin las
 * archivadas. `null` es que no se conoce (no hay lista leída de esa máquina):
 * la celda queda vacía en vez de dar un número falso.
 */
export function TaskCountCell(props: { count: number | null }) {
  return (
    <TableCell class={cn("text-xs tabular-nums", (props.count ?? 0) > 0 ? "text-neutral-700" : "text-neutral-500")} data-active-tasks={props.count ?? ""}>
      {props.count === null ? "" : props.count > 0 ? t("settings.projects.tasks", { count: props.count }) : t("settings.projects.no_tasks")}
    </TableCell>
  );
}
