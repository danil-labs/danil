import { createSignal, Index, type JSX, onCleanup, onMount } from "solid-js";
import { t } from "../../../apps/desktop/src/lib/i18n";
import { ANCHO_MINIMO, anchosDeColumnas } from "./markdown-table";

const PASO_DE_TECLADO = 16;

const intrinseco = (valor: string) =>
  typeof CSS === "undefined" || CSS.supports?.("width", valor) ? valor : `-webkit-${valor}`;

/**
 * Tabla del markdown con columnas medidas por su contenido y bordes que la
 * persona arrastra. Después de arrastrar, la tabla conserva sus anchos aunque
 * cambie la ventana; doble clic en el borde vuelve al ajuste automático.
 */
export function MarkdownTable(props: { children: JSX.Element }) {
  let marco!: HTMLDivElement;
  let tabla!: HTMLTableElement;
  let grupo!: HTMLTableColElement;
  const [columnas, setColumnas] = createSignal(0);
  let anchos: number[] = [];
  let manual = false;
  let anchoVisto = -1;

  const fila = () => tabla.rows[0] as HTMLTableRowElement | undefined;
  const cols = () => Array.from(grupo.children) as HTMLTableColElement[];

  const aplicar = () => {
    const total = anchos.reduce((a, b) => a + b, 0);
    // Ajustada y cabiendo, en porcentajes: un cambio de ancho que no llegó a medirse
    // no deja hueco a la derecha ni corta la última columna.
    const proporcional = !manual && total !== 0 && marco.clientWidth >= total;
    cols().forEach((col, i) => {
      const ancho = anchos[i] ?? ANCHO_MINIMO;
      col.style.width = proporcional ? `${(ancho / total) * 100}%` : `${ancho}px`;
    });
    tabla.style.tableLayout = "fixed";
    tabla.style.width = proporcional ? "100%" : `${total}px`;
  };

  const ajustar = () => {
    const primera = fila();
    const disponible = marco.clientWidth;
    if (!primera || disponible <= 0) return;
    if (primera.cells.length !== columnas()) setColumnas(primera.cells.length);
    for (const col of cols()) col.style.width = "";
    const medir = () => Array.from(primera.cells, (celda) => celda.offsetWidth);
    tabla.style.tableLayout = "auto";
    tabla.style.width = intrinseco("max-content");
    // Un píxel de holgura: `offsetWidth` redondea y una línea justa se partiría.
    const maximos = medir().map((w) => w + 1);
    tabla.style.width = intrinseco("min-content");
    const minimos = medir();
    anchos = anchosDeColumnas(minimos, maximos, disponible);
    aplicar();
  };

  const indiceDe = (borde: Element) => (borde.closest("th") as HTMLTableCellElement | null)?.cellIndex ?? -1;

  const empezarArrastre = (e: PointerEvent) => {
    const borde = (e.target as Element).closest("[data-borde-columna]");
    const i = borde ? indiceDe(borde) : -1;
    if (!borde || i < 0 || e.button !== 0) return;
    e.preventDefault();
    if (anchos.length === 0) anchos = Array.from(fila()?.cells ?? [], (c) => c.offsetWidth);
    const inicio = anchos[i];
    const x0 = e.clientX;
    (borde as HTMLElement).setPointerCapture(e.pointerId);
    const mover = (m: PointerEvent) => {
      manual = true;
      anchos[i] = Math.max(ANCHO_MINIMO, Math.round(inicio + m.clientX - x0));
      aplicar();
    };
    const soltar = () => {
      borde.removeEventListener("pointermove", mover as EventListener);
      borde.removeEventListener("pointerup", soltar);
      borde.removeEventListener("pointercancel", soltar);
    };
    borde.addEventListener("pointermove", mover as EventListener);
    borde.addEventListener("pointerup", soltar);
    borde.addEventListener("pointercancel", soltar);
  };

  const teclear = (e: KeyboardEvent) => {
    const borde = (e.target as Element).closest("[data-borde-columna]");
    const i = borde ? indiceDe(borde) : -1;
    const delta = e.key === "ArrowRight" ? PASO_DE_TECLADO : e.key === "ArrowLeft" ? -PASO_DE_TECLADO : 0;
    if (i < 0 || delta === 0) return;
    e.preventDefault();
    if (anchos.length === 0) anchos = Array.from(fila()?.cells ?? [], (c) => c.offsetWidth);
    manual = true;
    anchos[i] = Math.max(ANCHO_MINIMO, anchos[i] + delta);
    aplicar();
  };

  const restablecer = (e: MouseEvent) => {
    if (!(e.target as Element).closest("[data-borde-columna]")) return;
    manual = false;
    ajustar();
  };

  onMount(() => {
    if (typeof ResizeObserver === "undefined" || typeof MutationObserver === "undefined") return;
    // Solo el ancho del marco: su alto cambia con cada ajuste de la tabla.
    const tamaño = new ResizeObserver(() => {
      if (marco.clientWidth === anchoVisto) return;
      anchoVisto = marco.clientWidth;
      if (!manual) ajustar();
    });
    // Mientras se escribe la respuesta entran filas y texto.
    const contenido = new MutationObserver((registros) => {
      if (manual || registros.every((r) => r.target === grupo)) return;
      ajustar();
    });
    tamaño.observe(marco);
    contenido.observe(tabla, { childList: true, subtree: true, characterData: true });
    onCleanup(() => {
      tamaño.disconnect();
      contenido.disconnect();
    });
  });

  return (
    <div
      ref={marco}
      class="my-3 max-w-full overflow-auto rounded-md border border-border bg-surface"
      onPointerDown={empezarArrastre}
      onKeyDown={teclear}
      onDblClick={restablecer}
    >
      <table ref={tabla} class="w-full border-collapse text-left text-[0.82rem] [overflow-wrap:break-word]">
        <colgroup ref={grupo}>
          <Index each={Array.from({ length: columnas() })}>{() => <col />}</Index>
        </colgroup>
        {props.children}
      </table>
    </div>
  );
}

/** El borde que se arrastra, dentro de cada encabezado. */
export function BordeDeColumna() {
  return (
    <span
      data-borde-columna
      role="separator"
      aria-orientation="vertical"
      aria-label={t("markdown.table.resize_column")}
      title={t("markdown.table.resize_column")}
      tabIndex={0}
      class="absolute inset-y-0 right-0 z-[1] w-1.5 cursor-col-resize touch-none outline-none hover:bg-primary/40 focus-visible:bg-primary/60"
    />
  );
}
