/**
 * De dónde viene una fuente, dicho como la persona lo reconoce: el proveedor y
 * el repositorio —`GitHub · danil-labs/harness-app · main`— o la carpeta con el
 * home abreviado —`~/Documents/Manuales`—. La ruta de la copia que la app
 * guarda bajo AppData no se enseña: no la eligió nadie y no dice nada.
 */

import type { Source } from "./model";

export type Procedencia = {
  /** `null` es una carpeta de esta computadora; si no, el nombre del proveedor. */
  proveedor: string | null;
  /** `danil-labs/harness-app` en un repositorio; la ruta abreviada en una carpeta. */
  sitio: string;
  rama: string | null;
};

/** Los hosts con nombre propio. Cualquier otro se nombra por su host. */
const PROVEEDORES: [RegExp, string][] = [
  [/(^|\.)github\.com$/i, "GitHub"],
  [/(^|\.)bitbucket\.org$/i, "Bitbucket"],
];

/** El home de la persona, en las tres plataformas, para sustituirlo por `~`. */
const HOME = /^(?:[A-Za-z]:)?[\\/]Users[\\/][^\\/]+|^\/home\/[^/]+/;

export function abreviarHome(ruta: string): string {
  return ruta.trim().replace(HOME, "~");
}

/** Host y ruta de una URL de clon, sea `https://host/ruta.git` o `git@host:ruta.git`. */
function partesDeClon(location: string): { host: string; ruta: string } | null {
  const l = location.trim();
  let host = "";
  let ruta = "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(l)) {
    try {
      const u = new URL(l);
      host = u.hostname;
      ruta = u.pathname;
    } catch {
      return null;
    }
  } else {
    const m = l.match(/^(?:[^@/:]+@)?([^:/]+):(.+)$/);
    if (!m) return null;
    host = m[1];
    ruta = m[2];
  }
  ruta = ruta.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  return host && ruta ? { host, ruta } : null;
}

export function proveedorDe(host: string): string {
  const h = host.replace(/^www\./i, "");
  return PROVEEDORES.find(([re]) => re.test(h))?.[1] ?? h;
}

export function procedencia(
  s: Pick<Source, "kind" | "location" | "branch">,
): Procedencia {
  if (s.kind !== "git") {
    return { proveedor: null, sitio: abreviarHome(s.location), rama: null };
  }
  const rama = s.branch?.trim() || null;
  const partes = partesDeClon(s.location);
  if (!partes) return { proveedor: "git", sitio: s.location.trim(), rama };
  return { proveedor: proveedorDe(partes.host), sitio: partes.ruta, rama };
}

/** El renglón entero. `carpeta` es la palabra traducida para una fuente sin proveedor. */
export function lineaDeProcedencia(p: Procedencia, carpeta: string): string {
  return [p.proveedor ?? carpeta, p.sitio, p.rama].filter(Boolean).join(" · ");
}
