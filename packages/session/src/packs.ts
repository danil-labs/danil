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
import { invoke } from "../../engine-client/src/client.ts";
import { registrarPaquete, type Manifiesto, type Plural } from "../../ui/src/lib/i18n.ts";
// Importarlo desde aquí es también lo que **ordena la carga**: los empotrados
// entran al evaluarse ese módulo, así que ninguna lengua de disco puede llegar
// al motor antes que el respaldo.
import { EMPOTRADAS } from "../../ui/src/locales/catalogs.ts";

/** Lo que devuelve `list_language_packs`. Espeja `locales::Paquete`. */
export type Paquete = {
  codigo: string;
  manifiesto: Manifiesto | null;
  frases: Record<string, string | Plural>;
  /** Por qué Rust no lo acepta. `null` cuando pasó todo lo que Rust puede mirar. */
  rechazo: string | null;
};

/**
 * Por qué una lengua instalada no se puede usar.
 *
 * `backend` es la única que trae prosa hecha: la escribe Rust, que sí sabe qué
 * archivo y qué línea (`environment/locales.rs`).
 */
type Rechazo =
  | { por: "backend"; detalle: string }
  | { por: "formato"; formato: string }
  | { por: "empotrada" };

/** Una lengua instalada, ya juzgada también por lo que solo el front puede juzgar. */
export type LenguaInstalada = {
  codigo: string;
  manifiesto: Manifiesto | null;
  /** `null` si se registró y se puede usar. */
  rechazo: Rechazo | null;
  /** Las claves que el paquete trae y esta versión de la app no conoce. */
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
 * dejar la ventana sin montar: sin paquetes la app tiene `es`, `en` y `yua`
 * dentro.
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

function aplicar(paquete: Paquete): LenguaInstalada {
  const { codigo, manifiesto } = paquete;
  if (paquete.rechazo !== null || !manifiesto) {
    const detalle = paquete.rechazo ?? `${codigo}: sin manifiesto`;
    return { codigo, manifiesto, rechazo: { por: "backend", detalle }, ignoradas: 0 };
  }

  // **Los empotrados no se pisan desde disco.** `es` es el respaldo de todo y
  // `yua` viaja embebido en el binario: un paquete en disco con el mismo código
  // no reemplaza el catálogo empotrado.
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
