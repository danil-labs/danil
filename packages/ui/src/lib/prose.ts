/**
 * La prosa que manda el backend: una clave y sus datos, traducida aquí.
 *
 * El texto de interfaz se traduce donde se pinta: la lengua es del workspace
 * (`workspaces::Workspace::lengua`) y se resuelve en `lib/i18n.ts`, así que una
 * cadena escrita en Rust llegaría a la pantalla en español pase lo que pase con
 * el selector de idioma. Los datos —un repo, una rama, una ruta, la salida de
 * `git`— siguen viajando como texto: no hay nada que traducir en ellos.
 *
 * `Prosa` es `string | Frase`: una cadena es un mensaje del motor que aún no
 * viene por catálogo y se pinta tal cual.
 *
 * Una clave desconocida no puede pasar dentro de un build: catálogo y backend
 * viajan en el mismo binario y `scripts/guards/locales.mjs` falla `pnpm verify` si
 * Rust pide una clave que `es` no define; a un paquete de terceros incompleto
 * lo cubre la cascada de `t()`, que cae a `es`. Con el guarda apagado se pinta
 * la clave —`mcp.error.no_binary`—, feo a propósito: se reporta y se busca con
 * `grep`. En DEV, `t()` avisa por consola.
 */
// Con extensión: estos módulos se cargan también desde `node --test`, que no
// tiene el resolvedor de Vite (`SYSTEM.md` § De dónde sale cada frase).
import { t } from "./i18n.ts";
import { SIN_ESPACIO, textoSinEspacio } from "./no-space.ts";

/** Lo que manda un backend ya migrado. Espeja `util::Frase`. */
export type Frase = {
  clave: string;
  /**
   * Lo que se interpola en `{nombre}`. Los números llegan **como números**
   * porque `t()` elige la forma del plural con `Intl.PluralRules` sobre
   * `count`; un `"3"` funciona por `Number()` y un `"3 archivos"` no, sin dar
   * error.
   */
  datos?: Record<string, string | number>;
};

/** Una clave que se traduce, o prosa cruda de un módulo sin migrar. */
export type Prosa = string | Frase;

export function prosa(p: Prosa): string {
  if (typeof p === "string") return p;
  // Sus cifras llegan en bytes y se pintan con unidad.
  if (p.clave === SIN_ESPACIO) return textoSinEspacio(p.datos);
  return t(p.clave, p.datos);
}
