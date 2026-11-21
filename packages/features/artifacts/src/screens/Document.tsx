import { Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import {
  formaDe,
  envolver,
  leerEstado,
  SANDBOX_ARTEFACTO,
  type Forma,
} from "../model/sandbox";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { flechaDeLista } from "../../../../../apps/desktop/src/lib/shortcuts";
import { Back, Next } from "../../../../ui/src/icons";
import { Button } from "../../../../ui/src/Button";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import ZoomIn from "lucide-solid/icons/zoom-in";
import ZoomOut from "lucide-solid/icons/zoom-out";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import { IconButton } from "../../../viewers/src/IconButton";
import { ZOOM_STEP } from "../../../viewers/src/zoom";

export default function Documento(props: {
  html: string;
  nombre: string;
  onFilas: (n: number) => void;
  /** Llena su caja sin hoja ni borde, como una web: la vista previa de un archivo en una carpeta de código. */
  aSangre?: boolean;
}) {
  let marco: HTMLIFrameElement | undefined;
  const forma = createMemo<Forma>(() => formaDe(props.html));
  const contenido = createMemo(() => envolver(props.html));
  const [pos, setPos] = createSignal({ i: 0, total: 0 });
  const [zoom, setZoom] = createSignal(1);
  const [encima, setEncima] = createSignal(false);
  // El marco aplica y topa el zoom; lo que vuelve en su estado es lo que se pinta.
  const acercar = (valor: number) => control("zoom", { valor });

  function control(accion: string, extra?: Record<string, unknown>) {
    marco?.contentWindow?.postMessage(
      { harness: "control", accion, ...extra },
      "*",
    );
  }

  onMount(() => {
    const alMensaje = (e: MessageEvent) => {
      if (e.source !== marco?.contentWindow) return;

      const estado = leerEstado(e.data);
      if (estado) {
        setPos({ i: estado.i, total: estado.total });
        setZoom(estado.zoom);
        props.onFilas(estado.filas);
        return;
      }

    };
    window.addEventListener("message", alMensaje);
    onCleanup(() => window.removeEventListener("message", alMensaje));

    // Con el foco en el marco, las teclas las atiende el runtime de adentro.
    const alTeclearZoom = (e: KeyboardEvent) => {
      if (!encima() || !(e.metaKey || e.ctrlKey) || e.altKey) return;
      if (e.key === "=" || e.key === "+") acercar(zoom() * ZOOM_STEP);
      else if (e.key === "-") acercar(zoom() / ZOOM_STEP);
      else if (e.key === "0") acercar(1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", alTeclearZoom);
    onCleanup(() => window.removeEventListener("keydown", alTeclearZoom));

  });

  createEffect(
    on(
      () => [forma(), pos().total] as const,
      ([f, total]) => {
        if (f !== "presentacion" || total === 0) return;
        const alTeclear = (e: KeyboardEvent) => {
          const el = e.target;
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
            return;
          if (!flechaDeLista(e)) return;
          if (e.key === "ArrowRight") control("siguiente");
          else if (e.key === "ArrowLeft") control("anterior");
          else return;
          e.preventDefault();
        };
        window.addEventListener("keydown", alTeclear);
        onCleanup(() => window.removeEventListener("keydown", alTeclear));
      },
    ),
  );

  const presentacion = () => forma() === "presentacion" && pos().total > 0;

  /* Qué ocupa el marco dentro del panel, que es una decisión de la app y no del
     documento: es la única que sabe cuánto espacio hay, y es la única que el
     HTML del agente no puede pisar —dentro del marco su CSS gana al nuestro, y
     un `body { margin: 0 }` suyo dejaría la hoja pegada a la izquierda—.

     Un documento es una hoja: tiene su medida y el panel crece por detrás. Una
     presentación y una tabla no: llenan lo que haya. Una presentación declarada
     sin diapositivas cae aquí como hoja, que es como se ve.

     Y una web no lleva marco de ninguna clase: ni borde, ni esquina redondeada,
     ni medida. Un sitio con un recuadro alrededor se lee como una vista previa
     de un sitio, no como el sitio. */
  const clase = () =>
    cn(
      "w-full flex-1 border border-border bg-surface-raised",
      forma() === "web" || props.aSangre
        ? "min-h-0 rounded-none border-0"
        : presentacion()
          ? "min-h-artifact-presentation rounded-t-md rounded-b-none border-b-0"
          : forma() === "tabla"
            ? "min-h-artifact-preview rounded-md"
            : "mx-auto min-h-artifact-preview max-w-artifact-document rounded-md",
    );

  return (
    <>
      <div
        class="relative flex min-h-0 flex-1 flex-col"
        onPointerEnter={() => setEncima(true)}
        onPointerLeave={() => setEncima(false)}
      >
      <iframe
        ref={marco}
        class={clase()}
        // Un documento nuevo en el marco nace en 100 %: se le devuelve el zoom.
        onLoad={() => zoom() !== 1 && acercar(zoom())}
        title={props.nombre}
        /* Los dos candados de este lado van juntos y en el mismo sitio a
           propósito: sin `allow-same-origin` el documento no alcanza nada de la
           app, y la política que `envolver` mete adentro le corta la red. El
           tercero vive en `index.html`. Ver `lib/sandbox.ts`. */
        sandbox={SANDBOX_ARTEFACTO}
        srcdoc={contenido()}
      />
        <div class="absolute top-2 right-2 flex items-center gap-0.5 rounded-md border border-border bg-surface-raised/95 px-1 py-0.5 shadow-sm">
          <IconButton label={t("code.file.image.zoom_out")} onClick={() => acercar(zoom() / ZOOM_STEP)}>
            <ZoomOut size={13} />
          </IconButton>
          <span class="min-w-10 text-center font-mono text-caption tabular-nums text-neutral-500">
            {Math.round(zoom() * 100)}%
          </span>
          <IconButton label={t("code.file.image.zoom_in")} onClick={() => acercar(zoom() * ZOOM_STEP)}>
            <ZoomIn size={13} />
          </IconButton>
          <IconButton label={t("code.file.image.fit")} onClick={() => acercar(1)}>
            <RotateCcw size={13} />
          </IconButton>
        </div>
      </div>

      <Show when={presentacion()}>
        <div
          class={cn(
            "flex items-center justify-center gap-2.5 border-border bg-surface-muted p-1.5",
            props.aSangre ? "border-t" : "rounded-b-md border border-t-0",
          )}
        >
          <Button
            variant="ghost"
            size="iconCompact"
            class="shrink-0 text-neutral-500 hover:bg-surface-muted"
            onClick={() => control("anterior")}
            disabled={pos().i === 0}
            aria-label={t("artifacts.slide.prev")}
            title={
              pos().i === 0
                ? t("artifacts.slide.first")
                : t("artifacts.slide.prev.title")
            }
          >
            <Back size={13} />
          </Button>
          <span class="min-w-14 text-center font-mono text-xs text-neutral-500 tabular-nums">
            {pos().i + 1} / {pos().total}
          </span>
          <Button
            variant="ghost"
            size="iconCompact"
            class="shrink-0 text-neutral-500 hover:bg-surface-muted"
            onClick={() => control("siguiente")}
            disabled={pos().i === pos().total - 1}
            aria-label={t("artifacts.slide.next")}
            title={
              pos().i === pos().total - 1
                ? t("artifacts.slide.last")
                : t("artifacts.slide.next.title")
            }
          >
            <Next size={13} />
          </Button>
        </div>
      </Show>
    </>
  );
}
