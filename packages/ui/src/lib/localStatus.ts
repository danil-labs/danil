/** La letra de git o de kn de un archivo: la pinta el árbol de code y la tira de pestañas. */
export type MarcaLocal = "U" | "M" | "A" | "D" | "R" | "C" | "T" | "!";
export type EstadoLocal = {
  marca: MarcaLocal;
  index?: MarcaLocal;
  worktree?: MarcaLocal;
  /** Medido contra la carpeta del proyecto, no contra un índice: una copia kn. */
  kn?: true;
};
