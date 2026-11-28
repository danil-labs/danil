import type { Setter } from "solid-js";

type Token = { readonly workspace: string | null; readonly generation: number; readonly wakeEpoch: number; readonly starting: boolean; readonly seq: number };

export type RereadErrorSetter = Setter<string | null> & {
  begin?: () => Token;
  setFor?: (token: Token, value: string | null) => void;
};

/**
 * Relee el catálogo de proyectos capturando su token de lectura antes de emitir `changed()`.
 * Si una lectura más reciente arrancó o falló mientras esta estaba en vuelo, su éxito tardío
 * no limpia el error nuevo ni invalida el token de la lectura en curso.
 */
export async function rereadProjectsCatalog(
  projectCatalog: { changed(): Promise<unknown> },
  setProjectReadError: RereadErrorSetter,
): Promise<void> {
  const readToken = setProjectReadError.begin?.();
  try {
    await projectCatalog.changed();
    if (readToken && setProjectReadError.setFor) setProjectReadError.setFor(readToken, null);
    else setProjectReadError(null);
  } catch {
    // La lista anterior sigue sirviendo: releer es una puesta al día.
  }
}
