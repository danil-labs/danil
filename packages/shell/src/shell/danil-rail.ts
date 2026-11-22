import { createEffect } from "solid-js";
import type { DanilMenu } from "./DanilAddMenu";
import { railHidden, railVisible } from "./hidden-workspaces.ts";
import { type DanilRail, danilRail, setRailShown } from "./workspace-added-wiring.ts";

export type DanilView = { available: readonly { id: string; name: string }[] | null; added: ReadonlySet<string> | null };

/**
 * El riel con los de Danil: los locales menos los ocultos, los de Danil solo si la persona los
 * agregó (también los que el riel aún no conocía) y el abierto. Sin la fuente asentada o sin
 * saber los agregados, el riel se queda como estaba: no se vacía.
 */
export function railWithDanil<T extends { id: string }>(list: readonly T[], hidden: ReadonlySet<string>, open: string | null, danil: DanilView, make: (w: { id: string; name: string }) => T): T[] {
  const { available, added } = danil;
  if (!available || !added) return railVisible(list, hidden, open);
  const ids = new Set(available.map((w) => w.id));
  const shown = list.filter((w) => w.id === open || (ids.has(w.id) ? added.has(w.id) : !hidden.has(w.id)));
  const known = new Set(list.map((w) => w.id));
  return [...shown, ...available.filter((w) => added.has(w.id) && !known.has(w.id)).map(make)];
}

/** Los de Danil de la organización activa que la persona todavía no agregó; `null` sin la fuente. */
export function danilToAdd(danil: DanilView): readonly { id: string; name: string }[] | null {
  if (!danil.available) return null;
  const added = danil.added ?? new Set<string>();
  return danil.available.filter((w) => !added.has(w.id));
}

/** Lo que el «+» necesita de los de Danil; agregar uno también lo abre. */
export function danilMenuOf(danil: DanilRail, view: DanilView, open: (id: string) => void): DanilMenu {
  return {
    signedIn: danil.signedIn(),
    organization: danil.organization(),
    toAdd: danilToAdd(view),
    others: danil.others(),
    onList: danil.refresh,
    onAdd: (id) => (danil.add(id), open(id)),
    onSwitch: danil.switchTo,
  };
}

/** Lo que la columna del riel usa de los de Danil, sobre sus ocultos locales. */
/**
 * Al entrar, el abierto no puede ser uno de Danil que la persona no agregó (el motor de la
 * organización lo propone por su cuenta): pasa al primer agregado del riel o, si no hay, al
 * primer local. `null` si el abierto vale o todavía no se sabe.
 */
export function openOnStart(list: readonly { id: string }[], open: string | null, hidden: ReadonlySet<string>, danil: DanilView): string | null {
  const { available, added } = danil;
  if (!open || !available || !added) return null;
  const ids = new Set(available.map((w) => w.id));
  if (!ids.has(open) || added.has(open)) return null;
  const first = list.find((w) => ids.has(w.id) && added.has(w.id)) ?? available.find((w) => added.has(w.id));
  return (first ?? list.find((w) => !ids.has(w.id) && !hidden.has(w.id)))?.id ?? null;
}

export function columnDanil(hidden: { ids: () => ReadonlySet<string>; show: (id: string) => void }, ws?: { lista: () => readonly { id: string }[] | null; activo: () => string | null; cambiarA: (id: string) => unknown }) {
  const danil = danilRail(hidden.ids, (ids) => ids.forEach(hidden.show));
  if (ws) setRailShown(() => (ws.lista() ?? []).map((w) => w.id));
  const view = (): DanilView => {
    const available = danil.available();
    // Sin agregados conocidos (cuenta sin evidencia), el riel muestra los de la organización, como antes.
    const added = danil.added() ?? (available ? new Set(available.map((w) => w.id).filter((id) => !hidden.ids().has(id))) : null);
    return { available, added };
  };
  // Una sola vez, en cuanto se sabe: después, lo que la persona abre manda.
  let settled = false;
  createEffect(() => {
    if (settled || !ws) return;
    const current = view();
    if (!current.available || !current.added || !ws.activo()) return;
    settled = true;
    const next = openOnStart(ws.lista() ?? [], ws.activo(), hidden.ids(), current);
    if (next) void ws.cambiarA(next);
  });
  const make = (w: { id: string; name: string }) => ({ id: w.id, name: w.name, logo: null as string | null });
  return {
    danil,
    view,
    visible: <T extends { id: string; name: string; logo: string | null }>(list: readonly T[], open: string | null) => railWithDanil<T | ReturnType<typeof make>>(list, hidden.ids(), open, view(), make),
    /** Los ocultos del «+»: solo los locales; un workspace de Danil se quita, no se oculta. */
    hiddenRows: <T extends { id: string }>(list: readonly T[]) => railHidden(list, hidden.ids()).filter((w) => !danil.isDanil(w.id)),
  };
}

/** El nombre de un cuadro para quien no ve la marca ni el distintivo. */
export const tileLabel = (name: string, isDanil: boolean, state: string | null, t: (key: string, values: Record<string, string>) => string) => {
  const named = isDanil ? t("shell.workspaces.danil_tile", { name }) : name;
  return state ? t("shell.workspaces.tile_with_state", { name: named, state }) : named;
};
