import { createPref } from "../../lib/prefs.ts";
import { effectiveHidden } from "./workspace-hidden-sync.ts";
import { hiddenSync } from "./workspace-hidden-wiring.ts";

/** Los workspaces que la persona quitó del riel, por id del motor. En la web, por persona. */
export const HIDDEN_KEY = "workspaces.hidden";

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();

/** Si `name` contiene `query`, sin distinguir mayúsculas ni acentos. */
export function matchesName(name: string, query: string): boolean {
  const needle = fold(query.trim());
  return !needle || fold(name).includes(needle);
}

/** Lo que el riel muestra: todos menos los ocultos; el abierto siempre. */
export function railVisible<T extends { id: string }>(list: readonly T[], hidden: ReadonlySet<string>, open: string | null): T[] {
  return list.filter((w) => w.id === open || !hidden.has(w.id));
}

/** Los ocultos que existen, en el orden del riel. Un id que ya no existe no aparece. */
export function railHidden<T extends { id: string }>(list: readonly T[], hidden: ReadonlySet<string>): T[] {
  return list.filter((w) => hidden.has(w.id));
}

/** El orden completo tras mover los visibles: cada uno que no se ve conserva su lugar. */
export function keepSlots(full: readonly string[], visible: readonly string[]): string[] {
  const known = new Set(full);
  const moved = visible.filter((id) => known.has(id));
  const shown = new Set(moved);
  let slot = 0;
  const placed = full.map((id) => (shown.has(id) ? moved[slot++] : id));
  return [...placed, ...visible.filter((id) => !known.has(id))];
}

/**
 * Los ocultos del riel. Los locales siguen en `workspaces.hidden`; para lo que sirve la máquina
 * de la organización activa manda la cuenta cuando responde (`workspace-hidden-sync.ts`).
 */
export function createHiddenWorkspaces() {
  const [read, write] = createPref<unknown>(HIDDEN_KEY, []);
  const local = (): Set<string> => {
    const value = read();
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
  };
  const sync = hiddenSync(local);
  const ids = (): Set<string> => {
    sync.revision();
    const scope = sync.scope();
    return scope ? effectiveHidden(local(), sync.account(), scope.served) : local();
  };
  return {
    ids,
    hide(id: string) {
      const current = local();
      if (!current.has(id)) write([...current, id]);
      sync.hide(id);
    },
    show(id: string) {
      const current = local();
      if (current.delete(id)) write([...current]);
      sync.show(id);
    },
  };
}
