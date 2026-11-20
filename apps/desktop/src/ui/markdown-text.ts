import type { JSX } from "solid-js";

type Nodo = { type: string; tagName?: string; value?: string; children?: Nodo[] };
type Texto = { node: { value: string; position?: { start: { offset?: number } } }; parent?: { tagName?: string } };

/** Pinta un texto del Markdown; `inicio` dice si el texto abre su bloque. */
export type PintarTexto = (texto: string, inicio: boolean) => JSX.Element;

/** Dentro de código y de enlaces el texto se pinta tal cual. */
const CRUDO = new Set(["code", "pre", "a"]);

// solid-markdown descarta los nodos de texto que valen exactamente un salto.
export function preserveSoftBreaks() {
  const visit = (node: Nodo) => {
    if (node.tagName === "pre" || node.tagName === "code") return;
    for (const child of node.children ?? []) {
      if (child.type === "text" && child.value === "\n") child.value = " ";
      else visit(child);
    }
  };
  return visit;
}

/** Los componentes con un `text` que pasa por `pintar` lo que no es código ni enlace. */
export function conTexto<T extends object>(componentes: T, pintar: PintarTexto) {
  return {
    ...componentes,
    text: (p: Texto) => (CRUDO.has(p.parent?.tagName ?? "") ? p.node.value : pintar(p.node.value, p.node.position?.start.offset === 0)),
  };
}
