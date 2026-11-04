/**
 * Mete en el motor las lenguas que están en el app data, y **es la puerta**.
 *
 * `catalogs.ts` hace lo mismo con lo que viaja dentro del binario. La
 * diferencia que gobierna todo lo de aquí es que aquello es síncrono —un glob
 * que Vite resuelve al compilar— y esto es un `invoke`, que no lo es.
 *
 * **Con la lengua elegida en un paquete de disco, la ventana pintaría un
 * instante en la de respaldo** —el mismo fallo que `lib/theme.ts` documenta para
 * el tema: la app abre en español y cambia de lengua delante de quien mira—. Se
 * evita sin bloquear el arranque: `app/main.tsx` espera esta carga **solo cuando
 * la lengua que toca no está ya registrada**, así que con `es`, `en` o «sistema»
 * resolviendo a una de las dos no se espera nada. Si la lectura falla o tarda se
 * arranca en el respaldo igual: bloquear la ventana esperando a un catálogo es
 * peor que pintarla en español, porque sin texto no hay nada que hacer.
 *
 * **Dos comprobaciones viven aquí y no en `environment/locales.rs`**, que valida todo lo que
 * se puede validar sin el motor del webview:
 *
 * - **Si `Intl` conoce el `formato`.** `Intl` es del motor que va a formatear
 *   los números, y una lista copiada en Rust envejece y contestaría distinto que
 *   él: `new Intl.NumberFormat("yua")` no falla, contesta con las reglas de otra
 *   lengua, y eso son números y fechas mal escritos sin un solo error.
 * - **Qué claves conoce la app.** Son las de `es`, y `es` vive aquí.
 *
 * Un paquete que no pase se queda en disco, **no se registra**, y su fila en
 * Estado del entorno dice por qué y ofrece quitarlo. No se borra solo: quien lo
 * instaló eligió esa carpeta y merece saber qué pasó con ella.
 */
import { invoke } from "../lib/invoke.ts";
import { registrarPaquete, type Manifiesto, type Plural } from "../lib/i18n.ts";
// Importarlo desde aquí es también lo que **ordena la carga**: los empotrados
// entran al evaluarse ese módulo, así que ninguna lengua de disco puede llegar
// al motor antes que el respaldo.
import { EMPOTRADAS } from "./catalogs.ts";

/** Lo que devuelven `list_language_packs` e `install_language_pack`. Espeja `locales::Paquete`. */
export type Paquete = {
  codigo: string;
  manifiesto: Manifiesto | null;
  frases: Record<string, string | Plural>;
  /** Por qué Rust no lo acepta. `null` cuando pasó todo lo que Rust puede mirar. */
  rechazo: string | null;
};

/**
 * Lo que devuelve `list_bundled_language_packs`. Espeja `locales::Disponible`.
 *
 * **Sin `frases`, y eso es del backend**: para decidir si una lengua se puede
 * ofrecer basta el manifiesto, y el catálogo entero son ~112 kB por lengua
 * cruzando el IPC cada vez que alguien abre el selector. Se leen al instalarla.
 */
export type Disponible = {
  codigo: string;
  manifiesto: Manifiesto | null;
  rechazo: string | null;
};

/**
 * Por qué una lengua instalada no se puede usar.
 *
 * **Un objeto y no una cadena**, aunque la cadena sea más corta: quien lo pinta
 * tiene que escribir la frase en la lengua de quien mira, y de una cadena ya
 * redactada solo se puede hacer eso —pintarla— o adivinar qué dice con un
 * `includes`. Con esto, la pantalla hace un `switch` sin comodín.
 *
 * `backend` es la única que trae prosa hecha: la escribe Rust, que sí sabe qué
 * archivo y qué línea (`src-tauri/src/environment/locales.rs`). Su texto **no está
 * traducido** — el texto del backend es otra fase, y este renglón se comporta
 * como los demás detalles de error de la app.
 */
export type Rechazo =
  | { por: "backend"; detalle: string }
  | { por: "formato"; formato: string }
  | { por: "empotrada" };

/** Una lengua instalada, ya juzgada también por lo que solo el front puede juzgar. */
export type LenguaInstalada = {
  codigo: string;
  manifiesto: Manifiesto | null;
  /** `null` si se registró y se puede usar. */
  rechazo: Rechazo | null;
  /**
   * Las claves que el paquete trae y esta versión de la app no conoce.
   *
   * **Se ignoran y se dicen.** Un paquete escrito contra una versión anterior
   * las va a traer siempre —cada versión de la app renombra o retira alguna— así
   * que no son un error; pero callarlas deja a quien tradujo creyendo que ese
   * trabajo se está viendo, y no se ve en ninguna parte.
   */
  ignoradas: number;
};

/**
 * Por qué `Intl` no sirve para este locale, o `null` si sí sirve.
 *
 * `supportedLocalesOf` es lo que contesta la pregunta de verdad: si devuelve la
 * lista vacía, construir un formateador con ese código **no falla** y devuelve
 * un número escrito a la manera de otra lengua.
 */
function intlNoConoce(formato: string): string | null {
  try {
    if (Intl.NumberFormat.supportedLocalesOf([formato]).length > 0) return null;
  } catch {
    // Un código con forma inválida lanza `RangeError`. Rust ya filtra la forma,
    // así que llegar aquí es que se editó la carpeta a mano después de instalar.
  }
  return formato;
}

/**
 * Lee el app data, registra lo que se puede usar y devuelve el veredicto de cada
 * uno.
 *
 * **No lanza.** El arranque la llama y un backend que no conteste no puede
 * dejar la ventana sin montar: sin paquetes la app tiene `es` y `en` dentro, que
 * es con lo que arrancaba antes de que esto existiera.
 */
export async function cargarPaquetes(): Promise<LenguaInstalada[]> {
  let paquetes: Paquete[];
  try {
    paquetes = await invoke<Paquete[]>("list_language_packs");
  } catch {
    return [];
  }
  return paquetes.map((p) => aplicar(p));
}

/**
 * El veredicto del front sobre un paquete, y su registro si pasa.
 *
 * Se exporta porque instalar tiene que pasar por la **misma** puerta que
 * arrancar: dos caminos que decidan si un paquete sirve acabarían decidiendo
 * cosas distintas, y la diferencia se vería como «lo instalé y no aparece».
 */
export function aplicar(paquete: Paquete): LenguaInstalada {
  const { codigo, manifiesto } = paquete;
  if (paquete.rechazo !== null || !manifiesto) {
    const detalle = paquete.rechazo ?? `${codigo}: sin manifiesto`;
    return { codigo, manifiesto, rechazo: { por: "backend", detalle }, ignoradas: 0 };
  }

  // **Los empotrados no se pisan desde disco.** `es` es el respaldo de todo: un
  // paquete que lo reemplazara podría dejar la app sin la cascada que impide los
  // huecos, y no habría dónde caer. Cuáles viajan dentro lo sabe el glob de
  // `catalogs.ts` — que es justo lo que Rust no puede saber, y por eso no lo
  // comprueba él.
  if (EMPOTRADAS.has(codigo)) {
    return { codigo, manifiesto, rechazo: { por: "empotrada" }, ignoradas: 0 };
  }

  const desconocido = intlNoConoce(manifiesto.formato);
  if (desconocido) {
    return { codigo, manifiesto, rechazo: { por: "formato", formato: desconocido }, ignoradas: 0 };
  }

  const ignoradas = registrarPaquete(manifiesto, paquete.frases);
  return { codigo, manifiesto, rechazo: null, ignoradas };
}

/**
 * Las lenguas que **viajan dentro del bundle**, ya filtradas a las que se pueden
 * ofrecer en el selector.
 *
 * Es el tercer estado de una lengua —ni empotrada ni instalada— y existe para
 * que elegir el maayatʼaan sea elegirlo, y no encontrar antes una carpeta en el
 * disco. La cabecera de `src-tauri/src/environment/locales.rs` lo tiene entero, incluido por
 * qué esto **no** es el canal de descarga que sigue sin decidirse: el paquete se
 * copió a la máquina al instalar la app y no se pide por red al elegirlo.
 *
 * **Filtra con las mismas dos preguntas que `aplicar`** —`Intl` conoce el
 * `formato`, y no pisa un empotrado— y por el mismo motivo por el que aquella
 * existe: ofrecer una lengua que se va a rechazar en cuanto se instale es
 * prometer algo que no se cumple, y el rechazo llegaría después del gesto.
 *
 * **No lanza, y lo que no se puede ofrecer no se dice aquí.** Un paquete del
 * bundle que se rechace es un defecto de nuestro build, no del disco de quien
 * usa la app: quien lo caza antes de publicar es `scripts/guards/plugins.mjs` y el
 * test `lo_que_viaja_en_el_bundle_se_puede_instalar`. Escribirlo en el selector de
 * idioma sería un aviso permanente sobre algo que quien lo lee no puede tocar.
 */
export async function lenguasDelBundle(): Promise<Manifiesto[]> {
  let disponibles: Disponible[];
  try {
    disponibles = await invoke<Disponible[]>("list_bundled_language_packs");
  } catch {
    return [];
  }
  return disponibles.flatMap((d) => {
    const m = d.manifiesto;
    if (d.rechazo !== null || !m) return [];
    if (EMPOTRADAS.has(d.codigo) || intlNoConoce(m.formato)) return [];
    return [m];
  });
}

/**
 * Copia al app data una de las que viajan en el bundle, y la registra.
 *
 * **Se vuelve a leer el disco en vez de registrar lo que contestó el comando**,
 * que es lo mismo que hace `PaquetesDeLengua` al instalar de una carpeta y por
 * el mismo motivo: dos caminos que decidan si un paquete sirve acabarían
 * decidiendo cosas distintas, y esa diferencia se ve como «lo instalé y no
 * aparece». Aquí el disco es además la única prueba de que la copia quedó
 * hecha.
 *
 * **Lanza si no quedó usable**, y eso es la mitad que importa: quien llama tiene
 * que poder devolver el selector a la lengua de antes. Un `install` que
 * resolviera igual dejaría la pantalla diciendo que está puesta una lengua que
 * no se instaló.
 */
export async function instalarDelBundle(codigo: string): Promise<LenguaInstalada> {
  await invoke<Paquete>("install_bundled_language_pack", { code: codigo });
  const puesta = (await cargarPaquetes()).find((l) => l.codigo === codigo);
  if (!puesta) throw `${codigo}: la copia terminó y la carpeta de lenguas no lo tiene`;
  // Lo que se tira es el **detalle crudo**, el renglón de abajo de un
  // `Failure`: la frase con acción la escribe quien llama, que es el único que
  // sabe en qué pantalla está. `switch` sin comodín por lo mismo que en
  // `PaquetesDeLengua`: una causa nueva rompe la compilación aquí.
  switch (puesta.rechazo?.por) {
    case "backend":
      throw puesta.rechazo.detalle;
    case "formato":
      throw `${codigo}: Intl no conoce «${puesta.rechazo.formato}»`;
    case "empotrada":
      throw `${codigo}: ya viaja empotrada en el binario`;
    case undefined:
      return puesta;
  }
}
