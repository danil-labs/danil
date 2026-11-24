import remarkGfm from "remark-gfm";
import {
  createMemo,
  ErrorBoundary,
  Index,
} from "solid-js";
import { SolidMarkdown } from "solid-markdown";
import { cn } from "./lib/utils";
import { COMPONENTES } from "./markdown-components";
import { partidorDeBloques } from "./markdown-blocks";
import { remarkMatematicas } from "./markdown-math";
import { conTexto, type PintarTexto, preserveSoftBreaks } from "./markdown-text";

export function Markdown(props: {
  children: string;
  /** Se compone con el envoltorio. Deja a quien lo usa cambiar la escala. */
  class?: string;
  /** Pinta cada texto que no es código ni enlace. */
  texto?: PintarTexto;
}) {
  /** Sin el memo, el texto entero se volvería a partir en cada lectura; el partidor solo lee lo que llegó. */
  const partir = partidorDeBloques();
  const bloques = createMemo(() => partir(props.children));

  return (
    <ErrorBoundary
      fallback={(err) => {
        console.error("[Markdown] falló al pintar, cae a texto plano:", err);
        return (
          <p class="m-0 whitespace-pre-wrap text-[0.9rem] leading-[1.55] text-neutral-900">
            {props.children}
          </p>
        );
      }}
    >
      <div
        class={cn(
          // El primer y el último elemento **de dentro del envoltorio de
          // `SolidMarkdown`**, que es uno por bloque: `[&>:first-child]` a secas
          // apuntaría a ese envoltorio, que no tiene margen que quitar.
          "min-w-0 max-w-full [overflow-wrap:anywhere] text-[0.9rem] leading-[1.55] text-neutral-900 [&>:first-child>:first-child]:mt-0 [&>:last-child>:last-child]:mb-0",
          props.class,
        )}
      >
        <Index each={bloques()}>
          {(b) => (
            /* `display: contents`: `SolidMarkdown` envuelve en un `<div>`, y
               uno por bloque impediría colapsar márgenes entre bloques
               vecinos. Con `contents` ese `div` no genera caja. */
            <SolidMarkdown
              class="contents"
              remarkPlugins={[remarkGfm, remarkMatematicas]}
              rehypePlugins={[preserveSoftBreaks]}
              components={props.texto ? conTexto(COMPONENTES, props.texto) : COMPONENTES}
            >
              {b()}
            </SolidMarkdown>
          )}
        </Index>
      </div>
    </ErrorBoundary>
  );
}
