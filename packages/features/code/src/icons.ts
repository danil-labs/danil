// Con la extensión: `scripts/*.test.ts` corre en Node con
// `--experimental-strip-types`, donde un relativo sin extensión no resuelve.
import { POR_EXTENSION, POR_NOMBRE } from "./file-icons.ts";

/**
 * Qué icono le toca a cada archivo del árbol de código. Aparte del componente
 * porque se prueba sin montar nada (`tests/unit/icons.test.ts`).
 *
 * El icono es el logo del formato: identidad de un tercero, como el color de
 * marca de un canal en su chip — no color semántico del sistema. La única
 * señal de color propia de esta pestaña —el verde y el rojo de `+N −M`— queda
 * sola en su columna.
 *
 * Los mapas salen de **material-icon-theme** (MIT), generados a
 * `file-icons.ts` por `scripts/icons.mjs`: 772 extensiones y 932 nombres
 * exactos hacia 118 iconos —122 con las variantes claras—. Qué subconjunto
 * entra, y por qué no los 632 del tema —512 kB—, está en la cabecera de ese
 * script.
 *
 * **El nombre completo manda sobre la extensión**: `package.json` lleva el
 * logo de Node y no el de JSON, `Dockerfile` no tiene extensión, y
 * `pnpm-lock.yaml` no es un YAML que alguien vaya a leer.
 *
 * `toml`, `bun`, `deno` y `pnpm` son casi negros y sobre fondo claro
 * desaparecen: se usa su variante clara, elegida con el tema **ya resuelto**
 * (`lib/theme.ts` · `temaPintado`, una señal) — leer `dataset.theme` a pelo
 * dejaría el icono con el tema del primer pintado.
 */

/**
 * El id del icono que le toca a una ruta, o `null` si no hay ninguno.
 *
 * **La extensión se prueba desde el punto más a la izquierda**: en el catálogo
 * conviven `test.ts` y `ts` —los mapas traen claves con punto dentro—, y mirar
 * solo el último punto le daría a `Boton.test.ts` el logo de TypeScript en vez
 * del de prueba. **Y un nombre que empieza por punto también tiene
 * extensión**: `.env` vive en el mapa de extensiones, como `env`; saltárselo
 * lo dejaría con el icono genérico.
 */
export function iconoDe(ruta: string): string | null {
  const nombre = ruta.slice(ruta.lastIndexOf("/") + 1).toLowerCase();
  const exacto = POR_NOMBRE[nombre];
  if (exacto) return exacto;
  // Desde el primer punto hacia la derecha: la coincidencia más larga gana.
  // `Makefile` no entra en el bucle y sale con el genérico, que es correcto.
  for (let i = nombre.indexOf("."); i >= 0; i = nombre.indexOf(".", i + 1)) {
    const icono = POR_EXTENSION[nombre.slice(i + 1)];
    if (icono) return icono;
  }
  return null;
}
