import { Index, type JSX } from "solid-js";
import { dividerSpan, gridTracks } from "../../../ui/src/lib/panels";
import { cn } from "../../../../apps/desktop/src/lib/utils";

/**
 * El espacio principal como una **cuadrícula de ventanas** (`lib/panels.ts`),
 * con un divisor arrastrable entre cada dos columnas y entre cada dos filas.
 *
 * **Las ventanas no son hijas de este componente: son sus hermanas.** Lo que
 * entra por `children` son los nodos de `App.tsx` —una conversación por tarea
 * abierta, un visor por documento y las tiras de pestañas—, y lo único que este
 * contenedor pone es la cuadrícula, los divisores y la mecánica del arrastre. En
 * qué celda cae cada uno lo deciden `grid-column` y `grid-row`, que los calcula
 * `App.tsx`.
 *
 * **De ahí cuelga todo lo demás.** Mover cada visor dentro del panel que le toca
 * lo desmonta y lo vuelve a montar: en Solid un nodo del DOM puesto en otro
 * sitio se MUEVE (`SYSTEM.md` § Las reglas de Solid, 9), y `For` limpia sus
 * filas quitándolas del padre en el que las metió. Costaría volver a pedir el
 * archivo, perder el desplazamiento y perder lo escrito sin guardar — justo lo
 * que `App.tsx` mantiene montado para no perder. Con la cuadrícula el padre
 * nunca cambia, y eso es lo que hace posible **arrastrar una pestaña entre
 * ventanas** sin perder lo que llevara dentro.
 *
 * **`grid` y no un `flex` con `order`:** `order` es de una sola dimensión —un
 * `flex` en fila no puede apilar dos hijos— y la salida obvia, anidar un `flex`
 * vertical por columna, es la prohibida, porque anidar cambia el padre y cambiar
 * el padre desmonta. La cuadrícula coloca en dos ejes sin que los hijos dejen de
 * ser hermanos planos del mismo padre.
 *
 * **Las pistas:** `anchos` y `altos` llegan en fracciones que suman uno y se
 * intercalan con una pista de `GROSOR` píxeles por divisor (`0.5fr 12px 0.5fr`).
 * Las `fr` reparten lo que queda después de restar los divisores, así que el
 * tirador no le roba ancho a nadie por debajo de la mesa. La columna `c` cae en
 * la pista CSS `2c + 1` y el divisor que la sigue en la `2c + 2`; las filas
 * igual.
 *
 * **El divisor horizontal no cruza lo que no está partido.** `filasPorColumna`
 * dice cuántas ventanas tiene cada columna: una con una sola celda se estira
 * hasta abajo, y pintarle encima una línea diría que está partida. El divisor de
 * la fila `i` abarca solo hasta la última columna con más de `i + 1` ventanas.
 * Con una columna sin partir **en medio** de dos partidas el tramo la cruzaría
 * igual; hoy no puede pasar porque `MAX_COLUMNAS` es 2, y quien suba ese tope
 * necesita un divisor por tramo en vez de uno por fila.
 *
 * **`grid-row` y `grid-column` van como cadena.** `style` con un objeto acaba en
 * `setProperty`, que quiere una cadena; un número sin convertir deja la celda en
 * la posición automática —todas apiladas en la primera— sin dar ningún error.
 *
 * **Lo que reordena se ve, no se lee.** El orden del DOM sigue siendo el de la
 * tira, así que el tabulador y un lector de pantalla recorren los paneles en ese
 * orden y no de izquierda a derecha. Cambiarlo no es un `tabindex`: es mover los
 * nodos de verdad, y eso vuelve a costar el desmontaje de arriba.
 */

export default function Paneles(props: {
  /** El ancho de cada columna, en fracciones que suman uno. */
  anchos: number[];
  /** El alto de cada fila, en fracciones que suman uno. */
  altos: number[];
  /** Cuántas celdas tiene cada columna, para saber dónde cruza el divisor. */
  filasPorColumna: number[];
  /** El ancho por debajo del cual un panel deja de servir, en píxeles. */
  minimoAncho: number;
  /** Y el alto. */
  minimoAlto: number;
  /** Cómo se nombra un divisor vertical para quien no lo ve. */
  etiquetaAncho: string;
  /** Y uno horizontal. */
  etiquetaAlto: string;
  onRepartirAncho: (i: number, antes: number, despues: number) => void;
  onRepartirAlto: (i: number, antes: number, despues: number) => void;
  children: JSX.Element;
}) {
  let caja: HTMLDivElement | undefined;

  /**
   * Reparte lo que suman dos pistas vecinas, respetando el mínimo por los dos
   * lados.
   *
   * **Con la ventana muy estrecha —o muy baja— los dos mínimos no caben**, y
   * entonces el clamp de siempre —`max(min, min(suma − min, x))`— deja de tener
   * sentido: los dos topes se cruzan y el resultado depende del orden en que se
   * apliquen. Ahí se parte por la mitad, que es lo único simétrico.
   */
  const repartir = (
    vertical: boolean,
    i: number,
    suma: number,
    deseado: number,
  ) => {
    const total = vertical
      ? (caja?.clientHeight ?? 0)
      : (caja?.clientWidth ?? 0);
    const minimo = vertical ? props.minimoAlto : props.minimoAncho;
    const min = total > 0 ? minimo / total : 0;
    const antes =
      suma < min * 2 ? suma / 2 : Math.min(suma - min, Math.max(min, deseado));
    const aplicar = vertical ? props.onRepartirAlto : props.onRepartirAncho;
    aplicar(i, antes, suma - antes);
  };

  /**
   * **Componente y no una variable con JSX**: se construye uno por divisor, y
   * en Solid un nodo guardado en una variable se movería del primer sitio al
   * segundo en vez de copiarse (`SYSTEM.md` § Las reglas de Solid, 9).
   */
  const Divisor = (d: { i: number; vertical: boolean }) => {
    const tamanos = () => (d.vertical ? props.altos : props.anchos);
    const suma = () => tamanos()[d.i] + tamanos()[d.i + 1];
    /** Cuánto del hueco de los dos se lleva el primero, en porciento. */
    const reparto = () => Math.round((tamanos()[d.i] / suma()) * 100);
    /**
     * De dónde a dónde va. El vertical cruza la cuadrícula entera; el
     * horizontal, solo el tramo de columnas que están partidas en esta línea.
     */
    const sitio = () =>
      dividerSpan(d.i, d.vertical, props.filasPorColumna);

    return (
      <div
        role="separator"
        tabindex={0}
        aria-label={d.vertical ? props.etiquetaAlto : props.etiquetaAncho}
        aria-orientation={d.vertical ? "horizontal" : "vertical"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={reparto()}
        style={sitio()}
        class={cn(
          "group/divisor relative z-40 flex items-center justify-center bg-transparent",
          d.vertical ? "cursor-row-resize" : "cursor-col-resize",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neutral-500",
        )}
        onPointerDown={(e) => {
          e.preventDefault();
          const total = d.vertical
            ? (caja?.clientHeight ?? 0)
            : (caja?.clientWidth ?? 0);
          if (!total) return;
          const inicio = d.vertical ? e.clientY : e.clientX;
          const desde = tamanos()[d.i];
          const junto = suma();
          const mover = (ev: PointerEvent) =>
            repartir(
              d.vertical,
              d.i,
              junto,
              desde + ((d.vertical ? ev.clientY : ev.clientX) - inicio) / total,
            );
          const soltar = () => {
            window.removeEventListener("pointermove", mover);
            window.removeEventListener("pointerup", soltar);
          };
          window.addEventListener("pointermove", mover);
          window.addEventListener("pointerup", soltar);
        }}
        // Doble clic iguala los dos, que es la salida cuando se arrastró de más
        // y no se sabe a cuánto estaba.
        onDblClick={() => {
          const aplicar = d.vertical
            ? props.onRepartirAlto
            : props.onRepartirAncho;
          aplicar(d.i, suma() / 2, suma() / 2);
        }}
        // Un `separator` que se puede enfocar tiene que poder moverse con el
        // teclado: es lo que pide el patrón ARIA de *window splitter*, y sin
        // ello el `tabindex` solo sirve para atascar la tabulación. Cada
        // orientación escucha su propio par de flechas.
        onKeyDown={(e) => {
          const menos = d.vertical ? "ArrowUp" : "ArrowLeft";
          const mas = d.vertical ? "ArrowDown" : "ArrowRight";
          const salto = e.key === mas ? 0.02 : e.key === menos ? -0.02 : 0;
          if (!salto) return;
          e.preventDefault();
          repartir(d.vertical, d.i, suma(), tamanos()[d.i] + salto);
        }}
      >
        <span
          aria-hidden="true"
          class={cn(
            "pointer-events-none absolute rounded-full bg-border transition-colors duration-150 ease-out",
            "group-hover/divisor:bg-primary group-focus-visible/divisor:bg-primary",
            d.vertical ? "h-px w-full" : "h-full w-px",
          )}
        />
      </div>
    );
  };

  return (
    <div
      ref={caja}
      class="relative grid min-h-0 min-w-0 flex-1"
      style={{
        "grid-template-columns": gridTracks(props.anchos),
        "grid-template-rows": gridTracks(props.altos),
      }}
    >
      {props.children}
      <Index each={Array.from({ length: Math.max(0, props.anchos.length - 1) })}>
        {(_, i) => <Divisor i={i} vertical={false} />}
      </Index>
      <Index each={Array.from({ length: Math.max(0, props.altos.length - 1) })}>
        {(_, i) => <Divisor i={i} vertical={true} />}
      </Index>
    </div>
  );
}
