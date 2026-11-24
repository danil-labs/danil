import { Show, type JSX } from "solid-js";
import { createPref } from "../../../session/src/prefs";
import { cn } from "../../../ui/src/lib/utils";

/** De qué lado de la conversación vive la columna. */
export type Lado = "left" | "right";

/**
 * Una columna al lado de la conversación: ancho propio, arrastrable y
 * recordado, que al cerrarse no deja nada.
 *
 * El ancho pertenece a cada columna, no a la ventana, pero se encoge hasta
 * `min` cuando la conversación no llega a su base (`data-conversacion` en
 * `app/App.tsx`). Al esconder una columna, su ancho pasa a cero.
 *
 * `colapsada` la manda quien monta, y las dos la recuerdan entre sesiones de la
 * app: el historial con `createSidebar`, el panel derecho con la preferencia
 * `shell.right.open` de `App.tsx`. Lo que esta columna recuerda por su cuenta es
 * su ancho.
 *
 * `clave`, `lado`, `ancho`, `min` y `max` se leen al montar: una columna no
 * cambia de lado ni de preferencia en vivo.
 */
export default function ColumnaLateral(props: {
  lado: Lado;
  /** Cerrada es **ancho cero**, no un riel de iconos: que no quede nada. */
  colapsada: boolean;
  /** Con qué clave se recuerda el ancho (`lib/prefs.ts`). */
  clave: string;
  /** Con qué ancho abre la primera vez. */
  ancho: number;
  min: number;
  max: number;
  /** Cómo se nombra el tirador para quien no lo ve. */
  etiqueta: string;
  children: JSX.Element;
}) {
  const [ancho, setAncho] = createPref(props.clave, props.ancho);

  /**
   * **Lo recordado se acota a los topes de hoy, al montar.**
   *
   * Los topes los pone quien monta y pueden cambiar —el de los artefactos bajó
   * de 900 a 560 cuando el diff se fue al centro—, pero el ancho guardado no se
   * enteraba: el clamp solo corría al arrastrar. Una columna que quedó en 900
   * seguía abriendo en 900, tapando la conversación, y la única forma de
   * arreglarla era arrastrarla sin saber por qué.
   */
  if (ancho() < props.min || ancho() > props.max) {
    setAncho(Math.min(props.max, Math.max(props.min, ancho())));
  }

  /**
   * **El arrastre puede fijar el ancho porque la columna no está en el grupo.**
   * Dentro de él, arrastrar solo proponía un reparto que la ventana rehacía.
   * Fuera, el ancho es un número nuestro.
   *
   * Los topes los pone quien monta: cuál es el ancho por debajo del cual su
   * contenido deja de caber solo lo sabe ese contenido.
   */
  const redimensionar = (px: number) =>
    setAncho(Math.min(props.max, Math.max(props.min, Math.round(px))));

  /**
   * A la derecha el gesto va al revés: arrastrar hacia la izquierda ensancha.
   * Sin esto la columna derecha se encoge cuando se la estira.
   */
  const signo = () => (props.lado === "left" ? 1 : -1);

  /** Solo hay tirador si hay algo que estirar. */
  const conTirador = (lado: Lado) => props.lado === lado && !props.colapsada;

  /**
   * El tirador conserva la mecánica propia porque la columna no pertenece a
   * ningún grupo redimensionable. El área amplia y el cursor sostienen el gesto;
   * el hairline separa las superficies sin añadir decoración.
   *
   * **Es un componente y no una variable con JSX**: se coloca en dos sitios —uno
   * por lado— y en Solid un nodo del DOM guardado en una variable se movería del
   * primero al segundo (`SYSTEM.md` § Las reglas de Solid, 9).
   */
  const Tirador = () => (
    <div class="relative z-40 w-0 shrink-0">
      <div
        role="separator"
        aria-label={props.etiqueta}
        aria-orientation="vertical"
        aria-valuemin={props.min}
        aria-valuemax={props.max}
        aria-valuenow={ancho()}
        class="group absolute inset-y-0 -left-1.5 flex w-3 cursor-col-resize items-center justify-center bg-transparent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neutral-500"
        onPointerDown={(e) => {
          e.preventDefault();
          const inicio = e.clientX;
          const desde = ancho();
          const mover = (ev: PointerEvent) =>
            redimensionar(desde + signo() * (ev.clientX - inicio));
          const soltar = () => {
            window.removeEventListener("pointermove", mover);
            window.removeEventListener("pointerup", soltar);
          };
          window.addEventListener("pointermove", mover);
          window.addEventListener("pointerup", soltar);
        }}
      >
        <span
          aria-hidden="true"
          class={cn(
            "pointer-events-none absolute h-full w-px rounded-full bg-border",
            // La barra lateral ya se separa por tono: su línea solo aparece al agarrarla.
            props.lado === "left" && "opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
          )}
        />
      </div>
    </div>
  );

  return (
    <>
      <Show when={conTirador("right")}>
        <Tirador />
      </Show>

      <div
        class={cn(
          "min-h-0 shrink-[1000] transition-[width] duration-200",
          // **Recortado también abierta.** `overflow-visible` dejaba que el
          // contenido se saliera de los 260 px: los títulos largos llegaban al
          // borde sin puntos suspensivos y empujaban fuera de cuadro lo que
          // estuviera a su derecha. Un ancho que el contenido puede ignorar no
          // es un ancho.
          "overflow-hidden",
          // **Los dos rieles son un plano propio, y el chat es el de encima.**
          // Con las tres regiones en `surface`, la ventana entera es un solo tono
          // —medido sobre una captura: `#1d212f` en el
          // historial, en el chat, en los artefactos, en la franja de pestañas y
          // en la de consumo—. Con la rampa vieja no había alternativa: los
          // escalones se llevaban 1,06:1 y separarlos no se habría visto.
          //
          // Esto NO reabre las tarjetas flotando que `App.tsx` descarta. Aquella
          // nota va contra el hueco, la sombra y la esquina redondeada; lo que se
          // usa aquí es tono, que es lo que distingue un plano de otro sin
          // despegarlo. Sigue siendo una superficie continua: los rieles pegan
          // con el chat y lo único que hay entre ellos es la hairline de abajo.
          "glass-panel",
          props.lado === "left" && "sidebar-tone",
          // **El borde va aquí y desaparece con la columna.** Sigue haciendo
          // falta con el tono puesto: 1,22:1 entre `bg` y `surface` separa las
          // regiones a la vista, y WCAG 1.4.11 pide 3:1 para lo que delimita algo
          // —la línea es lo que lo sostiene—. Con la columna cerrada no puede
          // quedarse: a ancho cero un `border` de 1 px sigue pintando su raya.
          // La barra lateral no lleva línea: en el marco nuevo la separa el tono.
          !props.colapsada && props.lado === "right" && "border-l border-border",
        )}
        style={{
          width: props.colapsada ? "0px" : `${ancho()}px`,
          "min-width": props.colapsada ? "0px" : `${props.min}px`,
        }}
      >
        {props.children}
      </div>

      <Show when={conTirador("left")}>
        <Tirador />
      </Show>
    </>
  );
}
