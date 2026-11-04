/** Chips de la línea 2: metadatos de la tarea, sin vista previa del mensaje. */
import type { CardPull, TaskCard } from "@terminus/tasks";

export type LineChip = "provider" | "folder" | "machine" | "pull";

export function secondLine(card: TaskCard, pull: CardPull | null): LineChip[] {
  const chips: (LineChip | false)[] = [
    "provider",
    !!card.folder && "folder",
    !!card.machine && "machine",
    !!pull && "pull",
  ];
  return chips.filter((c): c is LineChip => !!c);
}
