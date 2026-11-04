import { createSignal, lazy, Show, type JSX } from "solid-js";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import X from "lucide-solid/icons/x";
import { t } from "../lib/i18n";
import { Dialog, DialogContent, DialogTitle } from "./Dialog";

// Solo dentro del diálogo ampliado: no entra en la carga inicial.
const ZoomableImage = lazy(() => import("../features/viewers/ImageViewer"));
// El carrusel (embla) solo hace falta con varias imágenes: tampoco entra.
const ImageStrip = lazy(() => import("./ImageStrip"));

/**
 * La miniatura es una caja fija; el clic la abre con el zoom del visor.
 *
 * Sin la caja, la foto toma el ancho de la columna. `object-contain` mete el
 * bitmap entero ahí: `cover` recortaría una captura apaisada. La tira muestra
 * cuatro; el resto se desplaza en horizontal.
 */
export function EnlargeableImage(props: { src: string; alt?: string }) {
  return <CarruselDeImagenes srcs={[props.src]} alt={props.alt} />;
}

export function CarruselDeImagenes(props: { srcs: string[]; alt?: string }) {
  const [abierta, setAbierta] = createSignal(false);
  const [indice, setIndice] = createSignal(0);
  const total = () => props.srcs.length;
  const i = () => {
    const n = total();
    if (n === 0) return 0;
    const k = indice();
    return k < 0 ? 0 : k >= n ? n - 1 : k;
  };
  const src = () => props.srcs[i()] ?? "";
  const varias = () => total() > 1;
  const nombre = () => props.alt?.trim() || t("chat.image.title");
  const puesto = () => t("chat.image.position", { n: i() + 1, total: total() });
  const atras = () => {
    if (i() > 0) setIndice(i() - 1);
  };
  const adelante = () => {
    if (i() < total() - 1) setIndice(i() + 1);
  };
  return (
    <Show when={src()}>
      <Show
        when={varias()}
        fallback={
          <Miniatura
            src={src()}
            alt={nombre()}
            marcada={abierta()}
            onOpen={() => {
              setIndice(0);
              setAbierta(true);
            }}
          />
        }
      >
        <ImageStrip
          srcs={props.srcs}
          alt={nombre()}
          actual={i()}
          abierta={abierta()}
          onOpen={(index) => {
            setIndice(index);
            setAbierta(true);
          }}
        />
      </Show>
      <Dialog open={abierta()} onOpenChange={setAbierta}>
        <DialogContent
          class="flex h-[85vh] w-full max-w-[1100px] flex-col gap-2"
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Escape") e.stopPropagation();
            if (!varias()) return;
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              atras();
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              adelante();
            }
          }}
        >
          <div class="flex items-center justify-between gap-3">
            <DialogTitle class="min-w-0 truncate text-sm">
              {varias() ? puesto() : nombre()}
            </DialogTitle>
            <div class="flex shrink-0 items-center gap-1">
              <Dialog.CloseButton
                class="shrink-0 rounded p-1 hover:bg-surface-muted"
                aria-label={t("chat.attachments.close")}
              >
                <X size={18} />
              </Dialog.CloseButton>
            </div>
          </div>
          <div class="relative min-h-0 flex-1">
            <Show when={src()} keyed>
              {(fuente) => <ZoomableImage src={fuente} alt={nombre()} />}
            </Show>
            <Show when={varias()}>
              <Flecha
                label={t("chat.image.previous")}
                disabled={i() === 0}
                onClick={atras}
                class="absolute top-1/2 left-2 z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface/90 text-neutral-500 shadow-sm hover:bg-surface-muted disabled:opacity-40"
              >
                <ChevronLeft size={22} />
              </Flecha>
              <Flecha
                label={t("chat.image.next")}
                disabled={i() === total() - 1}
                onClick={adelante}
                class="absolute top-1/2 right-2 z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface/90 text-neutral-500 shadow-sm hover:bg-surface-muted disabled:opacity-40"
              >
                <ChevronRight size={22} />
              </Flecha>
            </Show>
          </div>
        </DialogContent>
      </Dialog>
    </Show>
  );
}

/** La miniatura sola: el botón que abre el diálogo. La tira repite este marcado. */
export function Miniatura(props: { src: string; alt: string; marcada: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      class="block size-48 rounded-md focus-visible:outline-2 focus-visible:outline-primary"
      title={t("chat.image.open")}
      aria-label={t("chat.image.open")}
      onClick={() => props.onOpen()}
    >
      <img
        src={props.src}
        alt={props.alt}
        class="size-48 rounded-md border border-border bg-surface object-contain"
        classList={{ "ring-2 ring-primary": props.marcada }}
      />
    </button>
  );
}

function Flecha(props: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  class?: string;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      class={
        props.class ??
        "grid size-7 place-items-center rounded-md text-neutral-500 hover:bg-surface-muted disabled:opacity-40"
      }
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
