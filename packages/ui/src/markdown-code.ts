type Nodo = { value?: string; children?: Nodo[] };

const textoDe = (n: Nodo): string => n.value ?? n.children?.map(textoDe).join("") ?? "";

/** Lo que copia el botón de un bloque `pre`: su texto sin el salto que cierra el bloque. */
export function textoDelBloque(pre: Nodo): string {
  return textoDe(pre).replace(/\n$/, "");
}
