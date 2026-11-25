#!/usr/bin/env node
/**
 * Que alguien esté escuchando el evento que Rust emite.
 *
 * ## El fallo, que no se ve como un fallo
 *
 * `secrets/accounts.rs` emitía `"cuenta"` y `Accounts.tsx` escuchaba `"account"`. El
 * puente de Tauri **no comprueba que haya oyente**: `app.emit` devuelve `Ok` con
 * cero suscriptores, y `listen` espera contento un nombre que nadie emite. No
 * hay excepción, ni aviso, ni nada rojo.
 *
 * Lo que se ve desde fuera no se parece a un desajuste de nombres: con el login
 * sin recibir un solo evento, lo que hay delante es «no me da el código» y «hay
 * que pulsar comprobar para que cargue», que se diagnostican como defectos de
 * otra cosa.
 *
 * ## Por qué es un script y no una regla escrita
 *
 * El criterio de este repo es mecanizar a la tercera reincidencia. Este se salta
 * la regla por lo mismo que `paths.mjs`: **el modo de fallo es mudo**. Un
 * desajuste de nombre no se distingue de «el CLI no dijo nada», así que la única
 * forma de encontrarlo es buscarlo a propósito — y buscarlo a propósito es esto.
 *
 * La otra mitad del puente —los nombres de comando de `invoke()` y los de sus
 * parámetros— tiene el mismo agujero y no se comprueba aquí: `invoke<T>` es una
 * aserción, no una validación. Lo que sí se puede afirmar es que un evento
 * escuchado exista.
 *
 * **Solo en un sentido, y a propósito.** Se exige que todo `listen` tenga quien
 * lo emita; no al revés. Un evento emitido y no escuchado es una decisión
 * legítima —el backend puede publicar algo que todavía nadie pinta— mientras que
 * escuchar lo que nadie emite es siempre esperar a Godot.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
// `.pathname` en Windows da `/C:/…` y revienta.
import { fileURLToPath } from "node:url";
import { walkFiles } from "../git.mjs";
import { EVENTOS_PENDIENTES } from "../engine-pending.mjs";

const RUST = fileURLToPath(new URL("../../src-tauri/src", import.meta.url));
/** El front vive en `packages/`; `host` es el puente y no se cuenta como interfaz. */
const PACKAGES = fileURLToPath(new URL("../../../../packages", import.meta.url));
const FEATURES = join(PACKAGES, "features");

/**
 * **Todos los árboles de interfaz, no uno.**
 *
 * Hoy hay uno solo y la lista parece de más. Existe porque este guarda miraba
 * `src/` a secas, y un árbol nuevo al lado —una segunda superficie, un puerto en
 * curso— se llevaba los `listen` fuera de su vista dejándolo dar verde sobre lo
 * que quedaba: el mismo fallo mudo que vino a cazar.
 *
 * **Una ruta que no existe no se deja aquí.** `existsSync` la saltaría sin
 * decir nada, y entonces la lista diría que se vigilan dos árboles cuando se
 * vigila uno. Lo que impide que eso pase inadvertido es la comprobación de
 * abajo: si la cuenta de `listen` baja a cero, falla.
 */
const WEB = [
  fileURLToPath(new URL("../../src", import.meta.url)),
  join(PACKAGES, "shell", "src"),
  join(PACKAGES, "ui", "src"),
  join(PACKAGES, "session", "src"),
  ...(existsSync(FEATURES)
    ? readdirSync(FEATURES, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(FEATURES, entry.name, "src"))
    : []),
].filter((dir) => existsSync(dir));

/** `app.emit("nombre"` / `.emit(\n  "nombre"` — el nombre puede ir en la línea
 *  siguiente, que es como quedó el de `secrets/accounts.rs`. */
const EMITE = /\.emit\(\s*"([^"]+)"/g;
/** `listen<Tipo>("nombre"` y `listen("nombre"`. */
const ESCUCHA = /\blisten\s*(?:<[^>]*>)?\s*\(\s*"([^"]+)"/g;
/** Toda aparición de `listen`, para cazar las que la de arriba no explica. */
const ESCUCHA_TODO = /\blisten\s*[<(]/g;

/** Los nombres que aparecen con `re`, con dónde salieron. */
function nombres(dirs, exts, re) {
  const out = new Map();
  for (const dir of [dirs].flat()) {
    for (const f of walkFiles(dir, exts)) {
      const texto = readFileSync(f, "utf8");
      // Se lee el archivo entero y no línea a línea: el nombre puede ir en la
      // línea de después del paréntesis, que es justo el caso que se escapó.
      for (const m of texto.matchAll(re)) {
        const antes = texto.slice(0, m.index);
        const linea = antes.split("\n").length;
        if (!out.has(m[1])) out.set(m[1], []);
        out.get(m[1]).push(`${relative(dir, f)}:${linea}`);
      }
    }
  }
  return out;
}

/** Cuántas veces aparece `re` en total, sin mirar el nombre. */
function cuenta(dirs, exts, re) {
  let n = 0;
  for (const dir of [dirs].flat()) {
    for (const f of walkFiles(dir, exts)) {
      n += [...readFileSync(f, "utf8").matchAll(re)].length;
    }
  }
  return n;
}

const emitidos = nombres(RUST, [".rs"], EMITE);
// El motor emite los suyos; su código no vive aquí y el contrato los declara.
const CONTRATO = fileURLToPath(new URL("../../src-tauri/crates/engine-protocol/commands.json", import.meta.url));
for (const evento of JSON.parse(readFileSync(CONTRATO, "utf8")).events) {
  if (!emitidos.has(evento)) emitidos.set(evento, ["commands.json"]);
}
// Y los de sus extensiones (`engine-protocol/extensions/*.json`), fuera de la huella.
const EXTENSIONES = fileURLToPath(new URL("../../src-tauri/crates/engine-protocol/extensions", import.meta.url));
for (const f of existsSync(EXTENSIONES) ? readdirSync(EXTENSIONES).filter((n) => n.endsWith(".json")) : []) {
  for (const evento of JSON.parse(readFileSync(`${EXTENSIONES}/${f}`, "utf8")).events ?? []) {
    if (!emitidos.has(evento)) emitidos.set(evento, [`extensions/${f}`]);
  }
}
const escuchados = nombres(WEB, [".ts", ".tsx"], ESCUCHA);

/**
 * **Que el guarda no pueda quedarse ciego en verde.**
 *
 * Las dos formas de dejarlo sin ver son mudas y las dos parecen una mejora:
 * poner el nombre en una constante —`listen(EVENTO_CHAT, …)`— y mudarse a un
 * árbol que no está en `WEB`. Sin estas dos comprobaciones el script imprime
 * «los 0 eventos que la interfaz escucha los emite alguien» y sale con 0.
 *
 * Es lo que `commands.mjs` ya hacía con `invoke` y este no.
 */
const escuchasTotales = cuenta(WEB, [".ts", ".tsx"], ESCUCHA_TODO);
const explicadas = [...escuchados.values()].reduce((n, d) => n + d.length, 0);

if (escuchasTotales === 0) {
  console.error(
    `Ningún \`listen\` en ${WEB.length} árbol(es) de interfaz.\n\n` +
      `La app escucha eventos de Rust, así que cero significa que este guarda\n` +
      `está mirando donde ya no hay nada — no que no haya nada que mirar.\n` +
      `Añade el árbol nuevo a \`WEB\` en este archivo.`,
  );
  process.exit(1);
}

if (explicadas < escuchasTotales) {
  console.error(
    `${escuchasTotales - explicadas} \`listen\` con el nombre en una variable —\n` +
      `no puedo seguirlo. El nombre de un evento va como cadena literal en el\n` +
      `sitio de la llamada: es lo único que este guarda sabe leer, y una\n` +
      `constante lo deja ciego sin fallar.`,
  );
  process.exit(1);
}

// Con el stream empujado los eventos del motor solo llegan a quien escucha con `lib/serviceEvents`.
const CRUDO = /import\s*\{[^}]*\blisten\b[^}]*\}\s*from\s*"@tauri-apps\/api\/event"/;
const crudos = WEB.flatMap((dir) =>
  [...walkFiles(dir, [".ts", ".tsx"])]
    .filter((f) => !f.replaceAll("\\", "/").endsWith("lib/serviceEvents.ts") && CRUDO.test(readFileSync(f, "utf8")))
    .map((f) => relative(dir, f)),
);
for (const f of crudos) console.error(`${f} importa \`listen\` de @tauri-apps/api/event: usa el de lib/serviceEvents.`);
if (crudos.length) process.exit(1);

const llegados = Object.keys(EVENTOS_PENDIENTES).filter((n) => emitidos.has(n));
for (const n of llegados) console.error(`«${n}» ya lo emite el motor: quítalo de scripts/engine-pending.mjs.`);
if (llegados.length) process.exit(1);
const huerfanos = [...escuchados].filter(([n]) => !emitidos.has(n) && !(n in EVENTOS_PENDIENTES));

if (huerfanos.length === 0) {
  console.log(
    `Los ${escuchados.size} eventos que la interfaz escucha los emite alguien ` +
      `(${emitidos.size} emitidos en total, ${escuchasTotales} escuchas en ` +
      `${WEB.length} árbol(es)).`,
  );
  process.exit(0);
}

for (const [n, donde] of huerfanos) {
  console.error(`Nadie emite «${n}» — lo escucha ${donde.join(", ")}`);
}
console.error(
  `\nEmitidos por Rust: ${[...emitidos.keys()].sort().join(", ") || "ninguno"}\n\n` +
    `Un evento que nadie emite no falla: \`listen\` espera para siempre y no\n` +
    `avisa. Se ve como que el proceso de abajo no dijo nada, y se diagnostica\n` +
    `en el sitio equivocado. El nombre es una ruta entre dos procesos, así que\n` +
    `va en inglés — la misma regla que las rutas y los campos guardados.`,
);
process.exit(1);
