import { t } from "../../lib/i18n";

/**
 * Las marcas de `surfaces::Superficie`, tal como las escribe Rust.
 *
 * Son identificadores, no texto, aunque estén en español: el front las compara
 * byte a byte con lo que manda Rust (`src-tauri/src/runtime/surfaces.rs`, `sin_cuenta`)
 * para decidir qué botón ofrecer. Meterlas en el catálogo de lenguas rompe la
 * comparación al traducir la app — sin error y sin nada en consola.
 *
 * Viven en un `.ts` a propósito: `scripts/guards/literals.mjs` solo mira `.tsx`, y
 * ahí «sin elegir» se lee como una frase soldada.
 */

/** Hay cuentas de ese agente en el workspace y ninguna elegida para correr. */
export const MARCA_SIN_ELEGIR = "sin elegir";

/**
 * El rótulo de una marca, traducido. La marca es un identificador y la insignia
 * es texto: se compara la marca y se pinta el catálogo. Pintar la marca tal
 * cual enseña español bajo una interfaz en inglés, sin error y sin nada en
 * consola.
 */
export function rotuloDeMarca(marca: string): string {
  switch (marca) {
    case "sin conducir":
      return t("surfaces.badge.no_driver");
    case "no instalado":
      return t("surfaces.badge.not_installed");
    case MARCA_SIN_ELEGIR:
      return t("surfaces.badge.unpicked");
    case "sin conectar":
      return t("surfaces.badge.no_account");
    case "sin activar":
      return t("surfaces.badge.off");
    case "sin modelo":
      return t("surfaces.badge.no_model");
    case "sin motor":
      return t("surfaces.badge.no_engine");
    case "radiant":
      return t("surfaces.badge.harness");
    // Una marca desconocida se pinta tal cual: un identificador se reporta y se
    // busca con `grep`; un hueco en blanco dejaría la insignia sin nombre.
    default:
      return marca;
  }
}

/* Un `switch` con claves literales, y no un mapa: `scripts/guards/locales.mjs` solo
   cuenta como usada una clave escrita dentro de `t("…")` en el sitio de la
   llamada. En un `Record` las siete saldrían como frases que sobran. */
