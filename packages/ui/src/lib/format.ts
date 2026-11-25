/**
 * Cómo se escribe un número que se lee en pantalla: una sola definición, para
 * que dos sitios no digan dos tamaños del mismo archivo.
 *
 * Vive en `lib/` y no junto a `limits` o `usage` a propósito: los dos formatean
 * números, y que uno importara del otro los ataría por donde menos se parecen.
 */
import { manifiesto } from "./i18n.ts";

// Construir uno cuesta decenas de microsegundos y una lista pinta cientos. La
// clave lleva el locale, leído en cada llamada: cambiar de lengua da otro.
const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

/**
 * Miles con el separador de la lengua que se está pintando: `1.234.567`.
 *
 * Es una función y no una constante: un `Intl.NumberFormat` a nivel de módulo
 * se congela al importarse y seguiría escribiendo en su locale bajo otra
 * lengua, sin error. El locale sale del manifiesto y no del código de lengua:
 * `Intl` no conoce `yua` y contesta con otro sin decirlo (`lib/i18n.ts`).
 */
export const nf = () => {
  const locale = manifiesto().formato;
  let format = numberFormats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(locale);
    numberFormats.set(locale, format);
  }
  return format;
};

/** Fechas, con el mismo contrato que `nf`: el locale sale del manifiesto y se
 *  construye al usarse, nunca al importarse. */
export const df = (opts?: Intl.DateTimeFormatOptions) => {
  const locale = manifiesto().formato;
  const key = `${locale}|${JSON.stringify(opts ?? {})}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, opts);
    dateFormats.set(key, format);
  }
  return format;
};

const unitFormats = new Map<string, Intl.NumberFormat>();

/** Un número con su unidad, escrito por `Intl` en la lengua que se pinta. */
function unit(value: number, name: "second" | "minute" | "hour" | "day" | "percent"): string {
  const locale = manifiesto().formato;
  const key = `${locale}|${name}`;
  let format = unitFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, {
      style: "unit",
      unit: name,
      unitDisplay: "narrow",
      maximumFractionDigits: 0,
    });
    unitFormats.set(key, format);
  }
  return format.format(value);
}

/** Cuánto lleva algo corriendo, en su unidad más grande: `25 h`, `3 d`. */
export function elapsed(seconds: number): string {
  if (seconds < 60) return unit(seconds, "second");
  if (seconds < 3600) return unit(Math.floor(seconds / 60), "minute");
  if (seconds < 86_400) return unit(Math.floor(seconds / 3600), "hour");
  return unit(Math.floor(seconds / 86_400), "day");
}

export const percent = (value: number) => unit(value, "percent");

/** Bytes en megas, redondeados. Nadie decide nada con los decimales del peso de
 *  una descarga. */
export const mb = (b: number) => `${Math.round(b / 1_048_576)} MB`;

/**
 * El peso de un artefacto, en la unidad en que se lee. Con un decimal, al revés
 * que `mb`: un artefacto típico pesa kilobytes, y entre `0 MB` y `0 MB` no se
 * distingue una nota del informe entero.
 */
export function peso(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} kB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  // GB porque una tarea que compiló mide gigas y `4400.0 MB` no se lee.
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
}

/** Una enumeración con la conjunción de la lengua que se pinta: «Claude Code y Codex». */
export const lista = (items: string[]) =>
  new Intl.ListFormat(manifiesto().formato, { type: "conjunction" }).format(items);
