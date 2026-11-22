/** Lo que se le pide a una bajada y lo que devuelve [`seguirElFondo`]. */
import type { Accessor } from "solid-js";
import type { Animacion } from "./paste-spring.ts";

/** Lo que se le puede pedir a una bajada. */
export type Bajada = {
  /** Con muelle (por omisión) o de un corte. */
  animacion?: Animacion;
  /**
   * Bajar solo si el hilo ya venía siguiendo. Lo usa el observador de tamaño:
   * que el contenido crezca no arrastra a quien está leyendo arriba.
   */
  conservaPosicion?: boolean;
  /**
   * No cancelar la bajada que ya esté corriendo. Sin esto, cada crecimiento
   * reiniciaría el muelle.
   */
  esperar?: boolean;
  /** Cuántos ms sigue vigente después de llegar, para que el hilo que aún
   * está acomodándose no deje la bajada a medio camino. */
  duracion?: number;
  /**
   * Que la persona no pueda soltarse mientras dura. Sirve para el salto de
   * apertura, donde un scroll del navegador no es un gesto de nadie.
   */
  ignorarEscapes?: boolean;
};

export type Pegado = {
  /** `ref` del elemento que scrollea. */
  contenedor: (el: HTMLElement) => void;
  /** `ref` del elemento que crece dentro. Es lo que se mide. */
  contenido: (el: HTMLElement) => void;
  /** Si el hilo está siguiendo al fondo ahora mismo. */
  alFondo: Accessor<boolean>;
  /**
   * Si entró algo después de que alguien se soltara. Separa «te fuiste arriba»
   * de «te fuiste arriba y el agente contestó mientras tanto»; solo lo segundo
   * se dice. Se apaga al volver al final, se pida como se pida.
   */
  hayNuevos: Accessor<boolean>;
  /** Baja al fondo y vuelve a seguir. */
  bajar: (opciones?: Bajada) => void;
  /** Suelta el hilo: deja de seguir hasta que alguien vuelva a bajar. */
  soltar: () => void;
  /**
   * Lo de delante ya no es lo mismo: la próxima medida cuenta como una
   * apertura.
   *
   * Sin esto, cambiar de conversación en la misma caja compara el primer alto
   * de la nueva contra el último de la anterior: una nueva más corta se lee
   * como «encogió» y el hilo abre a media altura; una más larga recorre la
   * diferencia entera a la vista. Con el alto olvidado, la primera medida
   * coloca de un corte.
   *
   * El `ref` del contenido ya lo hace cuando el elemento cambia; esto cubre
   * cuando no cambia — la caja del chat es la misma instancia entre tareas.
   */
  recolocar: () => void;
  /**
   * Monta algo por encima de lo que se lee sin moverlo: lo que creció se suma a
   * `scrollTop` en el mismo gesto, antes de pintar. Siguiendo al fondo no hace
   * falta: ya lo resuelve [`pegar`].
   */
  anteponer: (poner: () => void) => void;
  /**
   * Dónde lee la persona, como hijo del contenido y distancia al borde de
   * arriba; `null` si sigue al fondo. Es lo que se guarda al desmontar el hilo.
   */
  lectura: () => { hijo: number; desfase: number; el: Element } | null;
  /** Vuelve a dejar el hijo `hijo` a `desfase` del borde, suelto. */
  retomar: (hijo: number, desfase: number) => void;
  /**
   * El único camino de un virtualizador a la barra: `seguirElFondo` sigue siendo quien la
   * escribe. `lectura`: esta es la nueva lectura; sin él, el ancla sigue siendo la de antes.
   */
  escribir: (valor: number, lectura?: boolean) => void;
  /** Devuelve la lectura tras un cambio de alto que el observador no verá en este cuadro. */
  sostener: () => void;
};
