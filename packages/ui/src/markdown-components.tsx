import {
  type ComponentProps,
  Show,
  Suspense,
  useContext,
} from "solid-js";
import { SolidMarkdown } from "solid-markdown";
import { t } from "../../../apps/desktop/src/lib/i18n";
import { clicEnEnlaceWeb, destinoAbrible, imagenInerte, imagenLocal, internalTaskLink, localFilePath } from "./lib/chat/links";
import { cn } from "../../../apps/desktop/src/lib/utils";
import { isMac } from "../../host/src/window";
import { EnlargeableImage } from "./EnlargeableImage";
import { FilePreview } from "./FilePreview";
import { FileMachine } from "./fileMachine";
import { BordeDeColumna, MarkdownTable } from "./MarkdownTable";
import { MermaidDiagram } from "./Mermaid";
import { textoDelBloque } from "./markdown-code";
import { ITEM_DE_MENU, Popover, PopoverContent, PopoverTrigger } from "./Popover";
import {
  BloqueDeCodigo,
  CopiarEnlace,
  diagramaMermaid,
  Formula,
  fuenteLocal,
  ImagenRemota,
  type MarkdownNode,
  textoDe,
  tieneClase,
} from "./markdown-widgets";

/**
 * Cómo se pinta cada etiqueta. **Es una constante del módulo y no un literal
 * dentro del componente**: desde que el mensaje se parte en bloques hay un
 * `SolidMarkdown` por bloque, y un objeto nuevo por cada uno sería trabajo por
 * token multiplicado por bloques.
 */
export const COMPONENTES = {
  p: (p) => <p class="m-0 mb-3">{p.children}</p>,
  // La negrita marca con forma y temperatura, no con brillo: subir el contraste
  // de la prosa cansa la lectura en un párrafo largo.
  strong: (p) => (
    <strong class="font-mono text-[0.96em] font-extrabold tracking-[-0.01em] text-emphasis">
      {p.children}
    </strong>
  ),
  em: (p) => <em class="italic">{p.children}</em>,
  h1: (p) => (
    <h1 class="mt-4 mb-2 text-[1.3rem] font-bold leading-tight">
      {p.children}
    </h1>
  ),
  h2: (p) => (
    <h2 class="mt-4 mb-2 text-[1.15rem] font-bold leading-tight">
      {p.children}
    </h2>
  ),
  h3: (p) => (
    <h3 class="mt-3 mb-2 text-[1.02rem] font-bold leading-tight">
      {p.children}
    </h3>
  ),
  h4: (p) => (
    <h4 class="mt-3 mb-2 text-[0.96rem] font-bold leading-tight">
      {p.children}
    </h4>
  ),
  h5: (p) => <h5 class="mt-3 mb-2 text-[0.92rem] font-bold leading-tight">{p.children}</h5>,
  h6: (p) => <h6 class="mt-3 mb-2 text-[0.9rem] font-bold leading-tight">{p.children}</h6>,
  ul: (p) => (
    <ul class="my-3 list-disc pl-5 marker:text-neutral-500">{p.children}</ul>
  ),
  ol: (p) => (
    <ol start={p.start} class="my-3 list-decimal pl-5 marker:text-neutral-500">{p.children}</ol>
  ),
  li: (p) => <li class={cn("my-0.5", p.checked !== null && p.checked !== undefined && "list-none")}>{p.children}</li>,
  // Los archivos usan el visor; una URL web conserva sus opciones de apertura.
  a: (p) => {
    const task = internalTaskLink(p.href);
    return task ? (
      <button
        type="button"
        title={t("markdown.link.open_task")}
        class="cursor-pointer rounded-sm bg-surface-muted px-1 font-semibold text-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
        onClick={() => window.dispatchEvent(new CustomEvent("harness:open-task-link", { detail: task }))}
      >
        {p.children}
      </button>
    ) : (
    <Show
      when={localFilePath(p.href)}
      fallback={
        <Show when={destinoAbrible(p.href)} fallback={<span>{p.children}</span>}>
          {(destino) => (
            <Popover placement="bottom-start" gutter={4}>
              <PopoverTrigger
                as={(props: ComponentProps<"a">) => (
                  <a
                    {...props}
                    href={destino()}
                    /* `preventDefault` evita que el `href` navegue la ventana, y
                       reenviar el `onClick` de Kobalte es lo que abre el panel:
                       Kobalte lo pasa dentro de `props` y en JSX gana el último
                       con el mismo nombre (`tests/unit/triggers.test.mjs` lo
                       comprueba). El `href` se queda aunque no navegue: enseña el
                       destino al pasar por encima. */
                    onClick={(e) =>
                      clicEnEnlaceWeb(
                        e,
                        destino(),
                        (e) => (props as { onClick?: (e: MouseEvent) => void }).onClick?.(e),
                        isMac(),
                      )
                    }
                    class="cursor-pointer font-semibold text-link underline-offset-2 hover:underline"
                  >
                    {p.children}
                  </a>
                )}
              />
              <PopoverContent class="w-max min-w-0 p-1">
                <div class="flex flex-col">
                  <button
                    type="button"
                    class={ITEM_DE_MENU}
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("harness:abrir-sitio", { detail: destino() }),
                      )
                    }
                  >
                    {t("markdown.link.here")}
                  </button>
                  <button
                    type="button"
                    class={ITEM_DE_MENU}
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("harness:abrir-fuera", { detail: destino() }),
                      )
                    }
                  >
                    {t("markdown.link.outside")}
                  </button>
                  <CopiarEnlace destino={destino()} />
                </div>
              </PopoverContent>
            </Popover>
          )}
        </Show>
      }
    >
      {(path) => (
        <button
          type="button"
          title={path()}
          class="cursor-pointer text-left font-semibold text-link underline-offset-2 hover:underline"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("harness:open-file", { detail: path() }),
            );
          }}
        >
          {p.children}
        </button>
      )}
    </Show>
    );
  },
  /* Una imagen remota se pide sola, sin script y sin un clic, con lo que
     diga la URL. Una ruta que no es imagen se pinta como tarjeta del archivo.
     Si no viene dentro del mensaje ni del disco, queda su texto
     alternativo — que es lo que el markdown puso ahí para cuando no se
     pueda pintar. */
  img: (p) => {
    // La imagen de una tarea de otra máquina no está en este disco: la lee su motor.
    const maquina = useContext(FileMachine);
    return (
    <Show
      when={imagenInerte(p.src) ?? (maquina() ? null : fuenteLocal(p.src))}
      fallback={
        <Show when={localFilePath(p.src)} fallback={<span class="text-neutral-500">{p.alt}</span>}>
          {(ruta) => (
            <Show when={imagenLocal(p.src)} fallback={<FilePreview path={ruta()} alt={p.alt} />}>
              {(imagen) => (
                <Suspense fallback={<span class="text-neutral-500">{p.alt}</span>}>
                  <ImagenRemota path={imagen()} alt={p.alt} />
                </Suspense>
              )}
            </Show>
          )}
        </Show>
      }
    >
      {(fuente) => <EnlargeableImage src={fuente()} alt={p.alt} />}
    </Show>
    );
  },
  code: (p) => {
    const nodo = p.node as unknown as MarkdownNode;
    return tieneClase(nodo, "math-inline") ? (
      <Formula tex={textoDe(nodo)} bloque={false} />
    ) : (
      <code class="rounded-sm bg-neutral-950/[0.06] px-1 py-0.5 font-mono text-[0.86em] text-neutral-950">
        {p.children}
      </code>
    );
  },
  /* `surface-muted` y no `neutral-950`: la rampa se invierte con el tema, y un
     fondo `neutral-950` acaba casi blanco en oscuro — lo más brillante de la
     pantalla sería el bloque de código. Contraste interno: 17,45:1 en claro y
     15,11:1 en oscuro. Un fondo que no se invirtiera deja el texto a 1,07:1. */
  pre: (p) => {
    const codigo = (p.node as unknown as MarkdownNode).children?.[0];
    if (codigo && tieneClase(codigo, "math-display")) return <Formula tex={textoDe(codigo)} bloque />;
    const definition = diagramaMermaid(p.node as unknown as MarkdownNode);
    return definition ? (
      <MermaidDiagram definition={definition} />
    ) : (
      <BloqueDeCodigo texto={textoDelBloque(p.node as unknown as MarkdownNode)}>
        {p.children}
      </BloqueDeCodigo>
    );
  },
  blockquote: (p) => (
    <blockquote class="my-3 border-l-2 border-border-strong pl-3 text-neutral-700">
      {p.children}
    </blockquote>
  ),
  hr: () => <hr class="my-4 border-0 border-t border-border" />,
  input: (p) => (
    <input
      type={p.type}
      checked={p.checked}
      disabled={p.disabled}
      class="mr-1.5 align-middle"
    />
  ),
  table: (p) => <MarkdownTable>{p.children}</MarkdownTable>,
  th: (p) => (
    <th class="relative border-b border-r border-border bg-neutral-950/[0.045] px-3 py-2 text-[0.72rem] font-bold uppercase text-neutral-700 last:border-r-0">
      {p.children}
      <BordeDeColumna />
    </th>
  ),
  td: (p) => (
    <td class="border-b border-r border-border px-3 py-2 align-top last:border-r-0">
      {p.children}
    </td>
  ),
} satisfies ComponentProps<typeof SolidMarkdown>["components"];
