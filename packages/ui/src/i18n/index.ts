// Un solo i18n para todo el front nuevo: el de apps/desktop, con sus catálogos.
// Importar este módulo registra `es`; llama a `cargarLenguas()` al arrancar la app.
import "./catalogs.ts";
export * from "./i18n.ts";
export { cargarLenguas, EMPOTRADAS } from "./catalogs.ts";
