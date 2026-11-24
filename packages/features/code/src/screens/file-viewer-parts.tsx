import { For, Show, Suspense, createMemo, type JSX } from "solid-js";
import { Button } from "../../../../ui/src/Button";
import { Markdown } from "../../../../ui/src/Markdown";
import Documento from "../../../../ui/src/Document";
import { formaDe } from "../../../../ui/src/lib/sandbox";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { setMoviendoHueco } from "../../../../ui/src/lib/sites";
import { sangriaDe } from "../model/indent";
import { IconoDeArchivo } from "../../../../ui/src/FileIcon";
import { delimiterFor } from "../../../../ui/src/lib/csv";
import { type Visores, recordarReparto, reparto, esHtml } from "./file-viewer-model";

/** El tirador entre el código y la vista previa. Con el puntero capturado, el PDF o el marco de al lado no se lo quedan. */
function Divisor(props: { fila: () => HTMLDivElement | undefined }) {
  const mover = (fraccion: number) => recordarReparto(Math.min(0.8, Math.max(0.2, fraccion)));
  return (
    <div
      role="separator"
      tabindex={0}
      aria-label={t("code.file.layout.resize")}
      aria-orientation="vertical"
      aria-valuemin={20}
      aria-valuemax={80}
      aria-valuenow={Math.round(reparto() * 100)}
      class="group/divisor relative z-10 w-0 shrink-0 cursor-col-resize outline-none"
      onPointerDown={(e) => {
        const caja = props.fila()?.getBoundingClientRect();
        if (!caja || caja.width === 0) return;
        e.preventDefault();
        const tirador = e.currentTarget;
        tirador.setPointerCapture(e.pointerId);
        setMoviendoHueco(true);
        const seguir = (ev: PointerEvent) => mover((ev.clientX - caja.left) / caja.width);
        const soltar = () => {
          setMoviendoHueco(false);
          tirador.removeEventListener("pointermove", seguir);
          tirador.removeEventListener("pointerup", soltar);
          tirador.removeEventListener("pointercancel", soltar);
        };
        tirador.addEventListener("pointermove", seguir);
        tirador.addEventListener("pointerup", soltar);
        tirador.addEventListener("pointercancel", soltar);
      }}
      onDblClick={() => mover(0.5)}
      onKeyDown={(e) => {
        const paso = e.key === "ArrowRight" ? 0.02 : e.key === "ArrowLeft" ? -0.02 : 0;
        if (!paso) return;
        e.preventDefault();
        mover(reparto() + paso);
      }}
    >
      <span
        aria-hidden="true"
        class="absolute inset-y-0 -left-[3px] w-[7px] transition-colors duration-150 ease-out group-hover/divisor:bg-primary/40 group-focus-visible/divisor:bg-primary/40"
      />
    </div>
  );
}

/** La ruta partida en carpetas y el nombre. Las carpetas se recortan por la izquierda: lo cercano al archivo es lo que distingue. */
function Migas(props: { ruta: string; children: JSX.Element }) {
  const partes = () => props.ruta.split(/[/\\]/).filter(Boolean);
  const nombre = () => partes().at(-1) ?? props.ruta;
  const carpetas = () => partes().slice(0, -1);
  return (
    <nav aria-label={t("code.file.path")} title={props.ruta} class="flex min-w-0 flex-1 items-center gap-1 text-xs text-neutral-500">
      <Show when={carpetas().length > 0}>
        <span dir="rtl" class="min-w-0 truncate text-left">
          <bdi>
            <For each={carpetas()}>
              {(carpeta) => (
                <>
                  {carpeta}
                  <span aria-hidden="true" class="px-1 opacity-70">›</span>
                </>
              )}
            </For>
          </bdi>
        </span>
      </Show>
      <span class="inline-flex shrink-0 items-center gap-1.5 font-medium text-neutral-950">
        <IconoDeArchivo ruta={props.ruta} class="shrink-0" />
        {nombre()}
      </span>
      {props.children}
    </nav>
  );
}

/** Lo pulsado se marca como el conmutador Agentes · Tareas: `secondary` pulsado, `ghost` suelto. */
function BotonDeBarra(props: { pulsado: boolean; titulo: string; onClick: () => void; class?: string; children: JSX.Element }) {
  return (
    <Button
      variant={props.pulsado ? "secondary" : "ghost"}
      size="compact"
      aria-pressed={props.pulsado}
      title={props.titulo}
      onClick={() => props.onClick()}
      class={cn("shrink-0 gap-1.5", !props.pulsado && "text-neutral-500 hover:text-neutral-950", props.class)}
    >
      {props.children}
    </Button>
  );
}

/** Lo que se ve del archivo: una tabla si es tabular, su HTML en el marco de los artefactos o su Markdown pintado. */
function Previa(props: { texto: string; ruta: string; aSangre: boolean; visores: Visores }) {
  const delim = () => delimiterFor(props.ruta);
  return (
    <Show
      when={delim()}
      fallback={
        <Show
          when={esHtml(props.ruta)}
          fallback={
            <div class="p-4">
              <Markdown>{props.texto}</Markdown>
            </div>
          }
        >
          <div
            class={cn(
              "flex min-h-0 flex-1 flex-col",
              !props.aSangre && formaDe(props.texto) !== "web" && "px-4 py-3",
            )}
          >
            <Documento html={props.texto} nombre={props.ruta} onFilas={() => {}} aSangre={props.aSangre} />
          </div>
        </Show>
      }
    >
      {(d) => (
        <Suspense fallback={<p class="m-0 p-3 text-xs text-neutral-500">{t("code.file.opening")}</p>}>
          {props.visores.tabla({ text: props.texto, delim: d() })}
        </Suspense>
      )}
    </Show>
  );
}

function BarraDeEstado(props: {
  cursor: { linea: number; columna: number } | null;
  texto: string;
  lenguaje: string | null;
}) {
  const sangria = createMemo(() => sangriaDe(props.texto));
  const finDeLinea = () => (props.texto.includes("\r\n") ? "CRLF" : "LF");
  return (
    <div
      role="group"
      aria-label={t("code.status.label")}
      class="flex h-6 shrink-0 items-center justify-end gap-3 border-t border-border px-3 text-caption text-neutral-500"
    >
      <Show when={props.cursor}>
        {(c) => <span class="font-mono tabular-nums">{t("code.status.position", { linea: c().linea, columna: c().columna })}</span>}
      </Show>
      <span>
        {sangria() === "\t"
          ? t("code.status.indent.tab")
          : t("code.status.indent.spaces", { count: sangria().length })}
      </span>
      <span>UTF-8</span>
      <span>{finDeLinea()}</span>
      <span>{props.lenguaje ?? t("code.status.plain")}</span>
    </div>
  );
}

export { Divisor, Migas, BotonDeBarra, Previa, BarraDeEstado };
