import assert from "node:assert/strict";
import test from "node:test";

import { iconoDe } from "../../../../packages/ui/src/lib/icons.ts";

/**
 * **Lo que se prueba es qué gana cuando hay más de un candidato.** Un icono
 * equivocado no rompe nada y no da error: la fila se pinta, el árbol se ve
 * completo, y quien lo mira aprende una asociación falsa —que `package.json` es
 * «un JSON más»— que luego le cuesta encontrar el archivo que busca.
 *
 * Los tres casos que decidieron cómo está escrito `iconoDe` salieron mirando la
 * maqueta pintada, no leyendo el código.
 */

test("el nombre completo gana a la extensión", () => {
  // Los dos son `.json`, y ninguno se lee como un JSON cualquiera.
  assert.equal(iconoDe("package.json"), "nodejs");
  assert.equal(iconoDe("tsconfig.json"), "tsconfig");
  assert.equal(iconoDe("src/datos.json"), "json");
});

test("la extensión más larga gana a la más corta", () => {
  // Sin esto, una prueba se pinta igual que el archivo que prueba, que es
  // justo lo que hay que distinguir de un vistazo en una columna estrecha.
  assert.equal(iconoDe("src/Boton.test.ts"), "test-ts");
  assert.equal(iconoDe("src/Boton.test.tsx"), "test-jsx");
  assert.equal(iconoDe("src/utils.spec.ts"), "test-ts");
  assert.equal(iconoDe("src/utils.ts"), "typescript");
});

test("un nombre que empieza por punto también tiene extensión", () => {
  // `.env` no está en el mapa de nombres; está en el de extensiones. Tratarlo
  // como «sin extensión» lo dejaba con el icono genérico.
  assert.equal(iconoDe(".env"), "tune");
  assert.equal(iconoDe(".env.local"), "tune");
  // Y el que sí está por nombre sigue ganando.
  assert.equal(iconoDe(".gitignore"), "git");
});

test("sin extensión, decide el nombre; y si no, no hay icono", () => {
  assert.equal(iconoDe("Makefile"), "makefile");
  assert.equal(iconoDe("Dockerfile"), "docker");
  // `null` es lo que le dice al componente que pinte el genérico. Que sea
  // explícito es lo que impide que una fila se quede sin nada y desalineada.
  assert.equal(iconoDe("src/raro.qwerty"), null);
  assert.equal(iconoDe("src/SinExtension"), null);
});
