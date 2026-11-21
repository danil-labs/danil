/**
 * Mete en el motor de lenguas los catálogos de la app. Portado de
 * `apps/desktop/src/locales/catalogs.ts`: mismos archivos y mismas frases
 * (los JSON de `./locales/` son copia de `apps/desktop/src/locales/`; el gate
 * R13 rechaza una frase que no exista allá).
 *
 * `es` es la base y va entera y empotrada: sin ella un `t()` devuelve la clave.
 * `en` llega perezoso y se aplica con `refreshLanguage()`, que vuelve a
 * resolver la preferencia vigente.
 */
import { refreshLanguage, registrarCatalogo, type Manifiesto } from "./i18n.ts";

type Archivo = Record<string, unknown>;

function registrar(codigo: string, archivos: Record<string, Archivo>) {
  let manifiesto: Manifiesto | undefined;
  const frases: Record<string, never> = {};
  for (const [ruta, contenido] of Object.entries(archivos)) {
    if (ruta.endsWith("/manifiesto.json")) manifiesto = contenido as unknown as Manifiesto;
    else Object.assign(frases, contenido);
  }
  if (!manifiesto) throw new Error(`i18n/locales/${codigo}/ no tiene manifiesto.json`);
  registrarCatalogo(manifiesto, frases);
}

registrar("es", import.meta.glob<Archivo>("./locales/es/*.json", { eager: true, import: "default" }));

const INGLES = import.meta.glob<Archivo>("./locales/en/*.json", { import: "default" });

/** Carga `en` en segundo plano; la app ya pinta en español mientras tanto. */
export async function cargarLenguas(): Promise<void> {
  const pares = await Promise.all(Object.entries(INGLES).map(async ([ruta, cargar]) => [ruta, await cargar()] as const));
  registrar("en", Object.fromEntries(pares));
  refreshLanguage();
}

export const EMPOTRADAS: ReadonlySet<string> = new Set(["es", "en"]);
