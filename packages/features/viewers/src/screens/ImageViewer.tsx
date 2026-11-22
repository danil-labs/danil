import { createSignal } from "solid-js";
import ZoomIn from "lucide-solid/icons/zoom-in";
import ZoomOut from "lucide-solid/icons/zoom-out";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { IconButton } from "../../../../ui/src/IconButton";
import { clampZoom, offsetOnZoom, ZOOM_STEP } from "../../../../ui/src/lib/zoom";

/**
 * Una imagen con zoom y desplazamiento. La rueda acerca solo con ⌘/Ctrl —el
 * gesto del trackpad llega igual—, el arrastre mueve y el doble clic vuelve a
 * ajustar; sin eso una captura grande se ve a un tamaño fijo.
 */
export default function ZoomableImage(props: { src: string; alt: string }) {
  const [zoom, setZoom] = createSignal(1);
  const [pos, setPos] = createSignal({ x: 0, y: 0 });
  let box: HTMLDivElement | undefined;

  const zoomAt = (point: { x: number; y: number }, factor: number) => {
    const before = zoom();
    const after = clampZoom(before * factor);
    setPos((p) => offsetOnZoom(p, point, before, after));
    setZoom(after);
  };

  const wheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const r = box?.getBoundingClientRect();
    if (!r) return;
    const point = { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
    zoomAt(point, e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
  };

  const drag = (e: PointerEvent) => {
    const start = { x: e.clientX, y: e.clientY };
    const base = pos();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) =>
      setPos({ x: base.x + (m.clientX - start.x), y: base.y + (m.clientY - start.y) });
    const release = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
  };

  /**
   * El zoom se aplica a la caja, no a la `<img>`: así el desplazamiento no
   * depende del tamaño natural de la imagen y una que aún no cargó no se mueve
   * al llegar.
   */
  return (
    <div class="flex h-full min-h-0 flex-col">
      <div
        ref={box}
        onWheel={wheel}
        onPointerDown={drag}
        onDblClick={() => {
          setZoom(1);
          setPos({ x: 0, y: 0 });
        }}
        class="flex min-h-0 flex-1 cursor-grab items-center justify-center overflow-hidden active:cursor-grabbing"
      >
        <img
          src={props.src}
          alt={props.alt}
          draggable={false}
          class="max-h-full max-w-full object-contain"
          style={{
            transform: `translate(${pos().x}px, ${pos().y}px) scale(${zoom()})`,
            "transform-origin": "center",
          }}
        />
      </div>
      <div class="flex shrink-0 items-center justify-end gap-1 border-t border-border px-2 py-1">
        <IconButton label={t("code.file.image.zoom_out")} onClick={() => zoomAt({ x: 0, y: 0 }, 1 / ZOOM_STEP)}>
          <ZoomOut size={13} />
        </IconButton>
        <span class="min-w-11 text-center font-mono text-caption tabular-nums text-neutral-500">
          {Math.round(zoom() * 100)}%
        </span>
        <IconButton label={t("code.file.image.zoom_in")} onClick={() => zoomAt({ x: 0, y: 0 }, ZOOM_STEP)}>
          <ZoomIn size={13} />
        </IconButton>
        <IconButton
          label={t("code.file.image.fit")}
          onClick={() => {
            setZoom(1);
            setPos({ x: 0, y: 0 });
          }}
        >
          <RotateCcw size={13} />
        </IconButton>
      </div>
    </div>
  );
}
