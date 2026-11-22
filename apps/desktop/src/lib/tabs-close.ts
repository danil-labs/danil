import { isTaskTab, type Tab } from "./tabs-types.ts";

export type BatchCloseAction = "esta" | "demas" | "derecha" | "todas";

export function tabsToClose(
  strip: readonly Tab[],
  id: string,
  action: BatchCloseAction,
): string[] {
  const i = strip.findIndex((p) => p.id === id);
  if (i < 0) return [];
  if (action === "esta") return [id];
  if (action === "todas") return strip.map((p) => p.id);
  const selected = strip[i];
  const isPreserved = (p: Tab) =>
    p.id === id ||
    (isTaskTab(selected)
      ? p.session === selected.session
      : selected.session !== "" && isTaskTab(p) && p.session === selected.session);
  let from = 0;
  if (action === "derecha") {
    from = i + 1;
    if (isTaskTab(selected)) {
      strip.forEach((p, n) => {
        if (p.session === selected.session) from = Math.max(from, n + 1);
      });
    }
  }
  return strip
    .slice(from)
    .filter((p) => !isPreserved(p))
    .map((p) => p.id);
}

// La confirmación de borradores y el cierre deben incluir el mismo bloque de pestañas.
export function belongsToBlock(list: readonly Tab[], ids: readonly string[]): (p: Tab) => boolean {
  const requested = new Set(ids);
  const tasks = new Set(
    list.filter((p) => requested.has(p.id) && isTaskTab(p)).map((p) => p.session),
  );
  return (p) => requested.has(p.id) || tasks.has(p.session);
}
