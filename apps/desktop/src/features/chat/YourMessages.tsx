import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { Popover, PopoverContent } from "../../ui/Popover";
import { RETARDO_TOOLTIP } from "../../ui/Tooltip";
import { cn } from "../../lib/utils";
import { modelBrand } from "../../lib/models";
import { MarcaAgente } from "../../ui/icons";
import { AstroAvatar } from "../projects/AstroAvatar";

/** Un input del hilo, con la identidad de quien lo envió si fue un agente. */
export type InputMessage = {
  block: number;
  text: string;
  sender?: { kind: "agent"; name: string } | { kind: "task"; agent: string; model?: string | null };
};

const TICK_PITCH = 11;
const RAIL_PADDING = 8;
/** Cuántas marcas caben a la vez: el riel es un carrusel, no una columna con todo el hilo. */
const VISIBLE = 15;
const CLOSE_DELAY = 200;
const WHEEL_QUIET = 300;
const PREVIEW_LENGTH = 100;

export default function YourMessages(props: {
  messages: InputMessage[];
  active: number;
  visibleHeight: number;
  onJump: (block: number) => void;
  bodyOf?: (name: string) => string | null;
  avatarOf?: (name: string) => string | null;
}) {
  const [open, setOpen] = createSignal(false);
  const [preview, setPreview] = createSignal(props.active);
  // La marca bajo el puntero, para agrandarla a ella y a sus vecinas.
  const [sobre, setSobre] = createSignal<number | null>(null);
  const cuenta = () => Math.min(VISIBLE, props.messages.length);
  const tope = () => Math.max(0, props.messages.length - cuenta());
  const centrada = (i: number) => Math.max(0, Math.min(tope(), i - Math.floor(cuenta() / 2)));
  const [inicio, setInicio] = createSignal(centrada(props.active));
  // La ventana sigue al mensaje en pantalla cuando este sale de ella.
  createEffect(on(() => [props.active, props.messages.length] as const, ([activo]) => {
    if (activo < inicio() || activo >= inicio() + cuenta()) setInicio(centrada(activo));
    else if (inicio() > tope()) setInicio(tope());
  }));
  const visibles = () => Array.from({ length: cuenta() }, (_, k) => inicio() + k);
  let openTimer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let lastWheel: number | null = null;
  let rail: HTMLButtonElement | undefined;
  let anchor: HTMLSpanElement | undefined;
  onCleanup(() => {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
  });

  const height = () => cuenta() * TICK_PITCH + RAIL_PADDING * 2;
  const top = () => Math.max(0, Math.round((props.visibleHeight - height()) / 2));
  const tickTop = (index: number) => RAIL_PADDING + Math.max(0, Math.min(cuenta() - 1, index - inicio())) * TICK_PITCH;
  const current = () => props.messages[Math.min(preview(), props.messages.length - 1)];
  const excerpt = () => current()?.text.slice(0, PREVIEW_LENGTH) ?? "";
  const indexAt = (e: { clientY: number }) => {
    const y = e.clientY - (rail?.getBoundingClientRect().top ?? 0) - RAIL_PADDING;
    return Math.max(0, Math.min(props.messages.length - 1, inicio() + Math.floor(y / TICK_PITCH)));
  };
  const cancelOpen = () => {
    clearTimeout(openTimer);
    openTimer = undefined;
  };
  const show = () => {
    clearTimeout(closeTimer);
    if (open()) return;
    cancelOpen();
    openTimer = setTimeout(() => {
      openTimer = undefined;
      setOpen(true);
    }, RETARDO_TOOLTIP);
  };
  const leave = () => {
    setSobre(null);
    lastWheel = null;
    cancelOpen();
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => setOpen(false), CLOSE_DELAY);
  };
  // La rueda recorre el carrusel; la vista previa sigue a la marca que queda bajo el puntero.
  const wheel = (e: WheelEvent) => {
    if (props.messages.length <= cuenta() || !e.deltaY) return;
    e.preventDefault();
    lastWheel = performance.now();
    setInicio((i) => Math.max(0, Math.min(tope(), i + Math.sign(e.deltaY))));
    const i = indexAt(e);
    setSobre(i);
    setPreview(i);
  };
  const movePointer = (e: PointerEvent) => {
    setPreview(indexAt(e));
    setSobre(indexAt(e));
    if (lastWheel !== null) {
      if ((!e.movementX && !e.movementY) || performance.now() - lastWheel < WHEEL_QUIET) return;
      lastWheel = null;
    }
    show();
  };
  const jump = () => {
    setOpen(false);
    if (current()) props.onJump(current().block);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    const next = e.key === "ArrowDown" ? Math.min(props.messages.length - 1, preview() + 1)
      : e.key === "ArrowUp" ? Math.max(0, preview() - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? props.messages.length - 1
      : null;
    if (next === null) return;
    e.preventDefault();
    setPreview(next);
    if (next < inicio() || next >= inicio() + cuenta()) setInicio(centrada(next));
    setOpen(true);
  };

  return (
    <div class="pointer-events-none sticky top-0 z-10 -mt-3 h-3">
      <Popover open={open()} onOpenChange={(next) => { if (!next) setOpen(false); }} anchorRef={() => anchor} placement="right" gutter={8}>
        <button
          ref={rail}
          type="button"
          class="pointer-events-auto absolute left-0 w-8 rounded-sm outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          style={{ top: `${top()}px`, height: `${height()}px` }}
          aria-label={`${t("chat.rail.label")}: ${excerpt()}`}
          aria-haspopup="dialog"
          aria-expanded={open()}
          onPointerEnter={movePointer}
          onPointerMove={movePointer}
          onPointerLeave={leave}
          onWheel={wheel}
          onFocus={() => { setPreview(props.active); setOpen(true); }}
          onKeyDown={key}
          onClick={(e) => { if (e.detail !== 0) setPreview(indexAt(e)); jump(); }}
        >
          <For each={visibles()}>
            {(i) => {
              // Con el puntero encima, la marca crece y sus vecinas un poco menos.
              const distancia = () => { const h = sobre(); return h === null ? null : Math.abs(i - h); };
              const ancho = () => {
                const d = distancia();
                const base = d === 0 ? 22 : d === 1 ? 17 : d === 2 ? 14 : 12;
                return i === props.active ? Math.max(base, 18) : base;
              };
              // Las del borde se desvanecen cuando el carrusel tiene más mensajes de ese lado.
              const borde = () => (i === inicio() && inicio() > 0) || (i === inicio() + cuenta() - 1 && inicio() < tope());
              return (
                <span
                  aria-hidden="true"
                  class={cn(
                    "riel-marca pointer-events-none absolute left-1 h-[3px] rounded-full",
                    distancia() === 0 ? "bg-neutral-950" : i === props.active ? "bg-neutral-700" : open() || sobre() !== null ? "bg-neutral-500" : "bg-neutral-300",
                    borde() && distancia() !== 0 && "opacity-40",
                  )}
                  style={{ top: `${RAIL_PADDING + (i - inicio()) * TICK_PITCH}px`, width: `${ancho()}px` }}
                />
              );
            }}
          </For>
        </button>
        <span ref={anchor} class="pointer-events-none absolute left-4 size-px" style={{ top: `${top() + tickTop(preview())}px` }} aria-hidden="true" />
        <PopoverContent
          class="pointer-events-none w-64 p-2"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div class="flex items-start gap-2">
            <p class="m-0 min-w-0 flex-1 text-ui leading-[1.4] break-words line-clamp-2">{excerpt()}</p>
            <Show when={current()?.sender}>
              {(sender) => (
                <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-200">
                  <Show when={sender().kind === "agent" ? sender() as { kind: "agent"; name: string } : null}
                    fallback={<MarcaAgente id={modelBrand((sender() as { kind: "task"; agent: string }).agent, (sender() as { kind: "task"; model?: string | null }).model)} size={14} />}>
                    {(agent) => <AstroAvatar name={agent().name} status="awake" body={props.bodyOf?.(agent().name)} avatar={props.avatarOf?.(agent().name)} size={24} />}
                  </Show>
                </span>
              )}
            </Show>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
