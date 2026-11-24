import { convertFileSrc } from "@tauri-apps/api/core";
import Check from "lucide-solid/icons/check";
import Copy from "lucide-solid/icons/copy";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import {
  createEffect,
  createSignal,
  type JSX,
  lazy,
  onCleanup,
  Show,
} from "solid-js";
import { copyText } from "../../host/src/clipboard";
import { t } from "./lib/i18n";
import { imagenLocal } from "./lib/chat/links";
import { cn } from "./lib/utils";
import { Button } from "./Button";
import { prosaDe } from "./Failure";
import { ITEM_DE_MENU } from "./Popover";

export function fuenteLocal(src: unknown): string | null {
  const ruta = imagenLocal(src);
  return ruta ? convertFileSrc(ruta, "terminus-image") || null : null;
}

// Solo la web lo usa: el escritorio pinta la imagen desde su disco.
export const ImagenRemota = lazy(() => import("./RemoteImage"));

// El menú sigue abierto tras copiar para que la confirmación o el fallo se lean.
export function CopiarEnlace(props: { destino: string }) {
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

export function BloqueDeCodigo(props: { texto: string; children: JSX.Element }) {
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

export type MarkdownNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { className?: string[] | string };
  children?: MarkdownNode[];
};

export function tieneClase(nodo: MarkdownNode, clase: string) {
  const clases = nodo.properties?.className;
  return Array.isArray(clases) ? clases.includes(clase) : clases === clase;
}

export const textoDe = (nodo: MarkdownNode) => nodo.children?.map((hijo) => hijo.value ?? "").join("") ?? "";

export function diagramaMermaid(pre: MarkdownNode): string | null {
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
export function Formula(props: { tex: string; bloque: boolean }) {
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
