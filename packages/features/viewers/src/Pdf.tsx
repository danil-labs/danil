import { Show, createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import * as pdfjs from "pdfjs-dist";
import { EventBus, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import ZoomIn from "lucide-solid/icons/zoom-in";
import ZoomOut from "lucide-solid/icons/zoom-out";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { cn } from "../../../../apps/desktop/src/lib/utils";
import { IconButton } from "./IconButton";
import { clampZoom, ZOOM_STEP } from "./zoom";

pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();

function bytesFromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Una de las dos capas del visor: la que se ve y la que pinta el PDF siguiente detrás. */
type Capa = {
  container?: HTMLDivElement;
  frame?: HTMLDivElement;
  viewer?: PDFViewer;
  task: pdfjs.PDFDocumentLoadingTask | null;
};

/** Cuánto espera el cambio de capa a que las páginas a la vista estén pintadas. */
const TOPE_DEL_CAMBIO = 1500;

/** Las páginas de `capa` que caen en su hueco visible; en una presentación son varias. */
function paginasALaVista(capa: Capa): Set<number> {
  const vistas = new Set<number>();
  if (!capa.container || !capa.frame) return vistas;
  const arriba = capa.container.scrollTop;
  const abajo = arriba + capa.container.clientHeight;
  for (const pagina of capa.frame.querySelectorAll<HTMLElement>(".page[data-page-number]")) {
    const tope = pagina.offsetTop;
    if (tope < abajo && tope + pagina.offsetHeight > arriba) vistas.add(Number(pagina.dataset.pageNumber));
  }
  return vistas;
}

/** Un PDF pintado en la ventana: sin red, con los bytes ya en el data URL. */
export default function PdfDocument(props: { base64: string; name: string }) {
  let marco: HTMLDivElement | undefined;
  const capas: [Capa, Capa] = [{ task: null }, { task: null }];
  const [frente, setFrente] = createSignal<0 | 1>(0);
  const activa = () => capas[frente()];
  let base = 1;
  /** El ancho de la primera página a escala 1: con él se reajusta al cambiar el hueco. */
  let anchoDePagina = 0;
  let generation = 0;
  /** El hueco con el que se fijó la escala: si el ancho no cambia, la escala y el scroll se quedan. */
  let anchoAjustado = 0;

  const [zoom, setZoom] = createSignal(1);
  const [loading, setLoading] = createSignal(true);
  const [failed, setFailed] = createSignal(false);
  const [pages, setPages] = createSignal(0);

  function visor(capa: Capa): PDFViewer | undefined {
    if (capa.viewer || !capa.container || !capa.frame) return capa.viewer;
    capa.viewer = new PDFViewer({
      container: capa.container,
      viewer: capa.frame,
      eventBus: new EventBus(),
      textLayerMode: 1,
      removePageBorders: true,
      maxCanvasPixels: 4_000_000,
      enableDetailCanvas: false,
    });
    return capa.viewer;
  }

  // Un PDF que se reemplaza, como el de un documento que se recompila, se pinta en la capa
  // de detrás y solo pasa al frente con su página a la vista ya dibujada: nunca se ve en blanco.
  async function mount() {
    const g = ++generation;
    const delante = activa();
    const reemplaza = Boolean(delante.viewer?.pdfDocument);
    const lado = reemplaza ? ((1 - frente()) as 0 | 1) : frente();
    const destino = capas[lado];
    const v = visor(destino);
    if (!v || !destino.container) return;
    if (!reemplaza) {
      setLoading(true);
      setPages(0);
    }
    setFailed(false);
    const load = pdfjs.getDocument({ data: bytesFromBase64(props.base64) });
    try {
      const loaded = await load.promise;
      if (g !== generation) return void load.destroy();
      const first = await loaded.getPage(1);
      if (g !== generation) return void load.destroy();
      anchoDePagina = first.getViewport({ scale: 1 }).width;
      const width = (delante.container ?? destino.container).clientWidth - 32;
      base = width > 0 ? Math.min(1.5, width / anchoDePagina) : 1;
      anchoAjustado = width;
      await new Promise<void>((listo) => {
        const alIniciar = () => {
          v.eventBus.off("pagesinit", alIniciar);
          if (g !== generation) return listo();
          // Sin hueco medido (pestaña escondida) no se fija escala: la pone el observador al aparecer.
          if ((destino.container?.clientWidth ?? 0) > 0) v.currentScale = base * zoom();
          if (!reemplaza || !delante.container || !destino.container) return listo();
          destino.container.scrollTop = delante.container.scrollTop;
          destino.container.scrollLeft = delante.container.scrollLeft;
          const pendientes = paginasALaVista(destino);
          let hecho = false;
          const terminar = () => {
            if (hecho) return;
            hecho = true;
            v.eventBus.off("pagerendered", alPintar);
            clearTimeout(tope);
            listo();
          };
          const alPintar = (e: { pageNumber: number }) => {
            pendientes.delete(e.pageNumber);
            if (pendientes.size === 0) terminar();
          };
          v.eventBus.on("pagerendered", alPintar);
          const tope = setTimeout(terminar, TOPE_DEL_CAMBIO);
          v.update();
          if (pendientes.size === 0) terminar();
        };
        v.eventBus.on("pagesinit", alIniciar);
        v.setDocument(loaded);
      });
      if (g !== generation) return void load.destroy();
      const anterior = destino.task;
      destino.task = load;
      if (anterior) void anterior.destroy();
      setPages(loaded.numPages);
      if (reemplaza) {
        // Lo que se desplazó mientras se pintaba la capa de detrás también se conserva.
        if (delante.container && destino.container) {
          destino.container.scrollTop = delante.container.scrollTop;
          destino.container.scrollLeft = delante.container.scrollLeft;
        }
        setFrente(lado);
        delante.viewer?.setDocument(null!);
        void delante.task?.destroy();
        delante.task = null;
      }
      setLoading(false);
    } catch {
      void load.destroy();
      if (g === generation) {
        setLoading(false);
        setFailed(true);
      }
    }
  }

  createEffect(on(() => props.base64, () => void mount()));

  // Un PDF cargado con el visor escondido mide cero y no pinta; al aparecer, o al
  // mover el divisor, vuelve a ajustarse al ancho.
  let cuadro = 0;
  const ajustar = () => {
    cuadro = 0;
    const capa = activa();
    const width = (capa.container?.clientWidth ?? 0) - 32;
    if (!capa.viewer?.pdfDocument || !capa.container || !anchoDePagina || width <= 0) return;
    // Fijar la escala lleva el scroll al principio de la página actual: solo se hace si cambió el ancho.
    if (width !== anchoAjustado) {
      anchoAjustado = width;
      const proporcion = capa.container.scrollTop / Math.max(1, capa.container.scrollHeight);
      base = Math.min(1.5, width / anchoDePagina);
      capa.viewer.currentScale = base * zoom();
      capa.container.scrollTop = proporcion * capa.container.scrollHeight;
    }
    capa.viewer.update();
  };
  const observador = new ResizeObserver(() => {
    if (!cuadro) cuadro = requestAnimationFrame(ajustar);
  });
  onMount(() => marco && observador.observe(marco));
  onCleanup(() => {
    observador.disconnect();
    if (cuadro) cancelAnimationFrame(cuadro);
  });
  createEffect(on(zoom, () => {
    const v = activa().viewer;
    if (v?.pdfDocument) v.currentScale = base * zoom();
  }, { defer: true }));
  onCleanup(() => {
    generation++;
    for (const capa of capas) {
      capa.viewer?.setDocument(null!);
      void capa.task?.destroy();
    }
  });

  const change = (factor: number) => setZoom((z) => clampZoom(z * factor));

  // Ctrl o Cmd con la rueda acerca; el pellizco del trackpad llega igual. El punto
  // bajo el cursor se queda quieto, y sin `preventDefault` el webview hace zoom a toda la ventana.
  const rueda = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const container = activa().container;
    if (!container || !activa().viewer?.pdfDocument) return;
    const caja = container.getBoundingClientRect();
    const punto = { x: e.clientX - caja.left, y: e.clientY - caja.top };
    const antes = zoom();
    const paso = Math.min(ZOOM_STEP, Math.max(1 / ZOOM_STEP, Math.exp(-e.deltaY * 0.0025)));
    const despues = clampZoom(antes * paso);
    if (despues === antes) return;
    const x = container.scrollLeft + punto.x;
    const y = container.scrollTop + punto.y;
    setZoom(despues);
    container.scrollLeft = x * (despues / antes) - punto.x;
    container.scrollTop = y * (despues / antes) - punto.y;
  };

  const pintarCapa = (i: 0 | 1) => (
    <div
      ref={(el) => (capas[i].container = el)}
      onWheel={rueda}
      aria-hidden={frente() !== i}
      class={cn("absolute inset-0 overflow-auto p-4", frente() === i ? "z-10" : "pointer-events-none opacity-0")}
    >
      <div ref={(el) => (capas[i].frame = el)} class="pdfViewer" />
    </div>
  );

  return (
    <div class="flex h-full min-h-0 flex-col">
      <div class="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1">
        <IconButton label={t("code.file.image.zoom_out")} onClick={() => change(1 / ZOOM_STEP)}>
          <ZoomOut size={13} />
        </IconButton>
        <span class="min-w-11 text-center font-mono text-caption tabular-nums text-neutral-500">
          {Math.round(zoom() * 100)}%
        </span>
        <IconButton label={t("code.file.image.zoom_in")} onClick={() => change(ZOOM_STEP)}>
          <ZoomIn size={13} />
        </IconButton>
        <IconButton label={t("code.file.image.fit")} onClick={() => setZoom(1)}>
          <RotateCcw size={13} />
        </IconButton>
        <span class="ml-auto font-mono text-caption text-neutral-500">
          {t("code.file.pdf.pages", { count: pages(), n: pages() })}
        </span>
      </div>
      <div ref={marco} class="relative min-h-0 flex-1 bg-surface-muted">
        {pintarCapa(0)}
        {pintarCapa(1)}
        <Show when={failed() || loading()}>
          <p class="pointer-events-none absolute top-4 left-4 z-20 m-0 text-xs text-neutral-500">
            {failed() ? t("code.file.pdf.failed") : t("code.file.pdf.loading")}
          </p>
        </Show>
      </div>
    </div>
  );
}
