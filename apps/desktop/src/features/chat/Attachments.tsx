import { createResource, createSignal, Show, For, Suspense, lazy } from "solid-js";
import { invoke } from "../../lib/invoke.ts";
import X from "lucide-solid/icons/x";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import FileText from "lucide-solid/icons/file-text";
import { t } from "../../lib/i18n";
import { extensionDe, nombreDe } from "../../lib/steps";
import type { Preview } from "../artifacts/Preview";

/** Baja al abrirse: `pdfjs-dist` no entra en el arranque de la ventana. */
const PdfDocument = lazy(() => import("../viewers/Pdf"));

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
}) {
  return (
    <div class="mb-2 flex gap-2 overflow-x-auto overflow-y-hidden pb-1" onWheel={rodarEnHorizontal}>
      <For each={props.rels}>
        {(rel) => (
          <div class="shrink-0">
            <Adjunto rel={rel} miniatura={props.miniatura} preview={props.preview} />
          </div>
        )}
      </For>
    </div>
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
        await invoke("open_external", { target: props.rel });
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
      <button
        type="button"
        class="block max-w-full rounded-md text-left focus-visible:outline-2 focus-visible:outline-primary"
        title={t("chat.attachments.open", { name: nombreDe(props.rel) })}
        aria-label={t("chat.attachments.open", { name: nombreDe(props.rel) })}
        onClick={() => void abrir()}
      >
        <Show when={imagen()} fallback={<Tarjeta rel={props.rel} />}>
          {(src) => (
            <img
              src={src()}
              alt={nombreDe(props.rel)}
              class="size-14 rounded-md border border-border object-cover"
            />
          )}
        </Show>
      </button>
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
                    <PdfDocument base64={data()} name={props.rel} />
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
