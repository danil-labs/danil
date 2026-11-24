/**
 * Lo que no cabe en disco: el motor se niega a instalar y dice cuánto hace
 * falta y cuánto hay, en bytes. Unos comandos rechazan con el `Failure` entero;
 * otros con la clave sola, y las cifras llegan aparte por el evento `install`.
 */
import { peso } from "./format.ts";
import { t } from "./i18n.ts";

/** La clave del motor; `needed` y `free` van en bytes. */
export const SIN_ESPACIO = "common.install.no_space";

type Cifras = { needed?: unknown; free?: unknown };

/** «Necesitas X libres y tienes Y…»; sin cifras, la misma frase sin ellas. */
export function textoSinEspacio(datos?: Cifras | null): string {
  const needed = Number(datos?.needed);
  const free = Number(datos?.free);
  if (datos?.needed == null || datos?.free == null || !Number.isFinite(needed) || !Number.isFinite(free)) {
    return t("common.install.no_space_plain");
  }
  return t(SIN_ESPACIO, { needed: peso(needed), free: peso(free) });
}

/** Las cifras si el error es falta de espacio: `Failure`, `Frase`, `{clave, datos}` o la clave sola. */
function cifrasDe(e: unknown): Cifras | null | undefined {
  if (e === SIN_ESPACIO) return null;
  if (!e || typeof e !== "object") return undefined;
  const what = "what" in e ? (e as { what: unknown }).what : e;
  if (what === SIN_ESPACIO) return null;
  if (what && typeof what === "object" && (what as { clave?: unknown }).clave === SIN_ESPACIO) {
    return ((what as { datos?: Cifras }).datos ?? null) as Cifras | null;
  }
  return undefined;
}

const vistas = new Map<string, Cifras>();
const esperando = new Map<string, Set<(c: Cifras) => void>>();

/** Cada `install` que cierra sin espacio deja sus cifras por operación. */
export function anotarFalta(p: { operation: string; kind: string; failure?: unknown }) {
  if (p.kind !== "error") return;
  const c = cifrasDe(p.failure);
  if (!c) return;
  vistas.set(p.operation, c);
  for (const f of esperando.get(p.operation) ?? []) f(c);
  esperando.delete(p.operation);
}

// El rechazo y el evento viajan por caminos distintos: el evento puede llegar después.
const ESPERA_MS = 1500;

/**
 * El texto para un error de `operation` si fue falta de espacio, o `null`. Con
 * la clave sola espera un poco a que el evento traiga las cifras.
 */
export async function textoDeFalta(e: unknown, operation: string): Promise<string | null> {
  const c = cifrasDe(e);
  if (c === undefined) return null;
  if (c) return textoSinEspacio(c);
  const vista = vistas.get(operation);
  if (vista) {
    vistas.delete(operation);
    return textoSinEspacio(vista);
  }
  const llegada = await new Promise<Cifras | null>((resolve) => {
    const set = esperando.get(operation) ?? new Set();
    const listo = (x: Cifras | null) => {
      clearTimeout(plazo);
      set.delete(listo);
      resolve(x);
    };
    const plazo = setTimeout(() => listo(null), ESPERA_MS);
    esperando.set(operation, set.add(listo));
  });
  vistas.delete(operation);
  return textoSinEspacio(llegada);
}
