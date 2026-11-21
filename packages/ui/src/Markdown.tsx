import { convertFileSrc } from "@tauri-apps/api/core";
import Check from "lucide-solid/icons/check";
import Copy from "lucide-solid/icons/copy";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import remarkGfm from "remark-gfm";
import {
  type ComponentProps,
  createEffect,
  createMemo,
  createSignal,
  ErrorBoundary,
  Index,
  type JSX,
  lazy,
  onCleanup,
  Show,
  Suspense,
  useContext,
} from "solid-js";
import { SolidMarkdown } from "solid-markdown";
import { copyText } from "../../host/src/clipboard";
import { t } from "../../../apps/desktop/src/lib/i18n";
import { clicEnEnlaceWeb, destinoAbrible, imagenInerte, imagenLocal, internalTaskLink, localFilePath } from "../../../apps/desktop/src/lib/links";
import { cn } from "../../../apps/desktop/src/lib/utils";
import { isMac } from "../../host/src/window";
import { Button } from "./Button";
import { EnlargeableImage } from "./EnlargeableImage";
import { prosaDe } from "./Failure";
import { FilePreview } from "./FilePreview";
import { FileMachine } from "./fileMachine";
import { BordeDeColumna, MarkdownTable } from "./MarkdownTable";
import { MermaidDiagram } from "./Mermaid";
import { partidorDeBloques } from "./markdown-blocks";
import { textoDelBloque } from "./markdown-code";
import { remarkMatematicas } from "./markdown-math";
import { conTexto, type PintarTexto, preserveSoftBreaks } from "./markdown-text";
import { ITEM_DE_MENU, Popover, PopoverContent, PopoverTrigger } from "./Popover";

/**
 * Pinta la respuesta del agente como Markdown, sabor GitHub.
 *
 * No ejecuta HTML crudo (comprobado con `<script>alert()` y
 * `<img src=x onerror=…>`: no se emiten). Eso es XSS; la exfiltración la cubre
 * el filtro de `src`/`href` en `lib/links.ts`: una imagen remota dispara el GET
 * al pintarse, sin script y sin clic, con el material en la URL.
 * `solid-markdown` 2.1.1 no trae saneador de URL. Segunda capa: la política de
 * la ventana — las dos medidas por separado en `tests/security/window.mjs`.
 *
 * Límite sin cubrir: un enlace que la persona pulsa abre su navegador con la
 * URL que escribió el agente, sin pasar por `publications.jsonl`.
 *
 * `ErrorBoundary` cae a texto plano si el pipeline revienta al pintar.
 *
 * Las fórmulas las pinta KaTeX sin `trust` y directo al DOM, sin `innerHTML`;
 * las reglas de sus delimitadores están en `markdown-math.ts`.
 *
 * `solid-markdown` 2.1.1 sigue la API de la versión 8 de su upstream: los
 * problemas se contrastan con esa documentación, no con la última.
 */
function fuenteLocal(src: unknown): string | null {
  const ruta = imagenLocal(src);
  return ruta ? convertFileSrc(ruta, "terminus-image") || null : null;
}

// Solo la web lo usa: el escritorio pinta la imagen desde su disco.
const ImagenRemota = lazy(() => import("./RemoteImage"));

/**
 * Cómo se pinta cada etiqueta. **Es una constante del módulo y no un literal
 * dentro del componente**: desde que el mensaje se parte en bloques hay un
 * `SolidMarkdown` por bloque, y un objeto nuevo por cada uno sería trabajo por
 * token multiplicado por bloques.
 */
const COMPONENTES = {
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

// El menú sigue abierto tras copiar para que la confirmación o el fallo se lean.
function CopiarEnlace(props: { destino: string }) {
  const [copiado, setCopiado] = createSignal(false);
  const [fallo, setFallo] = createSignal<string | null>(null);
  let apagar: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(apagar));
  const copiar = async () => {
    try {
      await copyText(props.destino);
      setFallo(null);
      setCopiado(true);
      clearTimeout(apagar);
      apagar = setTimeout(() => setCopiado(false), 1500);
    } catch (e) {
      setCopiado(false);
      setFallo(prosaDe(e));
    }
  };
  return (
    <>
      <button type="button" class={ITEM_DE_MENU} onClick={copiar}>
        {copiado() ? t("markdown.link.copied") : t("markdown.link.copy")}
      </button>
      <Show when={fallo()}>
        {(texto) => (
          <p role="alert" class="flex max-w-64 items-start gap-2 px-2 py-1.5 text-label text-error-strong">
            <TriangleAlert size={13} class="mt-0.5 shrink-0" />
            {texto()}
          </p>
        )}
      </Show>
    </>
  );
}

function BloqueDeCodigo(props: { texto: string; children: JSX.Element }) {
  const [copiado, setCopiado] = createSignal(false);
  const [fallo, setFallo] = createSignal<string | null>(null);
  let apagar: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(apagar));
  const copiar = async () => {
    try {
      await copyText(props.texto);
      setFallo(null);
      setCopiado(true);
      clearTimeout(apagar);
      apagar = setTimeout(() => setCopiado(false), 1500);
    } catch (e) {
      setCopiado(false);
      setFallo(prosaDe(e));
    }
  };
  const rotulo = () => (copiado() ? t("markdown.code.copied") : (fallo() ?? t("markdown.code.copy")));
  return (
    <div class="group/code relative my-3">
      <pre class="m-0 overflow-auto rounded-md border border-border bg-surface-muted p-3 font-mono text-[0.82rem] leading-[1.5] text-neutral-950 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit">
        {props.children}
      </pre>
      <Button
        variant="outline"
        size="iconCompact"
        class={cn(
          "pointer-events-none absolute top-2 right-2 bg-surface-muted opacity-0 transition-opacity group-hover/code:pointer-events-auto group-hover/code:opacity-100 focus-visible:opacity-100",
          (copiado() || fallo()) && "pointer-events-auto opacity-100",
          fallo() && "text-error-strong",
        )}
        onClick={copiar}
        title={rotulo()}
        aria-label={rotulo()}
      >
        <Show
          when={copiado()}
          fallback={
            <Show when={fallo()} fallback={<Copy size={13} />}>
              <TriangleAlert size={13} />
            </Show>
          }
        >
          <Check size={13} />
        </Show>
      </Button>
    </div>
  );
}

type MarkdownNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { className?: string[] | string };
  children?: MarkdownNode[];
};

function tieneClase(nodo: MarkdownNode, clase: string) {
  const clases = nodo.properties?.className;
  return Array.isArray(clases) ? clases.includes(clase) : clases === clase;
}

const textoDe = (nodo: MarkdownNode) => nodo.children?.map((hijo) => hijo.value ?? "").join("") ?? "";

function diagramaMermaid(pre: MarkdownNode): string | null {
  const code = pre.children?.[0];
  if (code?.tagName !== "code" || !tieneClase(code, "language-mermaid")) return null;
  return textoDe(code);
}

type ModuloKatex = typeof import("./markdown-katex");
let katexCargado: ModuloKatex | undefined;
let cargaKatex: Promise<ModuloKatex> | undefined;
const cargarKatex = () =>
  (cargaKatex ??= Promise.all([import("./markdown-katex"), import("katex/dist/katex.min.css")]).then(
    ([modulo]) => (katexCargado = modulo),
  ));

// Mientras KaTeX carga, la fórmula está a medio escribir o no es LaTeX válido, se ve su texto.
function Formula(props: { tex: string; bloque: boolean }) {
  const [katex, setKatex] = createSignal(katexCargado);
  const [fallo, setFallo] = createSignal<string | null>(null);
  let caja!: HTMLSpanElement;
  if (!katexCargado) void cargarKatex().then((modulo) => setKatex(() => modulo));
  createEffect(() => {
    const modulo = katex();
    setFallo(modulo ? modulo.pintarFormula(props.tex, props.bloque, caja) : "");
  });
  const crudo = (
    <code
      title={fallo() || undefined}
      class={cn(
        "rounded-sm bg-neutral-950/[0.06] px-1 py-0.5 font-mono text-[0.86em] text-neutral-700",
        props.bloque && "block whitespace-pre-wrap p-3",
      )}
    >
      {props.tex}
    </code>
  );
  return props.bloque ? (
    <div class="my-3 max-w-full overflow-x-auto overflow-y-hidden [&_.katex-display]:m-0">
      <span ref={caja} class={cn(fallo() !== null && "hidden")} />
      <Show when={fallo() !== null}>{crudo}</Show>
    </div>
  ) : (
    <>
      <span ref={caja} class={cn(fallo() !== null && "hidden")} />
      <Show when={fallo() !== null}>{crudo}</Show>
    </>
  );
}

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
