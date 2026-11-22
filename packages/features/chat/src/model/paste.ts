/**
 * Hilo que sigue al fondo mientras el agente escribe, sin pelearse con quien
 * lo suelta. Port a Solid de `use-stick-to-bottom`: se portan los invariantes,
 * no la API. Obra derivada — la atribución está en `CREDITS.md`.
 *
 * Invariante: seguir es pegar `scrollTop` al fondo de un corte, nunca hacia
 * arriba; el muelle solo corre en una bajada pedida a mano ([`bajar`]).
 * Soltarse es una intención ([`soltar`]), no una distancia medida al fondo.
 *
 * ---
 *
 * Derivado de `use-stick-to-bottom`:
 * Copyright (c) StackBlitz. All rights reserved.
 * Licensed under the MIT License.
 * https://github.com/stackblitz-labs/use-stick-to-bottom
 */
import { createEffect, createSignal, on, onCleanup, type Accessor } from "solid-js";

/** Los tres números del muelle. Ver [`MUELLE`]. */
type Muelle = {
  /** De 0 a 1: cuánto se frena la oscilación. */
  amortiguacion: number;
  /** Con qué prisa toma velocidad. */
  rigidez: number;
  /** La inercia. Más masa, más lento. */
  masa: number;
};

/**
 * El muelle de las bajadas pedidas; para seguir al contenido no se usa (ver
 * [`pegar`]).
 *
 * Distinto de `use-stick-to-bottom` (`0.7 / 0.05 / 1.25`): con esos valores el
 * retraso `d = crecimiento · (masa − amortiguación) / rigidez` da 66 px a
 * 6 px/cuadro, tres líneas por debajo del borde y un tirón en cada pausa del
 * streaming. Con estos valores cae por debajo de una línea.
 *
 * `scrollTop` satura en el fondo: no hay sobrepaso aunque la última iteración
 * se pase. Más rigidez tiembla con el reflow de un bloque de markdown a medio
 * cerrar.
 *
 * Objeto congelado y compartido: la animación en curso se compara por
 * identidad (`animacion.comportamiento === comportamiento`) para sumarse a la
 * bajada que ya corre; un objeto nuevo por llamada reiniciaría la velocidad.
 */
const MUELLE: Readonly<Muelle> = Object.freeze({
  amortiguacion: 0.55,
  rigidez: 0.18,
  masa: 1,
});

/** Cómo baja: con el muelle, o de un corte. */
export type Animacion = "muelle" | "instantanea";
type Comportamiento = Readonly<Muelle> | "instantanea";
const comportamientoDe = (a: Animacion = "muelle"): Comportamiento =>
  a === "instantanea" ? "instantanea" : MUELLE;

/**
 * Cuánto se puede quedar a mano antes de que el hilo se dé por reenganchado.
 * No es la tolerancia del `scrollTo` (eso lo resuelve el `- 1` de [`fondo`]).
 * Setenta píxeles es menos de una línea de párrafo.
 */
const MARGEN_DE_FONDO = 70;

/**
 * Cuánto se deja sin recorrer por debajo del texto mientras el hilo sigue.
 *
 * El último bloque se re-parsea con cada token y su alto no es monótono: una
 * línea que se des-envuelve encoge el bloque 22 px. Pegado al máximo eso se ve
 * como un salto hacia arriba; con 26 px de margen, el encogimiento cabe en el
 * hueco y no mueve nada. Medido: sin holgura, +608 px de más; con 26 px, 0 px
 * y 0 de retraso.
 *
 * El hueco de `Chat.tsx` suma esta holgura al alto de la caja para que
 * el último renglón siga visible al detenerse antes del fondo.
 * Veintiséis y no diez: una línea de párrafo mide 22 px.
 */
export const HOLGURA = 26;

/** Un cuadro a 60 Hz, que es la unidad en la que está calibrado el muelle. */
const MS_POR_CUADRO = 1000 / 60;

/**
 * Si el botón del ratón está abajo en cualquier parte del documento.
 *
 * Global: la selección también lo es. El `mouseup` que termina un arrastre
 * puede caer fuera del contenedor, incluso fuera de la ventana; un manejador
 * colgado del contenedor no lo vería, y el hilo dejaría de seguir al agente
 * para siempre creyendo que hay un botón pulsado.
 *
 * Los oyentes se cuelgan en la primera llamada a [`seguirElFondo`], no en el
 * cuerpo del módulo: `node --test` corre los archivos de `lib/` sin `document`,
 * y un efecto de importación rompería todos esos archivos.
 */
let botonAbajo = false;
let vigilandoElRaton = false;
function vigilarElRaton() {
  if (vigilandoElRaton || typeof document === "undefined") return;
  vigilandoElRaton = true;
  document.addEventListener("mousedown", () => {
    botonAbajo = true;
  });
  document.addEventListener("mouseup", () => {
    botonAbajo = false;
  });
  // El `click` también: un `mouseup` sobre otra ventana no llega, y el
  // siguiente clic dentro sí.
  document.addEventListener("click", () => {
    botonAbajo = false;
  });
}

/** Si la rueda hacia arriba sobre `el` lo desplaza a él y no al hilo. */
const subePorDentro = (el: Element) =>
  el.scrollTop > 0 &&
  el.scrollHeight > el.clientHeight &&
  ["scroll", "auto"].includes(getComputedStyle(el).overflowY);

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

/**
 * Sin opciones a propósito: seguir al contenido se pega de un corte, nunca se anima. Ver [`pegar`].
 * `enTurno` dice si queda texto por llegar que ocupe el [`relleno`].
 */
export function seguirElFondo(enTurno: () => boolean = () => true): Pegado {
  vigilarElRaton();

  let caja: HTMLElement | undefined;
  let dentro: HTMLElement | undefined;

  /**
   * Dónde estabas leyendo, para devolverte ahí si el hilo se mueve por encima.
   *
   * Resuelve «estoy leyendo algo de arriba y el hilo cambió de alto por encima
   * de mí» — distinto de [`pegar`], que resuelve «estoy abajo y sigo abajo».
   * Pasa durante un turno: el registro de ejecución crece y se pliega en
   * «Trabajó durante N» al cerrarse, un bloque de diff termina de pedirse, una
   * miniatura carga. El navegador no toca `scrollTop` en ninguno de esos
   * casos: conserva la distancia al principio del contenido, no a lo que se
   * está mirando, y el texto se mueve solo.
   *
   * `overflow-anchor` haría esto sin JavaScript y no existe en WebKit, el
   * motor del webview en macOS: se apunta el primer hijo que asoma por el
   * borde de arriba y a qué altura, y tras el cambio de tamaño se corrige
   * `scrollTop` con lo que ese hijo se movió.
   *
   * Suelto, devuelve la lectura. Siguiendo al fondo manda [`pegar`], y el
   * ancla solo devuelve lo que encoge por encima de lo que se ve. `y` es su
   * altura dentro del contenido, que no cambia con `scrollTop`.
   */
  let ancla: { el: Element; desfase: number; y: number; i: number } | undefined;

  /**
   * Busca desde el último hijo que sirvió y camina hacia donde haga falta.
   * Recorrer desde el principio es O(mensajes) por cambio de tamaño: con el
   * hilo cerca del final, la conversación entera por cada token.
   */
  const tomarAncla = () => {
    // `children` se pregunta con cuidado: un contenido sin hijos es un estado
    // real —la conversación vacía— y los dos entornos sin layout de este repo
    // (`node --test` y el jsdom de `mount-frontend.mjs`) tampoco lo traen.
    if (!caja || !dentro?.children?.length) {
      ancla = undefined;
      return;
    }
    const arriba = caja.getBoundingClientRect().top;
    const hijos = dentro.children;
    let i = Math.min(ancla?.i ?? 0, hijos.length - 1);
    // Hacia arriba mientras el de la mano empiece por debajo del borde.
    while (i > 0 && hijos[i]!.getBoundingClientRect().top > arriba) i--;
    // Y hacia abajo mientras acabe por encima: ese ya no se ve.
    while (i < hijos.length - 1 && hijos[i]!.getBoundingClientRect().bottom <= arriba) i++;
    const el = hijos[i]!;
    const desfase = el.getBoundingClientRect().top - arriba;
    ancla = { el, desfase, y: desfase + scrollTop(), i };
  };

  /** Cuánto encogió el contenido por encima del ancla desde que se tomó. */
  const encogidoArriba = () => {
    if (!ancla || !caja || !ancla.el.isConnected) return Infinity;
    const y = ancla.el.getBoundingClientRect().top - caja.getBoundingClientRect().top + scrollTop();
    return Math.max(0, ancla.y - y);
  };

  /** Devuelve la vista a donde estaba, si el ancla se movió. */
  const restaurarAncla = () => {
    if (!ancla || !caja || !ancla.el.isConnected) return;
    const arriba = caja.getBoundingClientRect().top;
    const desfase = ancla.el.getBoundingClientRect().top - arriba;
    const movido = desfase - ancla.desfase;
    // El medio píxel es el redondeo de `scrollTop`: corregir por menos de eso
    // es escribir un valor que el navegador ya tiene.
    if (Math.abs(movido) >= 0.5) ponScrollTop(scrollTop() + movido);
  };

  /**
   * Si el hilo persigue el fondo. No es lo mismo que estar abajo: es la
   * decisión, y sobrevive a que el contenido crezca y aleje.
   */
  const [sigue, ponSigue] = createSignal(true);
  /**
   * Si el fondo está a menos de [`MARGEN_DE_FONDO`]. Es una medida: evita
   * ofrecer «bajar» a quien ya ve el final.
   */
  const [cerca, ponCerca] = createSignal(true);
  /** Si alguien se soltó a propósito. Ver el punto 1 de la cabecera. */
  const [escapado, ponEscapado] = createSignal(false);
  /**
   * Si el contenido creció mientras el hilo estaba suelto. Ver [`hayNuevos`].
   * Se enciende en el observador, que es lo único que ve crecer el hilo sin
   * enumerar los motivos, y se apaga solo al volver al final.
   */
  const [nuevos, ponNuevos] = createSignal(false);

  /**
   * El último `scrollTop` que escribimos y el del evento anterior. El primero
   * distingue nuestro movimiento del de la persona: el evento `scroll` no dice
   * quién lo causó, y sin esto la animación se interpreta como un gesto propio
   * y se suelta en el primer cuadro.
   */
  let escritoPorNosotros: number | undefined;
  let ultimoScrollTop: number | undefined;
  /**
   * Cuánto acaba de crecer o encoger el contenido, mientras dura el tic en que
   * eso se confunde con un gesto. Ver el `setTimeout` de [`alScrollear`].
   */
  let diferenciaDeTamano = 0;
  let animacion:
    | { comportamiento: Comportamiento; ignorarEscapes: boolean; promesa: Promise<boolean> }
    | undefined;
  let ultimoTic: number | undefined;
  let velocidad = 0;
  /**
   * Lo que el muelle quiere mover y todavía no ha podido. `scrollTop` se
   * cuantiza a 1/64 de píxel en Blink: un cuadro que pide una milésima de
   * píxel lo pierde entero. Acumulado, sin esto el muelle se queda clavado
   * cerca del final, donde la velocidad es más pequeña.
   */
  let acumulado = 0;

  const scrollTop = () => caja?.scrollTop ?? 0;

  /**
   * Mueve la barra anulando `scroll-behavior` mientras dura. Con
   * `scroll-behavior: smooth` en el contenedor, cada escritura del muelle se
   * volvería una animación del navegador encima de la nuestra — dos
   * animaciones persiguiendo el mismo objetivo, un temblor en pantalla.
   */
  const ponScrollTop = (valor: number) => {
    if (!caja) return;
    // Sin insertar todavía no hay estilo que leer: en el DOM del `<template>`
    // del que Solid clona no existe `documentElement`, y `getComputedStyle`
    // lanza ahí en vez de contestar vacío como en el navegador.
    const previo = caja.isConnected ? getComputedStyle(caja).scrollBehavior : "auto";
    if (previo !== "auto") caja.style.scrollBehavior = "auto";
    caja.scrollTop = valor;
    escritoPorNosotros = caja.scrollTop;
    if (previo !== "auto") caja.style.scrollBehavior = previo;
  };

  /**
   * Dónde está el fondo, menos un píxel. Con `zoom` o una escala de fuente sin
   * números enteros, `scrollHeight - clientHeight` es fraccionario y
   * `scrollTop` no puede valerlo exacto: sin el margen, una igualdad diría «no
   * has llegado» para siempre.
   */
  const fondo = () => (caja ? caja.scrollHeight - 1 - caja.clientHeight : 0);
  /**
   * A dónde se sigue, que no es el fondo del todo. Ver [`HOLGURA`]. `fondo`
   * sigue siendo el fondo real —lo usan el acotado y las medidas—; esto es el
   * destino de cualquier seguimiento, incluido el botón de bajar.
   */
  const destino = () => Math.max(0, fondo() - HOLGURA);
  const distancia = () => fondo() - scrollTop();
  const estaCerca = () => distancia() <= MARGEN_DE_FONDO;

  /**
   * Pega el hilo al final sin animar y sin subir nunca. Corre mientras el
   * agente escribe, dentro del observador de tamaño: ese corre después del
   * layout y antes del pintado, y la barra sale colocada en el mismo cuadro
   * en que el contenido creció. Sin muelle no hay retraso que recuperar.
   *
   * Y solo baja: junto con la holgura, un destino que baja 22 px no mueve
   * nada — todavía queda holgura por debajo y el navegador no acota.
   */
  const pegar = () => {
    const objetivo = destino();
    if (objetivo > scrollTop()) ponScrollTop(objetivo);
  };

  /** Si hay una selección viva que toca el contenedor. Ver [`botonAbajo`]. */
  const haySeleccion = () => {
    if (!botonAbajo || !caja) return false;
    const seleccion = window.getSelection();
    if (!seleccion || !seleccion.rangeCount) return false;
    const rango = seleccion.getRangeAt(0);
    return (
      rango.commonAncestorContainer.contains(caja) ||
      caja.contains(rango.commonAncestorContainer)
    );
  };

  function bajar(o: Bajada = {}): Promise<boolean> {
    if (!o.conservaPosicion) {
      ponSigue(true);
      ponEscapado(false);
      ponNuevos(false);
    }

    const comportamiento = comportamientoDe(o.animacion);
    const ignorarEscapes = o.ignorarEscapes ?? false;
    /**
     * A dónde íbamos cuando esto empezó. El fondo se mueve mientras bajamos —
     * el agente sigue escribiendo—: la condición de «ya llegué» mira el menor
     * de los dos, y el tramo nuevo lo recoge la ventana de `duracion`.
     */
    let objetivo = destino();
    const finDeLaDuracion = Date.now() + (o.duracion ?? 0);

    const siguiente = async (): Promise<boolean> => {
      // Tipo explícito: la promesa se nombra a sí misma dentro de su propio
      // cuerpo (al apuntarla en `animacion`), y sin anotación TypeScript no
      // cierra la inferencia.
      const promesa: Promise<boolean> = new Promise(requestAnimationFrame).then(() => {
        // Alguien se soltó en mitad de la bajada. Se abandona sin más: volver a
        // moverla sería justo lo que la versión anterior hacía mal.
        if (!sigue()) {
          animacion = undefined;
          return false;
        }

        const desde = scrollTop();
        const tic = performance.now();
        const paso = (tic - (ultimoTic ?? tic)) / MS_POR_CUADRO;
        animacion ||= { comportamiento, ignorarEscapes, promesa };
        if (animacion.comportamiento === comportamiento) ultimoTic = tic;

        // Con el ratón arrastrando una selección, el muelle cede: mover la
        // barra debajo de un rango vivo lo extiende solo.
        if (haySeleccion()) return siguiente();

        if (desde < Math.min(objetivo, destino())) {
          if (animacion?.comportamiento === comportamiento) {
            if (comportamiento === "instantanea") {
              ponScrollTop(destino());
              return siguiente();
            }
            velocidad =
              (comportamiento.amortiguacion * velocidad +
                comportamiento.rigidez * (destino() - scrollTop())) /
              comportamiento.masa;
            acumulado += velocidad * paso;
            ponScrollTop(desde + acumulado);
            // Si la barra se movió de verdad, lo acumulado ya se gastó.
            if (scrollTop() !== desde) acumulado = 0;
          }
          return siguiente();
        }

        // Llegamos, pero la bajada sigue vigente: se re-apunta al fondo nuevo.
        if (finDeLaDuracion > Date.now()) {
          objetivo = destino();
          return siguiente();
        }

        animacion = undefined;

        // Se acabó la ventana y aún faltan píxeles: el contenido creció justo
        // en el último cuadro. Se encadena otra bajada en vez de quedarse a
        // medio camino.
        if (scrollTop() < destino()) {
          return bajar({
            animacion: o.animacion,
            ignorarEscapes,
            duracion: Math.max(0, finDeLaDuracion - Date.now()) || undefined,
          });
        }

        return sigue();
      });

      return promesa.then((llego) => {
        requestAnimationFrame(() => {
          if (!animacion) {
            ultimoTic = undefined;
            velocidad = 0;
          }
        });
        return llego;
      });
    };

    /**
     * «Instantánea» es sin esperar un cuadro. El resto del método vive dentro
     * de un `requestAnimationFrame` —correcto para el muelle, que necesita el
     * reloj— y lo contrario de lo que pide un salto: entre que el hilo entra
     * en el DOM y corre ese cuadro, el navegador pinta una vez con la
     * conversación arriba, y se ve moverse el scroll.
     *
     * Colocar aquí llega a tiempo: quien pide el salto ya está dentro del
     * cuadro, el efecto de `Chat.tsx` corre con el DOM puesto, y el
     * `ResizeObserver` corre después del layout y antes del pintado. Mover la
     * barra no cambia el layout: el primer pintado ya sale colocado.
     *
     * La bajada sigue arrancando igual y recoge en la ventana de duración lo
     * que el hilo crezca después — el markdown reflowea, los diffs se miden.
     * Esto solo se adelanta al primer cuadro.
     */
    if (comportamiento === "instantanea" && sigue()) ponScrollTop(destino());

    if (!o.esperar) animacion = undefined;
    // Ya hay una bajada igual corriendo: sumarse a ella en vez de reiniciar el
    // muelle desde velocidad cero.
    if (animacion?.comportamiento === comportamiento) return animacion.promesa;

    return siguiente();
  }

  const soltar = () => {
    ponEscapado(true);
    ponSigue(false);
    // Dónde se quedó la lectura. Sin esto, el primer cambio de alto después del
    // gesto no tiene contra qué corregir y se cuela entero.
    tomarAncla();
  };

  /**
   * Lo importante pasa dentro del `setTimeout(…, 1)`, y no es un debounce: un
   * `scroll` causado por un cambio de tamaño puede llegar antes que el evento
   * del `ResizeObserver` que lo explica
   * (https://github.com/WICG/resize-observer/issues/25). Sin esperar un tic,
   * el crecimiento del contenido se leería como que alguien movió la barra.
   */
  const alScrollear = (e: Event) => {
    if (e.target !== caja) return;

    const ahora = scrollTop();
    const ignorado = escritoPorNosotros;
    let previo = ultimoScrollTop ?? ahora;
    ultimoScrollTop = ahora;
    escritoPorNosotros = undefined;

    // Subir con la rueda mientras el muelle baja puede no dar dos eventos
    // separados. Si el que sí llegó viene de nosotros, la referencia para
    // decidir la dirección es ese valor, no el anterior.
    if (ignorado !== undefined && ignorado > ahora) previo = ignorado;

    ponCerca(estaCerca());

    /**
     * Un gesto que se va lejos del final se atiende ya, sin esperar el tic de
     * abajo. Ese tic existe para el caso en que un `scroll` por cambio de
     * tamaño llega antes que el aviso que lo explica; el precio es un cuadro de
     * retraso, que con el muelle se ve como que arrastrar hacia arriba «tira»
     * hacia atrás. Este caso se resuelve sin esperar: el único movimiento
     * hacia arriba que no es nuestro es el acotado del navegador cuando el
     * contenido encoge, y ese deja la barra EN el fondo, nunca lejos de él —
     * subir más allá del margen es siempre de la persona.
     */
    if (
      ahora < previo &&
      ahora !== ignorado &&
      !estaCerca() &&
      !animacion?.ignorarEscapes
    ) {
      soltar();
    }

    // El ancla marca dónde está leyendo la persona. Sin retomarla aquí, el
    // siguiente cambio de alto la restaura contra una posición vieja y deshace
    // el gesto. El acotado del navegador queda fuera: deja la barra en el fondo.
    if (!sigue() && ahora !== ignorado && !(ahora < previo && ahora >= fondo())) {
      tomarAncla();
    }

    // Con la persona arriba el hueco queda fuera de la vista: quitarlo no mueve nada.
    if (relleno && !sigue() && ahora <= fondo() - relleno) ponRelleno(0);

    setTimeout(() => {
      if (ahora === ignorado) return;
      // Al agrandar la ventana, el navegador acota la barra al nuevo fondo.
      // Ese ascenso no es un gesto de la persona y no debe soltar el hilo.
      if (ahora < previo && ahora >= fondo()) return;

      /**
       * Descartar el evento entero por un cambio de alto lo descartaría casi
       * siempre mientras el agente escribe: subir arrastrando la barra, con
       * teclado o trackpad no soltaría el hilo. Solo la rueda tiene su propio
       * manejador ([`alRodar`]). Crecer no produce un movimiento hacia arriba
       * —crecer por abajo deja `scrollTop` donde estaba—: un evento que sube
       * durante un crecimiento es siempre de la persona. Encoger sí mueve la
       * barra sola: el navegador la acota al fondo nuevo antes de medir, y ese
       * caso se descarta.
       */
      if (diferenciaDeTamano < 0) return;
      if (diferenciaDeTamano > 0 && ahora >= previo) return;

      if (haySeleccion()) {
        soltar();
        return;
      }

      // Una bajada blindada revierte lo que sea que movió la barra.
      if (animacion?.ignorarEscapes) {
        ponScrollTop(previo);
        return;
      }

      if (ahora < previo) soltar();
      if (ahora > previo) ponEscapado(false);
      if (!escapado() && estaCerca()) {
        ponSigue(true);
        // Llegar al final a mano es haberlos visto: el aviso de que entró algo
        // no puede sobrevivir a que se esté mirando justo eso.
        ponNuevos(false);
      }
    }, 1);
  };

  /**
   * La rueda hacia arriba suelta el hilo aquí y no por la posición: el
   * navegador cancela el desplazamiento de la rueda si el script mueve la
   * barra durante el gesto, y con el agente escribiendo la movemos varias
   * veces por segundo. Soltando en el propio evento, el primer `deltaY`
   * negativo ya para la animación y el gesto llega entero.
   *
   * Sube por el árbol buscando quién se lleva el gesto: el `target` es el nodo
   * bajo el puntero —un `<code>`, una celda de diff—. Un bloque de código o una
   * tabla tienen `overflow: auto` y solo desplazan en horizontal: la rueda
   * hacia arriba sobre ellos sube el hilo, y parar en el primer `overflow`
   * dejaba el hilo pegado al fondo bajo el gesto. Solo se lo lleva quien
   * todavía puede subir.
   */
  const alRodar = (e: WheelEvent) => {
    if (!caja || e.deltaY >= 0 || animacion?.ignorarEscapes) return;
    for (let el = e.target as Element | null; el && el !== caja; el = el.parentElement) {
      if (subePorDentro(el)) return;
    }
    if (caja.scrollHeight > caja.clientHeight) soltar();
  };

  /**
   * Todo lo que hace crecer el hilo, sin enumerarlo: el markdown que reflowea,
   * el registro que se despliega, la miniatura que carga, el diff que aparece.
   * Ninguno toca `msgs`.
   *
   * El guarda de existencia cubre `node --test` y el jsdom de
   * `scripts/guards/mount-frontend.mjs`: ninguno de los dos implementa `ResizeObserver` ni
   * tiene alturas que seguir. El webview siempre lo trae.
   */
  let altoPrevio: number | undefined;
  // Lo que [`anteponer`] montó por encima: historia vieja, no un mensaje nuevo.
  let antepuesto = 0;

  /**
   * Lo que el contenido encogió siguiendo el fondo, devuelto como hueco bajo el
   * último renglón. Sin él, la cola de pasos que se pliega al llegar el texto
   * acota `scrollTop` y lo ya leído baja de golpe. Va en `padding-bottom`: el
   * observador mide la caja sin relleno y no se re-dispara al escribirlo.
   */
  let relleno = 0;
  const ponRelleno = (valor: number) => {
    if (valor === relleno) return;
    relleno = valor;
    if (dentro) dentro.style.paddingBottom = valor ? `${valor}px` : "";
  };
  // Más de un tercio de la caja en blanco se lee peor que el salto que evita.
  const topeDeRelleno = () => Math.round((caja?.clientHeight ?? 0) / 3);
  const observador =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(([entrada]) => {
          const alto = entrada.contentRect.height;
          // Una pestaña escondida mide cero sin que cambie nada de lo que se
          // lee: tomarlo por un encogimiento la pondría a seguir el fondo.
          if (alto === 0 && caja?.clientHeight === 0) {
            // Escondida, el relleno no se ve: soltarlo aquí no mueve nada.
            ponRelleno(0);
            return;
          }
          const diferencia = alto - (altoPrevio ?? alto);
          diferenciaDeTamano = diferencia;

          // Ver [`relleno`]. Solo lo que encoge por debajo de lo primero que se
          // ve: lo de arriba, como el recorte de tramos, lo devuelve el ancla.
          const cubierto = diferencia < 0 && sigue();
          // Sin turno nada ocupa el relleno: se quedaría en blanco bajo el último renglón.
          if (cubierto && enTurno()) ponRelleno(Math.min(relleno + Math.max(0, -diferencia - encogidoArriba()), topeDeRelleno()));
          else if (diferencia > 0 && relleno) ponRelleno(Math.max(0, relleno - diferencia));

          // El navegador puede dejar la barra pasada del final cuando el
          // contenido encoge de golpe. Se corrige antes de medir nada.
          if (scrollTop() > fondo()) ponScrollTop(fondo());
          ponCerca(estaCerca());

          // Entró algo con alguien mirando arriba: es lo único que distingue
          // el aviso de mensajes nuevos del botón de bajar. Va antes del
          // `bajar` de abajo, que no mueve nada mientras el hilo está suelto.
          if (diferencia > antepuesto && !sigue()) ponNuevos(true);
          antepuesto = 0;

          // Cualquier mecanismo que persiga el fondo con retraso lo recupera
          // con un tirón: con el último bloque re-envolviéndose, un muelle
          // rígido movía 458 px de más y uno blando se quedaba 32 px corto.
          // Pegar de un corte con holgura mueve exactamente lo que el
          // contenido creció.
          if (diferencia >= 0 || cubierto) {
            // Cubierto, el acotado del navegador ya bajó `scrollTop`: el ancla
            // lo devuelve antes de pintar.
            if (cubierto) restaurarAncla();
            if (sigue()) pegar();
            // Sin seguir, se devuelve la lectura donde estaba: el navegador
            // conserva la distancia al principio del contenido, no a lo que
            // se está mirando. Ver [`ancla`].
            else restaurarAncla();
          } else if (estaCerca()) {
            // Encogió tanto que el fondo vino a buscarnos: eso no es un gesto
            // de nadie, y quedarse suelto ahí sería quedarse suelto mirando el
            // final.
            ponEscapado(false);
            ponSigue(true);
            ponNuevos(false);
          } else {
            // Encogió y sigues arriba: el mismo caso de arriba por la otra
            // puerta, y el que más se nota — un registro de ejecución que se
            // pliega al cerrarse el turno se lleva de golpe cientos de píxeles
            // que estaban por encima.
            restaurarAncla();
          }

          // El ancla se vuelve a tomar SIEMPRE y con el layout ya corregido:
          // así el siguiente cambio se mide contra donde la vista quedó, no
          // contra donde estaba antes de esta corrección.
          tomarAncla();

          altoPrevio = alto;

          // El `scroll` que provoca este cambio de tamaño llega después: un
          // cuadro para él, y un tic más para el `setTimeout` de
          // [`alScrollear`], que es quien tiene que ver todavía la diferencia.
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (diferenciaDeTamano === diferencia) diferenciaDeTamano = 0;
            }, 1);
          });
        });

  /**
   * Los dos `ref` sueltan lo anterior antes de tomar lo nuevo: la caja de una
   * conversación vacía se pinta centrada y sin contenedor de scroll, y pasar
   * de una tarea con mensajes a una nueva y volver monta elementos distintos.
   *
   * `altoPrevio = undefined` arregla un defecto medido: sin ella, la primera
   * medida del contenido nuevo se compara contra el alto de la conversación
   * anterior. Una nueva más corta da diferencia negativa, el observador lo
   * trata como «encogió» y la conversación abre a media altura. Lo fija
   * `tests/unit/paste.test.ts`.
   *
   * `disconnect` y los `removeEventListener` son el contrato del módulo, no un
   * fallo observado: un observador mira un contenido, un contenedor tiene un
   * juego de oyentes, y el elemento viejo se desprende y deja de reportar.
   */
  const contenedor = (el: HTMLElement) => {
    caja?.removeEventListener("scroll", alScrollear);
    caja?.removeEventListener("wheel", alRodar);
    caja = el;
    ultimoScrollTop = undefined;
    escritoPorNosotros = undefined;
    el.addEventListener("scroll", alScrollear, { passive: true });
    el.addEventListener("wheel", alRodar, { passive: true });
  };

  const contenido = (el: HTMLElement) => {
    observador?.disconnect();
    altoPrevio = undefined;
    ponRelleno(0);
    dentro = el;
    ancla = undefined;
    observador?.observe(el);
  };

  /**
   * Ver [`Pegado.recolocar`]. Olvidar el alto convierte la próxima medida en
   * una apertura; las otras dos hacen que una conversación abra siguiendo, se
   * estuviera como se estuviera en la anterior.
   */
  const recolocar = () => {
    altoPrevio = undefined;
    ponRelleno(0);
    ponEscapado(false);
    ponNuevos(false);
  };

  const anteponer = (poner: () => void) => {
    if (!caja || sigue()) return poner();
    const antes = caja.scrollHeight;
    poner();
    const crecio = caja.scrollHeight - antes;
    if (crecio <= 0) return;
    antepuesto += crecio;
    ponScrollTop(scrollTop() + crecio);
    tomarAncla();
  };

  const lectura = () => (sigue() || !ancla ? null : { hijo: ancla.i, desfase: ancla.desfase, el: ancla.el });

  const retomar = (hijo: number, desfase: number) => {
    const el = dentro?.children?.[hijo];
    if (!caja || !el) return;
    soltar();
    ponScrollTop(scrollTop() + el.getBoundingClientRect().top - caja.getBoundingClientRect().top - desfase);
    tomarAncla();
    ponCerca(estaCerca());
  };

  const escribir = (valor: number, lectura = false) => {
    // Siguiendo manda `pegar`: la posición que recuerda un virtualizador ya quedó atrás del fondo.
    if (!lectura && sigue()) return;
    ponScrollTop(valor);
    if (lectura && !sigue()) tomarAncla();
    ponCerca(estaCerca());
  };

  const sostener = () => {
    if (!sigue()) restaurarAncla();
  };

  // Quitar el padding no cambia `contentRect`: el observador no avisaría del cierre.
  createEffect(
    on(
      enTurno,
      (vivo) => {
        if (vivo || !relleno) return;
        ponRelleno(0);
        if (scrollTop() > fondo()) ponScrollTop(fondo());
        ponCerca(estaCerca());
      },
      { defer: true },
    ),
  );

  onCleanup(() => {
    caja?.removeEventListener("scroll", alScrollear);
    caja?.removeEventListener("wheel", alRodar);
    observador?.disconnect();
  });

  /**
   * «Sigue» o «ya está viendo el final»: los dos casos quieren lo mismo del
   * consumidor, no ofrecer un botón para bajar. Separarlos obligaría a cada
   * llamador a repetir la misma unión.
   */
  const alFondo = () => sigue() || cerca();

  /**
   * Es una medida y no la decisión. `alFondo` une las dos: el botón de bajar
   * no tiene nada que ofrecer en ninguno de los dos casos. El aviso de
   * mensajes nuevos sí distingue: se pregunta por `sigue()`, no por la
   * distancia, para saber si entró algo mientras alguien leía arriba.
   */
  const hayNuevos = () => nuevos() && !alFondo();

  return {
    contenedor,
    contenido,
    alFondo,
    hayNuevos,
    bajar: (o) => void bajar(o),
    soltar,
    recolocar,
    anteponer,
    lectura,
    retomar,
    escribir,
    sostener,
  };
}
