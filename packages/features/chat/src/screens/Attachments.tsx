import { createResource, createSignal, Show, For, Suspense, type JSX } from "solid-js";
import { openExternal } from "../queries";
import X from "lucide-solid/icons/x";
import { Dialog, DialogContent, DialogTitle } from "../../../../ui/src/Dialog";
import FileText from "lucide-solid/icons/file-text";
import { t } from "../../../../ui/src/lib/i18n";
import { extensionDe, nombreDe } from "../../../../ui/src/lib/steps";
import type { Preview } from "../../../../ui/src/lib/preview.ts";
import { Pressable } from "../../../../ui/src/Pressable";

export default function Adjuntos(props: {
  /** Las rutas del archivo, tal como las guarda el turno. */
  rels: string[];
  /**
   * De relativa a `data:` URI, o `null` si no es una imagen o no cabe. Es una
   * función porque este componente no sabe en qué proyecto y tarea está —
   * `Chat.tsx` tampoco, y dárselos acoplaría la conversación a un dato que solo
   * necesita una miniatura.
   */
  miniatura: (rel: string) => Promise<string | null>;
  /** El archivo entero, para pintar un PDF o un texto sin salir de la ventana. */
  preview?: (rel: string) => Promise<Preview | null>;
  renderPdf: (props: { base64: string; name: string }) => JSX.Element;
}) {
  return (
    <div class="mb-2 flex gap-2 overflow-x-auto overflow-y-hidden pb-1" onWheel={rodarEnHorizontal}>
      <For each={props.rels}>
        {(rel) => (
          <div class="shrink-0">
            <Adjunto rel={rel} miniatura={props.miniatura} preview={props.preview} renderPdf={props.renderPdf} />
          </div>
        )}
      </For>
    </div>
  );
}

/** La miniatura final es un cuadrado de 3.5rem. El skeleton ocupa ese mismo sitio. */
const PARECE_IMAGEN = /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif|svg)$/i;
const PARECE_DOCUMENTO = /\.(pdf|txt|md|markdown|csv|json|docx?|xlsx?|pptx?|odt|ods|odp|rtf)$/i;

export function pareceImagen(rel: string) {
  return PARECE_IMAGEN.test(nombreDe(rel));
}

/** Un documento ya se conoce: su caja final es la tarjeta ancha, no el cuadrado. */
function pareceDocumento(rel: string) {
  return PARECE_DOCUMENTO.test(nombreDe(rel));
}

/**
 * Mientras la miniatura viaja, la caja ya tiene la forma del preview.
 * Sin sufijo (una captura pegada) también: si no era imagen, al resolver
 * pasa a la tarjeta. Un documento no pasa por el cuadrado.
 */
export function esperaCuadrada(rel: string) {
  if (pareceImagen(rel)) return true;
  if (pareceDocumento(rel)) return false;
  return !nombreDe(rel).includes(".");
}

/** La caja vacía, del mismo tamaño que lo que va a ocupar. `archivo` es la tarjeta ancha. */
export function EsqueletoDeAdjunto(props: { forma?: "imagen" | "archivo" }) {
  const archivo = () => props.forma === "archivo";
  return (
    <div
      class={archivo()
        ? "h-14 w-[150px] rounded-md border border-border bg-neutral-100 motion-safe:animate-skeleton"
        : "size-14 rounded-md border border-border bg-neutral-100 motion-safe:animate-skeleton"}
      aria-busy="true"
    />
  );
}

/** Una fila de miniaturas que desborda: la rueda vertical la recorre de lado. */
export function rodarEnHorizontal(e: WheelEvent & { currentTarget: HTMLElement }) {
  const fila = e.currentTarget;
  if (e.deltaX !== 0 || fila.scrollWidth <= fila.clientWidth) return;
  fila.scrollLeft += e.deltaY;
  e.preventDefault();
}
export function Adjunto(props: {
  rel: string;
  miniatura: (rel: string) => Promise<string | null>;
  preview?: (rel: string) => Promise<Preview | null>;
  renderPdf: (props: { base64: string; name: string }) => JSX.Element;
}) {
  // Una ruta desaparecida no debe impedir que se lea la conversación.
  const [imagen] = createResource(
    () => props.rel,
    (rel) => props.miniatura(rel).catch(() => null),
  );

  const [abierta, setAbierta] = createSignal(false);
  const [fallo, setFallo] = createSignal(false);
  const [documento, setDocumento] = createSignal<Preview | null>(null);
  const pdf = () => {
    const p = documento();
    return p?.kind === "pdf" ? p.pdf : null;
  };
  const texto = () => {
    const p = documento();
    return p?.kind === "text" ? p.text : null;
  };
  const abrir = async () => {
    if (imagen()) {
      setFallo(false);
      setAbierta(true);
      return;
    }
    if (props.preview) {
      try {
        const p = await props.preview(props.rel);
        if (p && ((p.kind === "pdf" && p.pdf) || (p.kind === "text" && p.text !== null))) {
          setDocumento(p);
          setFallo(false);
          setAbierta(true);
          return;
        }
      } catch {
        // Se cae al camino del sistema, que es el que ya existía.
      }
    }
    if (/^(\/|[a-z]:[\\/]|\\\\)/i.test(props.rel)) {
      try {
        await openExternal(props.rel);
      } catch {
        setFallo(true);
        setAbierta(true);
      }
    } else {
      setFallo(true);
      setAbierta(true);
    }
  };

  return (
    <>
      <Pressable
        class="block max-w-full rounded-md text-left focus-visible:outline-2 focus-visible:outline-primary"
        title={t("chat.attachments.open", { name: nombreDe(props.rel) })}
        aria-label={t("chat.attachments.open", { name: nombreDe(props.rel) })}
        onClick={() => void abrir()}
      >
        <Show
          when={imagen()}
          fallback={imagen.loading && esperaCuadrada(props.rel) ? <EsqueletoDeAdjunto /> : <Tarjeta rel={props.rel} />}
        >
          {(src) => (
            <img
              src={src()}
              alt={nombreDe(props.rel)}
              class="size-14 rounded-md border border-border object-cover"
            />
          )}
        </Show>
      </Pressable>
      <Dialog open={abierta()} onOpenChange={setAbierta}>
        <DialogContent
          class="flex max-h-full w-full max-w-[1100px] flex-col gap-3"
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Escape") e.stopPropagation();
          }}
        >
          <div class="flex items-center justify-between gap-3">
            <DialogTitle class="min-w-0 truncate text-sm">{nombreDe(props.rel)}</DialogTitle>
            <Dialog.CloseButton class="shrink-0 rounded p-1 hover:bg-surface-muted" aria-label={t("chat.attachments.close")}>
              <X size={18} />
            </Dialog.CloseButton>
          </div>
          <Show when={!fallo()} fallback={<p class="text-sm text-error-strong">{t("chat.attachments.open_failed")}</p>}>
            <Show when={pdf()} fallback={
              <Show when={texto()} fallback={
                <img src={imagen() ?? documento()?.data_url ?? undefined} alt={nombreDe(props.rel)} class="min-h-0 max-h-[75vh] w-full object-contain" />
              }>
                {(contenido) => (
                  <pre class="m-0 max-h-[75vh] overflow-auto rounded-md border border-border bg-surface-muted px-3 py-2.5 font-mono text-xs whitespace-pre-wrap">
                    {contenido()}
                  </pre>
                )}
              </Show>
            }>
              {(data) => (
                <div class="min-h-0 flex-1 rounded-md border border-border bg-surface-muted">
                  <Suspense fallback={null}>
                    {props.renderPdf({ base64: data(), name: props.rel })}
                  </Suspense>
                </div>
              )}
            </Show>
          </Show>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Quitar(props: { label: string; onClick: () => void }) {
  return (
    <Pressable
      class="absolute top-1 right-1 grid size-[1.125rem] place-items-center rounded-full bg-neutral-950 text-neutral-50 opacity-0 ring-2 ring-surface-raised transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
    >
      <X size={11} />
    </Pressable>
  );
}

/** La fila del compositor: los archivos que ya están y las cajas que todavía viajan. */
export function FilaDeAdjuntos(props: {
  rels: string[];
  ocultas: number[];
  cajas: { id: number; forma: "imagen" | "archivo" }[];
  miniatura: (rel: string) => Promise<string | null>;
  preview?: (rel: string) => Promise<Preview | null>;
  renderPdf: (props: { base64: string; name: string }) => JSX.Element;
  onQuitar: (rel: string) => void;
  onCancelar: (id: number) => void;
}) {
  const visibles = () => props.rels.filter((_, i) => !props.ocultas.includes(i));
  return (
    <Show when={visibles().length > 0 || props.cajas.length > 0}>
      <div
        class="flex gap-2 overflow-x-auto overflow-y-hidden px-1 pt-1 pb-1 select-none"
        onWheel={rodarEnHorizontal}
      >
        <For each={visibles()}>
          {(p) => (
            <div class="group relative shrink-0">
              <Adjunto rel={p} miniatura={props.miniatura} preview={props.preview} renderPdf={props.renderPdf} />
              <Quitar
                label={t("chat.attachments.remove", { name: nombreDe(p) })}
                onClick={() => props.onQuitar(p)}
              />
            </div>
          )}
        </For>
        <For each={props.cajas}>
          {(caja) => (
            <div class="group relative shrink-0">
              <EsqueletoDeAdjunto forma={caja.forma} />
              <Quitar label={t("chat.attachments.remove_pending")} onClick={() => props.onCancelar(caja.id)} />
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

/** El archivo que no se puede enseñar: se nombra. Mismas medidas que en la caja. */
function Tarjeta(props: { rel: string }) {
  return (
    <div
      class="flex h-14 w-[150px] items-center gap-2 rounded-md border border-border bg-neutral-100 px-2"
      title={nombreDe(props.rel)}
    >
      <span class="grid size-8 shrink-0 place-items-center rounded bg-surface">
        <FileText size={15} class="text-neutral-500" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-caption font-medium text-neutral-950">
          {nombreDe(props.rel)}
        </span>
        <span class="block text-2xs tracking-wide text-neutral-500 uppercase">
          {extensionDe(props.rel) || t("chat.attachments.file_type_unknown")}
        </span>
      </span>
    </div>
  );
}
