import { Show, createEffect, createSignal, createUniqueId, onCleanup } from "solid-js";
import Maximize2 from "lucide-solid/icons/maximize-2";
import Minimize2 from "lucide-solid/icons/minimize-2";
import Minus from "lucide-solid/icons/minus";
import Plus from "lucide-solid/icons/plus";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import { temaPintado } from "./lib/theme";
import { t } from "./lib/i18n";
import { Button } from "./Button";
import { detalleDe } from "./Failure";
import { Dialog, DialogContent, DialogTitle } from "./Dialog";

type Mermaid = typeof import("mermaid").default;

function colores() {
  const estilo = getComputedStyle(document.documentElement);
  const color = (nombre: string) => estilo.getPropertyValue(`--color-${nombre}`).trim();

  return {
    primaryColor: color("surface"),
    primaryTextColor: color("neutral-950"),
    primaryBorderColor: color("neutral-300"),
    lineColor: color("neutral-700"),
    secondaryColor: color("surface-raised"),
    tertiaryColor: color("surface-muted"),
    clusterBkg: color("surface-muted"),
    clusterBorder: color("neutral-300"),
    mainBkg: color("surface"),
    nodeBorder: color("neutral-300"),
    edgeLabelBackground: color("surface-raised"),
    actorBkg: color("surface"),
    actorBorder: color("neutral-300"),
    actorTextColor: color("neutral-950"),
    actorLineColor: color("neutral-700"),
    signalColor: color("neutral-700"),
    signalTextColor: color("neutral-950"),
    labelBoxBkgColor: color("surface-raised"),
    labelBoxBorderColor: color("neutral-300"),
    labelTextColor: color("neutral-950"),
  };
}

export function MermaidDiagram(props: { definition: string }) {
  const id = `mermaid-${createUniqueId()}`;
  const [svg, setSvg] = createSignal("");
  const [error, setError] = createSignal("");
  const [recarga, setRecarga] = createSignal(0);
  const [ampliado, setAmpliado] = createSignal(false);
  const [escala, setEscala] = createSignal(1);
  const [desplazamiento, setDesplazamiento] = createSignal({ x: 0, y: 0 });
  let arrastre: { pointerId: number; x: number; y: number } | undefined;
  let extender: HTMLButtonElement | undefined;
  let version = 0;

  async function renderizar(actual: number) {
    setError("");
    try {
      const mermaid: Mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        theme: "base",
        fontFamily: "var(--font-sans)",
        themeVariables: colores(),
      });
      const resultado = await mermaid.render(`${id}-${actual}`, props.definition);
      if (actual === version) setSvg(resultado.svg);
    } catch (causa) {
      if (actual === version) {
        setSvg("");
        setError(detalleDe(causa));
      }
    }
  }

  createEffect(() => {
    props.definition;
    temaPintado();
    recarga();
    const actual = ++version;
    void renderizar(actual);
  });

  onCleanup(() => { version += 1; });

  function abrirVisor() {
    setEscala(1);
    setDesplazamiento({ x: 0, y: 0 });
    setAmpliado(true);
  }

  function cambiarEscala(siguiente: number) {
    setEscala(Math.min(4, Math.max(0.25, siguiente)));
  }

  function reiniciarVista() {
    setEscala(1);
    setDesplazamiento({ x: 0, y: 0 });
  }

  function acercarConRueda(evento: WheelEvent & { currentTarget: HTMLDivElement }) {
    evento.preventDefault();
    const anterior = escala();
    const siguiente = Math.min(4, Math.max(0.25, anterior * (evento.deltaY < 0 ? 1.15 : 1 / 1.15)));
    if (siguiente === anterior) return;

    const caja = evento.currentTarget.getBoundingClientRect();
    const x = evento.clientX - caja.left - caja.width / 2;
    const y = evento.clientY - caja.top - caja.height / 2;
    const previo = desplazamiento();
    const proporcion = siguiente / anterior;
    setDesplazamiento({
      x: previo.x + x * (1 - proporcion),
      y: previo.y + y * (1 - proporcion),
    });
    setEscala(siguiente);
  }

  return (
    <>
      <div class="group/mermaid relative my-3 overflow-auto rounded-md border border-border bg-surface-muted p-3 has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary">
      <div class="absolute top-2 right-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover/mermaid:opacity-100 group-focus-within/mermaid:opacity-100 [&:fullscreen]:opacity-100">
        <Button
          variant="outline"
          size="iconCompact"
          onClick={() => setRecarga((n) => n + 1)}
          title={t("markdown.diagram.reload")}
          aria-label={t("markdown.diagram.reload")}
        >
          <RefreshCw size={13} />
        </Button>
        <Button
          ref={extender}
          variant="outline"
          size="iconCompact"
          onClick={abrirVisor}
          title={t("markdown.diagram.expand")}
          aria-label={t("markdown.diagram.expand")}
        >
          <Maximize2 size={13} />
        </Button>
      </div>
      <Show
        when={svg()}
        fallback={
          <Show
            when={error()}
            fallback={<div class="min-h-24" aria-label={t("markdown.diagram.loading")} />}
          >
            {(fallo) => <pre class="m-0 text-xs text-error-strong whitespace-pre-wrap">{fallo()}</pre>}
          </Show>
        }
      >
        {(dibujo) => (
          <div
            class="min-w-max [&_svg]:block [&_svg]:max-w-none"
            innerHTML={dibujo()}
          />
        )}
      </Show>
      </div>
      <Dialog open={ampliado()} onOpenChange={setAmpliado}>
        {/* Toda la ventana de la app, no la pantalla del sistema: `fixed inset-0`
            saca la tarjeta del margen con que `DialogContent` centra. Sin
            `Dialog.Trigger`, Kobalte no sabe a quién devolver el foco. */}
        <DialogContent
          class="fixed inset-0 flex max-w-none flex-col gap-3 rounded-none border-0 p-3 shadow-none"
          onCloseAutoFocus={(evento) => {
            evento.preventDefault();
            extender?.focus();
          }}
        >
          <div class="flex items-center justify-between gap-3">
            <DialogTitle class="text-sm font-medium">{t("markdown.diagram.viewer")}</DialogTitle>
            <div class="flex items-center gap-1">
              <Button variant="outline" size="iconCompact" onClick={() => cambiarEscala(escala() / 1.25)} title={t("markdown.diagram.zoom_out")} aria-label={t("markdown.diagram.zoom_out")}>
                <Minus size={13} />
              </Button>
              <Button variant="outline" size="iconCompact" onClick={() => cambiarEscala(escala() * 1.25)} title={t("markdown.diagram.zoom_in")} aria-label={t("markdown.diagram.zoom_in")}>
                <Plus size={13} />
              </Button>
              <Button variant="outline" size="iconCompact" onClick={reiniciarVista} title={t("markdown.diagram.reset_view")} aria-label={t("markdown.diagram.reset_view")}>
                <RotateCcw size={13} />
              </Button>
              <Dialog.CloseButton
                as={Button}
                variant="outline"
                size="iconCompact"
                class="ml-1"
                title={t("markdown.diagram.close")}
                aria-label={t("markdown.diagram.close")}
              >
                <Minimize2 size={13} />
              </Dialog.CloseButton>
            </div>
          </div>
          <div
            class="min-h-0 flex-1 touch-none overflow-hidden rounded-md border border-border bg-surface-muted select-none"
            onWheel={acercarConRueda}
            onPointerDown={(evento) => {
              arrastre = { pointerId: evento.pointerId, x: evento.clientX, y: evento.clientY };
              evento.currentTarget.setPointerCapture(evento.pointerId);
            }}
            onPointerMove={(evento) => {
              if (!arrastre || arrastre.pointerId !== evento.pointerId) return;
              const previo = desplazamiento();
              setDesplazamiento({ x: previo.x + evento.clientX - arrastre.x, y: previo.y + evento.clientY - arrastre.y });
              arrastre = { ...arrastre, x: evento.clientX, y: evento.clientY };
            }}
            onPointerUp={(evento) => {
              if (arrastre?.pointerId === evento.pointerId) arrastre = undefined;
            }}
            onLostPointerCapture={() => { arrastre = undefined; }}
          >
            <div
              class="grid h-full w-full place-items-center cursor-grab active:cursor-grabbing [&_svg]:h-full! [&_svg]:w-full! [&_svg]:max-w-none!"
              style={{ transform: `translate(${desplazamiento().x}px, ${desplazamiento().y}px) scale(${escala()})` }}
              innerHTML={svg()}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
