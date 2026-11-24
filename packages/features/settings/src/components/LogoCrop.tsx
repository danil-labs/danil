import { createEffect, createSignal, onCleanup } from "solid-js";
import { Button } from "../../../../ui/src/Button";
import { Dialog, DialogContent, DialogTitle } from "../../../../ui/src/Dialog";
import { t } from "../../../../ui/src/lib/i18n";
import { Input } from "../../../../ui/src/Input";
import {
  LOGO_MAX,
  MARCO,
  SALIDAS,
  bytesDeBase64,
  centrar,
  limitar,
  medidas,
  origenDelCanvas,
} from "../model/logo-crop";

/**
 * El cuadrado que va a la columna. Sin él, `object-cover` se queda con el
 * centro y una marca ancha se parte.
 */
export function LogoCrop(props: {
  src: string | null;
  saving: boolean;
  onCancel: () => void;
  onUse: (pngBase64: string) => void;
}) {
  const [ancho, setAncho] = createSignal(0);
  const [alto, setAlto] = createSignal(0);
  const [zoom, setZoom] = createSignal(1);
  const [ox, setOx] = createSignal(0);
  const [oy, setOy] = createSignal(0);
  let imagen: HTMLImageElement | undefined;
  let arrastre: { x: number; y: number; ox: number; oy: number } | null = null;

  function colocar(z: number) {
    const m = medidas(ancho(), alto(), z);
    setOx(centrar(m.w));
    setOy(centrar(m.h));
    setZoom(z);
  }

  createEffect(() => {
    const src = props.src;
    if (!src) return;
    let vigente = true;
    onCleanup(() => {
      vigente = false;
    });
    const img = new Image();
    img.onload = () => {
      if (!vigente) return;
      imagen = img;
      setAncho(img.naturalWidth);
      setAlto(img.naturalHeight);
      colocar(1);
    };
    img.src = src;
  });

  function mover(dx: number, dy: number) {
    if (ancho() <= 0 || alto() <= 0) return;
    const m = medidas(ancho(), alto(), zoom());
    setOx(limitar(ox() + dx, m.w));
    setOy(limitar(oy() + dy, m.h));
  }

  function acercar(z: number) {
    if (ancho() <= 0 || alto() <= 0) return;
    const antes = medidas(ancho(), alto(), zoom());
    const siguiente = Math.min(4, Math.max(1, z));
    const despues = medidas(ancho(), alto(), siguiente);
    const px = (MARCO / 2 - ox()) / antes.w;
    const py = (MARCO / 2 - oy()) / antes.h;
    setZoom(siguiente);
    setOx(limitar(MARCO / 2 - px * despues.w, despues.w));
    setOy(limitar(MARCO / 2 - py * despues.h, despues.h));
  }

  function usar() {
    const img = imagen;
    if (!img) return;
    const o = origenDelCanvas(ancho(), alto(), zoom(), ox(), oy());
    for (const lado of SALIDAS) {
      const canvas = document.createElement("canvas");
      canvas.width = lado;
      canvas.height = lado;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, o.sx, o.sy, o.sw, o.sh, 0, 0, lado, lado);
      const url = canvas.toDataURL("image/png");
      const coma = url.indexOf(",");
      if (coma < 0) return;
      const png = url.slice(coma + 1);
      if (bytesDeBase64(png) <= LOGO_MAX || lado === SALIDAS[SALIDAS.length - 1]) return props.onUse(png);
    }
  }

  const vista = () => medidas(ancho(), alto(), zoom());

  return (
    <Dialog
      open={props.src !== null}
      onOpenChange={(abierto) => {
        if (!abierto && !props.saving) props.onCancel();
      }}
    >
      <DialogContent class="max-w-[360px]">
        <DialogTitle class="text-sm font-semibold">{t("settings.workspaces.logo.crop_title")}</DialogTitle>
        <p class="mt-2 mb-3 text-xs leading-5 text-neutral-500">{t("settings.workspaces.logo.crop_hint")}</p>
        <div
          class="relative mx-auto size-60 touch-none overflow-hidden rounded-lg border border-border bg-neutral-100"
          tabIndex={0}
          role="application"
          aria-label={t("settings.workspaces.logo.crop_title")}
          onPointerDown={(e) => {
            if (props.saving) return;
            arrastre = { x: e.clientX, y: e.clientY, ox: ox(), oy: oy() };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const a = arrastre;
            if (!a) return;
            const m = medidas(ancho(), alto(), zoom());
            setOx(limitar(a.ox + (e.clientX - a.x), m.w));
            setOy(limitar(a.oy + (e.clientY - a.y), m.h));
          }}
          onPointerUp={() => {
            arrastre = null;
          }}
          ref={(el) => {
            const rueda = (e: WheelEvent) => {
              e.preventDefault();
              acercar(zoom() + (e.deltaY < 0 ? 0.08 : -0.08));
            };
            el.addEventListener("wheel", rueda, { passive: false });
          }}
          onKeyDown={(e) => {
            const paso = e.shiftKey ? 24 : 8;
            if (e.key === "ArrowLeft") mover(paso, 0);
            else if (e.key === "ArrowRight") mover(-paso, 0);
            else if (e.key === "ArrowUp") mover(0, paso);
            else if (e.key === "ArrowDown") mover(0, -paso);
            else if (e.key === "+" || e.key === "=") acercar(zoom() + 0.15);
            else if (e.key === "-" || e.key === "_") acercar(zoom() - 0.15);
            else return;
            e.preventDefault();
          }}
        >
          <img
            src={props.src ?? undefined}
            alt=""
            draggable={false}
            class="pointer-events-none absolute max-w-none select-none"
            style={{
              width: `${vista().w}px`,
              height: `${vista().h}px`,
              left: `${ox()}px`,
              top: `${oy()}px`,
            }}
          />
        </div>
        <label class="mt-3 flex items-center gap-2 text-xs text-neutral-500">
          <span class="shrink-0">{t("settings.workspaces.logo.zoom")}</span>
          <Input
            type="range"
            min="1"
            max="4"
            step="0.01"
            variant="range"
            class="w-full"
            value={zoom()}
            disabled={props.saving || ancho() === 0}
            onInput={(e) => acercar(Number(e.currentTarget.value))}
          />
        </label>
        <div class="mt-4 flex justify-end gap-2">
          <Button variant="outline" disabled={props.saving} onClick={() => props.onCancel()}>
            {t("settings.workspaces.logo.cancel")}
          </Button>
          <Button disabled={props.saving || ancho() === 0} onClick={usar}>
            {t("settings.workspaces.logo.use")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
