import { createMemo, createSignal, Index, Show } from "solid-js";
import { imagenInerte } from "../../../../../../apps/desktop/src/lib/links";
import { splitNextSteps, type NextStepsPart } from "../../../../../../apps/desktop/src/lib/nextSteps";
import { CarruselDeImagenes } from "../../../../../ui/src/EnlargeableImage";
import { Markdown } from "../../../../../ui/src/Markdown";
import ChatVisual from "../ChatVisual";
import NextSteps from "../NextSteps";
import { splitChatVisuals, type ChatVisual as Visual } from "../../model/visualDirective";
import type { VisualBudget } from "../../model/visualBudget";


export type RespuestaRapida = {
  /** Falso si la caja tampoco podría mandar: sin cuenta o con una pregunta abierta. */
  puede: boolean;
  usada: (texto: string) => boolean;
  onElegir: (texto: string) => Promise<boolean>;
};


/**
 * La respuesta del agente con sus respuestas rápidas pintadas como botones.
 * `Index` y no `For`: cada token trae partes nuevas y `For` remontaría el
 * markdown entero en cada una.
 */
export function TextoConSiguientes(props: { texto: string; vivo: boolean; rapida: RespuestaRapida | null; owner: string; visualBudget: VisualBudget; readVisual?: (file: string) => Promise<string>; openVisual?: (file: string) => Promise<void> }) {
  const partes = createMemo(() => {
    const visuals = props.readVisual ? splitChatVisuals(props.texto, props.vivo) : [{ kind: "markdown" as const, markdown: props.texto }];
    return visuals.flatMap<Visual | NextStepsPart>((part) => part.kind === "visual" ? [part] : splitNextSteps(part.markdown, props.vivo));
  });
  const [enviando, setEnviando] = createSignal(false);
  const elegir = async (texto: string) => {
    if (!props.rapida || enviando()) return;
    setEnviando(true);
    try {
      await props.rapida.onElegir(texto);
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Index each={partes()}>
      {(parte) => {
        const bloque = () => {
          const p = parte();
          return p.kind === "next_steps" ? p : null;
        };
        const markdown = () => {
          const p = parte();
          return p.kind === "markdown" ? p.markdown : "";
        };
        return (
          <Show when={parte().kind === "visual" && props.readVisual} fallback={
          <Show when={bloque()} fallback={<Markdown>{markdown()}</Markdown>}>
            <Show when={bloque()?.prose}>
              <Markdown>{bloque()?.prose ?? ""}</Markdown>
            </Show>
            <NextSteps
              options={bloque()?.options ?? []}
              usada={(texto) => props.rapida?.usada(texto) ?? false}
              habilitado={Boolean(props.rapida?.puede && bloque()?.complete) && !enviando()}
              onElegir={(texto) => void elegir(texto)}
            />
          </Show>
          }>
            <ChatVisual visual={parte() as Visual} owner={props.owner} budget={props.visualBudget} read={(file) => props.readVisual!(file)} open={props.openVisual} />
          </Show>
        );
      }}
    </Index>
  );
}


export function ImagenesEntregadas(props: { items: string[] }) {
  const imagenes = () => props.items.map(imagenInerte).filter((url): url is string => url !== null);
  return (
    <Show when={imagenes().length > 0}>
      <div class="pt-2">
        <CarruselDeImagenes srcs={imagenes()} />
      </div>
    </Show>
  );
}
