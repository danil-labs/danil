// Sin imports: lo prueban `node --test` y el visor por igual.

export function esTypst(ruta: string) {
  return ruta.toLowerCase().endsWith(".typ");
}

/**
 * Todo `.typ` lleva la vista, con o sin ojo: sin él, el motor compila el `main.typ` más cercano.
 * Otro archivo no: el PDF del documento anterior se quedaría pegado al JSON que se abrió después.
 */
export function llevaVistaTypst(ruta: string) {
  return esTypst(ruta);
}
