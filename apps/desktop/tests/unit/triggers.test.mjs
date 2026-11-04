/**
 * Que el disparador de un panel conserve el clic que lo abre.
 *
 * ## El defecto, que estuvo meses en la app
 *
 * Mover una tarea a otro proyecto no funcionaba. El botón estaba, el `title`
 * estaba, el menú de destinos estaba escrito — y pulsarlo no hacía nada. La
 * línea era esta:
 *
 *     <PopoverTrigger as={(p) => <button {...p} onClick={(e) => e.stopPropagation()} …>} />
 *
 * `PopoverTrigger` de Kobalte pasa **su** `onClick` dentro de `p`: es el que
 * llama a `context.toggle()`. En JSX gana el último atributo con el mismo
 * nombre, así que el `onClick` propio —puesto ahí para que el clic no llegara a
 * la fila de debajo— borraba el que abría el panel.
 *
 * **Con Radix esto funcionaba**, y por eso llegó así en la migración a Solid:
 * `asChild` componía los manejadores del disparador con los del hijo. Kobalte no
 * compone nada. No hay error, ni en consola ni al compilar: el botón se pinta,
 * responde al hover, y no abre nada.
 *
 * ## Qué se comprueba
 *
 * Dentro de un `as={(p) => …}`, que después de esparcir `{...p}` no venga un
 * manejador que el disparador también pasa **sin llamarlo**. Hay dos salidas, y
 * las dos son legítimas:
 *
 * - **No ponerlo.** Si lo que se quería era que el clic no llegara a la fila de
 *   debajo, eso se resuelve en quien escucha: la fila comprueba
 *   `closest(".session-acciones")` y se abstiene (`Sessions.tsx`).
 * - **Ponerlo y reenviar.** Cuando el disparador ES el botón que hace algo, el
 *   manejador propio llama primero al que venía dentro:
 *   `(p as { onClick?: (e: MouseEvent) => void }).onClick?.(e)`. Eso es lo que
 *   este guarda busca para dar por bueno el caso.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import test from "node:test";
import { walkFiles } from "../../scripts/git.mjs";

const raiz = resolve(import.meta.dirname, "../..");
const WEB = join(raiz, "src");

/** Los que Kobalte compone dentro del disparador y aquí se perderían. */
const MANEJADORES = ["onClick", "onPointerDown", "onKeyDown", "onFocus", "onBlur"];

/** El texto del `as={…}` que empieza en `desde`, hasta su llave de cierre. */
function bloque(fuente, desde) {
  let nivel = 0;
  for (let i = desde; i < fuente.length; i++) {
    if (fuente[i] === "{") nivel++;
    else if (fuente[i] === "}") {
      nivel--;
      if (nivel === 0) return fuente.slice(desde, i + 1);
    }
  }
  return fuente.slice(desde);
}

/**
 * Los disparadores de `fuente` que pisan un manejador propio sobre `{...p}`.
 * Devuelve `[{ manejador, linea }]`.
 */
export function overridden(fuente) {
  const failures = [];
  // `as={(p: object) => (` — el nombre del parámetro es lo que se esparce.
  const inicio = /as=\{\s*\(\s*(\w+)\s*(?::[^)]*)?\)\s*=>/g;
  for (const m of fuente.matchAll(inicio)) {
    const abre = fuente.indexOf("{", m.index);
    const cuerpo = bloque(fuente, abre);
    const esparce = cuerpo.indexOf(`{...${m[1]}}`);
    if (esparce === -1) continue;
    for (const h of MANEJADORES) {
      const puesto = cuerpo.indexOf(`${h}=`, esparce);
      if (puesto === -1) continue;
      // Reenviado a mano: `p.onClick?.(e)` dentro del propio manejador.
      if (cuerpo.includes(`${m[1]} as `) && cuerpo.includes(`.${h}?.(`)) continue;
      failures.push({
        manejador: h,
        linea: fuente.slice(0, abre + puesto).split("\n").length,
      });
    }
  }
  return failures;
}

test("ningún disparador pisa el manejador que lo abre", () => {
  const malos = [];
  for (const archivo of walkFiles(WEB, [".tsx"])) {
    for (const f of overridden(readFileSync(archivo, "utf8"))) {
      malos.push(`${relative(raiz, archivo)}:${f.linea} — ${f.manejador}`);
    }
  }
  assert.deepEqual(
    malos,
    [],
    `Estos disparadores definen un manejador DESPUÉS de esparcir las props que\n` +
      `les pasa el primitivo, así que se lo comen y el panel no abre:\n  ` +
      malos.join("\n  "),
  );
});

/* Un guarda que no puede fallar no comprueba nada, y este mira un patrón de
   texto: si el `as={…}` cambia de forma, dejaría de encontrar nada y seguiría
   en verde. Esta es la línea exacta que estuvo rota. */
test("reconoce el defecto que lo hizo falta", () => {
  const roto = `
    <PopoverTrigger
      as={(p: object) => (
        <button
          {...p}
          class="session-del"
          onClick={(e: MouseEvent) => e.stopPropagation()}
        >
          <FolderInput size={13} />
        </button>
      )}
    />`;
  assert.equal(overridden(roto).length, 1);
  assert.equal(overridden(roto)[0].manejador, "onClick");
});
