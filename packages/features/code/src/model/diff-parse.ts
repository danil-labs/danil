/**
 * Parsea un diff unificado de git en algo que se pueda pintar línea a línea.
 *
 * **El backend manda el patch como texto y aquí se convierte en estructura**,
 * en vez de pedirle al backend que mande JSON. El texto es lo que git produce y
 * lo que `publications.jsonl` registra; convertirlo dos veces —una para pintar,
 * otra para publicar— es tener dos verdades sobre el mismo cambio.
 *
 * Lo que este parser NO hace, y es a propósito: no adivina el lenguaje ni
 * colorea sintaxis. Lo que hay que distinguir en una revisión es qué se añadió
 * y qué se quitó, y eso lo dice la línea entera, no la palabra clave.
 */

/** Una línea del diff, con su número **real** en cada lado. */
export type Linea = {
  tipo: "ctx" | "add" | "del";
  /** El número en el archivo de antes; `null` en las añadidas. */
  vieja: number | null;
  /** El número en el archivo de ahora; `null` en las borradas. */
  nueva: number | null;
  texto: string;
};

/** Un trozo contiguo del archivo, con el número de línea donde empieza. */
export type Hunk = {
  desdeVieja: number;
  desdeNueva: number;
  lineas: Linea[];
};

export type ArchivoDiff = {
  /** La ruta de ahora; en un borrado, la que tenía. */
  ruta: string;
  /** La ruta anterior, solo si el archivo se movió. */
  desde: string | null;
  estado: "nuevo" | "borrado" | "renombrado" | "cambiado";
  /** Git no diffea binarios: lo dice y no manda contenido. */
  binario: boolean;
  hunks: Hunk[];
  added: number;
  removed: number;
};

/** `@@ -12,7 +12,9 @@ lo que sea` → los dos números de arranque. */
const CABECERA = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * **La ruta preferida sale de `+++`/`---`, no de la línea `diff --git`.** Esa
 * línea trae las dos rutas pegadas y sin comillas, así que un archivo con un
 * espacio en el nombre la vuelve ambigua: `a/mi archivo b/mi archivo` no se
 * puede partir sin adivinar dónde. Las de `+++`/`---` vienen una por línea.
 */
function rutaDe(linea: string): string | null {
  const cruda = linea.slice(4).trim();
  if (cruda === "/dev/null") return null;
  // git antepone `a/` y `b/` salvo que se configure lo contrario.
  return cruda.replace(/^[ab]\//, "");
}

/**
 * El respaldo para lo que no trae `+++`: **los binarios**.
 *
 * Git no los diffea, así que su bloque no tiene ni `---` ni `+++` ni trozos —
 * solo `diff --git` y una línea que dice que diferían—. Sin este respaldo el
 * archivo se quedaba sin ruta y el filtro final lo tiraba: un PNG que el agente
 * añadió **desaparecía de la revisión**, que es peor que enseñarlo sin
 * contenido.
 *
 * Parte por el último ` b/`, que es lo único que se puede hacer con las dos
 * rutas en una línea. Con un nombre que contenga ` b/` da mal — y aun así da
 * algo, que es lo que hay que preferir a perder el archivo.
 */
function rutaDeCabecera(linea: string): string | null {
  const cruda = linea.slice("diff --git ".length);
  const corte = cruda.lastIndexOf(" b/");
  if (corte < 0) return null;
  return cruda.slice(corte + 3);
}

/**
 * El contenido de un archivo **sin cambios**, con la forma de un diff.
 *
 * **Para que haya un solo renderizador.** Un archivo que el agente no tocó se
 * abre desde el árbol y hay que pintarlo con sus números de línea; escribir un
 * segundo visor sería el mismo dato dibujado dos veces, y dos dibujantes del
 * mismo dato divergen —uno gana un color, el otro un número—. Aquí es un trozo
 * único de líneas de contexto, que es literalmente lo que es: un archivo sin
 * nada añadido ni quitado.
 */
export function comoDiff(ruta: string, contenido: string): ArchivoDiff {
  const lineas = lineasDe(contenido);
  return {
    ruta,
    desde: null,
    estado: "cambiado",
    binario: false,
    added: 0,
    removed: 0,
    hunks: [
      {
        desdeVieja: 1,
        desdeNueva: 1,
        lineas: lineas.map((texto, i) => ({
          tipo: "ctx" as const,
          vieja: i + 1,
          nueva: i + 1,
          texto,
        })),
      },
    ],
  };
}

function lineasDe(contenido: string): string[] {
  // Un archivo que acaba en salto de línea deja una última línea vacía que no
  // es una línea del archivo.
  const crudas = contenido.split("\n");
  return crudas.at(-1) === "" ? crudas.slice(0, -1) : crudas;
}

export function parsearDiff(patch: string): ArchivoDiff[] {
  const archivos: ArchivoDiff[] = [];
  let actual: ArchivoDiff | null = null;
  let hunk: Hunk | null = null;
  let vieja = 0;
  let nueva = 0;

  const cerrarHunk = () => {
    if (actual && hunk) actual.hunks.push(hunk);
    hunk = null;
  };

  for (const linea of patch.split("\n")) {
    if (linea.startsWith("diff --git ")) {
      cerrarHunk();
      actual = {
        ruta: rutaDeCabecera(linea) ?? "",
        desde: null,
        estado: "cambiado",
        binario: false,
        hunks: [],
        added: 0,
        removed: 0,
      };
      archivos.push(actual);
      continue;
    }
    if (!actual) continue;

    if (linea.startsWith("new file mode")) {
      actual.estado = "nuevo";
      continue;
    }
    if (linea.startsWith("deleted file mode")) {
      actual.estado = "borrado";
      continue;
    }
    if (linea.startsWith("rename from ")) {
      actual.desde = linea.slice("rename from ".length);
      actual.estado = "renombrado";
      continue;
    }
    if (linea.startsWith("Binary files ") || linea.startsWith("GIT binary patch")) {
      actual.binario = true;
      continue;
    }
    if (linea.startsWith("--- ")) {
      // En un borrado, `+++` es /dev/null y el nombre de verdad solo está aquí.
      const r = rutaDe(linea);
      if (r) actual.ruta = r;
      continue;
    }
    if (linea.startsWith("+++ ")) {
      const r = rutaDe(linea);
      if (r) actual.ruta = r;
      continue;
    }

    const cab = CABECERA.exec(linea);
    if (cab) {
      cerrarHunk();
      vieja = Number(cab[1]);
      nueva = Number(cab[2]);
      hunk = { desdeVieja: vieja, desdeNueva: nueva, lineas: [] };
      continue;
    }
    if (!hunk) continue;

    // **`\ No newline at end of file` no es una línea del archivo.** Contarla
    // desplazaría toda la numeración de ahí abajo.
    if (linea.startsWith("\\")) continue;

    const marca = linea[0];
    // **El retorno de carro se va, y no es cosmética.** Un repositorio con finales
    // CRLF —lo normal en uno que se trabaja desde Windows— deja un `\r` al final
    // de cada línea del patch. Pintado, es un carácter de control invisible dentro
    // del bloque de código: no se ve, se copia, y aparece en cualquier sitio donde
    // alguien pegue lo que leyó aquí.
    const texto = linea.slice(1).replace(/\r$/, "");
    if (marca === "+") {
      hunk.lineas.push({ tipo: "add", vieja: null, nueva, texto });
      nueva += 1;
      actual.added += 1;
    } else if (marca === "-") {
      hunk.lineas.push({ tipo: "del", vieja, nueva: null, texto });
      vieja += 1;
      actual.removed += 1;
    } else if (marca === " ") {
      // **Una línea vacía del archivo llega como `" "`, no como `""`.** Git
      // siempre prefija con un carácter, así que la cadena vacía es el residuo
      // del `split` sobre el salto final del patch — contarla como contexto
      // corría un número toda la numeración de ahí abajo.
      hunk.lineas.push({ tipo: "ctx", vieja, nueva, texto });
      vieja += 1;
      nueva += 1;
    }
  }
  cerrarHunk();
  return archivos.filter((a) => a.ruta);
}

/**
 * Cuántas líneas se saltó git entre dos trozos.
 *
 * Es el número que va en «N líneas sin cambios»: sin él, dos trozos separados
 * por medio archivo se leen como si fueran contiguos.
 */
export function saltoEntre(anterior: Hunk, siguiente: Hunk): number {
  const finAnterior = anterior.lineas.reduce(
    (max, l) => (l.nueva !== null && l.nueva > max ? l.nueva : max),
    anterior.desdeNueva - 1,
  );
  return Math.max(0, siguiente.desdeNueva - finAnterior - 1);
}
