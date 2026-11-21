import { Show } from "solid-js";
import { tipoDeCarpeta } from "../../../../apps/desktop/src/lib/folderKinds";
import { cn } from "../../../../apps/desktop/src/lib/utils";
import WorkdirIcon from "../../code/src/WorkdirIcon";

/** El icono de una carpeta: dice si es repositorio, nube o documentos. */
export function FolderSquare(props: { id: string; size?: number; class?: string }) {
  const tipo = () => tipoDeCarpeta(props.id);
  return (
    <span aria-hidden="true" data-folder-square={props.id} class={cn("inline-flex shrink-0 text-neutral-500", props.class)}>
      <WorkdirIcon kind={tipo()?.kind ?? "folder"} cloud={tipo()?.cloud} size={props.size ?? 13} />
    </span>
  );
}

/**
 * Icono y nombre de la carpeta; sin nombre, el icono lleva el nombre en el `title`.
 * `untitled`: la fila ya saca su tarjeta flotante, y un `title` nativo saldría encima de ella.
 */
export default function FolderChip(props: { id: string; name: string; bare?: boolean; untitled?: boolean; class?: string }) {
  return (
    <span
      data-folder-chip={props.id}
      class={cn("inline-flex min-w-0 items-center gap-1 text-caption text-neutral-700", props.class)}
      title={props.untitled ? undefined : props.name}
    >
      <FolderSquare id={props.id} size={12} />
      <Show when={!props.bare}>
        <span class="min-w-0 truncate">{props.name}</span>
      </Show>
    </span>
  );
}
