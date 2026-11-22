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
import { createEffect, createSignal, on, onCleanup } from "solid-js";
import { HOLGURA, MARGEN_DE_FONDO } from "./paste-spring.ts";
import { botonAbajo, subePorDentro, vigilarElRaton } from "./paste-mouse.ts";
import type { Pegado } from "./paste-types.ts";
import { crearAncla } from "./paste-anchor.ts";
import { crearBajada } from "./paste-scroll-down.ts";
import { crearObservador } from "./paste-resize.ts";

/**
 * Sin opciones a propósito: seguir al contenido se pega de un corte, nunca se anima. Ver [`pegar`].
 * `enTurno` dice si queda texto por llegar que ocupe el [`relleno`].
 */
export function seguirElFondo(enTurno: () => boolean = () => true): Pegado {
  vigilarElRaton();

  let caja: HTMLElement | undefined;
  let dentro: HTMLElement | undefined;

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

  const { tomarAncla, encogidoArriba, restaurarAncla, lectura, olvidarAncla } = crearAncla({ cajaActual: () => caja, dentroActual: () => dentro, scrollTop, ponScrollTop, sigue });
  const { bajar, animacionActual } = crearBajada({ ponSigue, ponEscapado, ponNuevos, sigue, destino, scrollTop, ponScrollTop, haySeleccion });

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
      !animacionActual()?.ignorarEscapes
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
      if (diferenciaActual() < 0) return;
      if (diferenciaActual() > 0 && ahora >= previo) return;

      if (haySeleccion()) {
        soltar();
        return;
      }

      // Una bajada blindada revierte lo que sea que movió la barra.
      if (animacionActual()?.ignorarEscapes) {
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
    if (!caja || e.deltaY >= 0 || animacionActual()?.ignorarEscapes) return;
    for (let el = e.target as Element | null; el && el !== caja; el = el.parentElement) {
      if (subePorDentro(el)) return;
    }
    if (caja.scrollHeight > caja.clientHeight) soltar();
  };


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

  const { observador, diferenciaActual, olvidarAlto, sumarAntepuesto } = crearObservador({ cajaActual: () => caja, sigue, enTurno, encogidoArriba, ponScrollTop, fondo, scrollTop, ponCerca, estaCerca, ponNuevos, restaurarAncla, pegar, tomarAncla, ponEscapado, ponSigue, rellenoActual: () => relleno, ponRelleno, topeDeRelleno });

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
    olvidarAlto();
    ponRelleno(0);
    dentro = el;
    olvidarAncla();
    observador?.observe(el);
  };

  /**
   * Ver [`Pegado.recolocar`]. Olvidar el alto convierte la próxima medida en
   * una apertura; las otras dos hacen que una conversación abra siguiendo, se
   * estuviera como se estuviera en la anterior.
   */
  const recolocar = () => {
    olvidarAlto();
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
    sumarAntepuesto(crecio);
    ponScrollTop(scrollTop() + crecio);
    tomarAncla();
  };

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
