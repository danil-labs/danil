/**
 * La letra de git o de kn de un archivo, su color y su descripción, para el
 * árbol y la tira de pestañas. Solo el árbol la lee del backend y la publica
 * por árbol de tarea: una pestaña no pide `tree_git_status` por su cuenta, y
 * enseña lo último que el árbol publicó.
 */
import { createSignal } from "solid-js";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import type { EstadoLocal, MarcaLocal } from "./tree";

const [porArbol, setPorArbol] = createSignal<ReadonlyMap<string, ReadonlyMap<string, EstadoLocal>>>(
  new Map(),
);

const claveDeArbol = (project: string, session: string, arbol: string) =>
  JSON.stringify([project, session, arbol]);

export function publicarLocales(
  project: string,
  session: string,
  arbol: string,
  locales: ReadonlyMap<string, EstadoLocal>,
) {
  const clave = claveDeArbol(project, session, arbol);
  const antes = porArbol().get(clave);
  if (!antes && locales.size === 0) return;
  const siguiente = new Map(porArbol());
  siguiente.set(clave, locales);
  setPorArbol(siguiente);
}

export function localDe(
  project: string,
  session: string,
  arbol: string,
  ruta: string,
): EstadoLocal | undefined {
  return porArbol().get(claveDeArbol(project, session, arbol))?.get(ruta);
}

export function colorDeMarca(marca: MarcaLocal): string {
  switch (marca) {
    case "U":
    case "A":
      return "text-success-strong";
    case "M":
      return "text-warning-strong";
    case "D":
    case "!":
      return "text-error-strong";
    case "R":
    case "C":
    case "T":
      return "text-info-strong";
  }
}

function describirMarca(marca: MarcaLocal): string {
  switch (marca) {
    case "U":
      return t("code.tree.local.untracked");
    case "M":
      return t("code.tree.local.modified");
    case "A":
      return t("code.tree.local.added");
    case "D":
      return t("code.tree.local.deleted");
    case "R":
      return t("code.tree.local.renamed");
    case "C":
      return t("code.tree.local.copied");
    case "T":
      return t("code.tree.local.type_changed");
    case "!":
      return t("code.tree.local.conflict");
  }
}

function describirKn(marca: MarcaLocal): string {
  if (marca === "A") return t("kn.pending.added");
  if (marca === "D") return t("kn.pending.deleted");
  return t("kn.pending.modified");
}

export function describirEstado(estado: EstadoLocal): string {
  if (estado.kn) return describirKn(estado.marca);
  if (estado.marca === "U" || estado.marca === "!")
    return describirMarca(estado.marca);
  return [
    estado.index
      ? t("code.tree.local.staged", { status: describirMarca(estado.index) })
      : "",
    estado.worktree
      ? t("code.tree.local.unstaged", {
          status: describirMarca(estado.worktree),
        })
      : "",
  ]
    .filter(Boolean)
    .join("; ");
}
