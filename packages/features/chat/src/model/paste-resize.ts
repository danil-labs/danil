/** El observador de tamaño de [`seguirElFondo`] y lo que solo él escribe. */
import type { Accessor, Setter } from "solid-js";
import { MARGEN_DE_FONDO } from "./paste-spring.ts";

export function crearObservador({ cajaActual, sigue, escapado, enTurno, encogidoArriba, ponScrollTop, fondo, scrollTop, ponCerca, estaCerca, ponNuevos, restaurarAncla, pegar, tomarAncla, ponEscapado, ponSigue, rellenoActual, ponRelleno, topeDeRelleno, ruedaArribaActiva, interaccionActual }: { cajaActual: () => HTMLElement | undefined; sigue: Accessor<boolean>; escapado: Accessor<boolean>; enTurno: () => boolean; encogidoArriba: () => number; ponScrollTop: (valor: number) => void; fondo: () => number; scrollTop: () => number; ponCerca: Setter<boolean>; estaCerca: () => boolean; ponNuevos: Setter<boolean>; restaurarAncla: (modo?: "contenido" | "vista") => void; pegar: () => void; tomarAncla: () => void; ponEscapado: Setter<boolean>; ponSigue: Setter<boolean>; rellenoActual: () => number; ponRelleno: (valor: number) => void; topeDeRelleno: () => number; ruedaArribaActiva: () => boolean; interaccionActual: () => "abrir" | "cerrar" | null }) {
  /**
   * Cuánto acaba de crecer o encoger el contenido, mientras dura el tic en que
   * eso se confunde con un gesto. Ver el `setTimeout` de [`alScrollear`].
   */
  let diferenciaDeTamano = 0;

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

  const observador =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(([entrada]) => {
          const alto = entrada.contentRect.height;
          // Una pestaña escondida mide cero sin que cambie nada de lo que se
          // lee: tomarlo por un encogimiento la pondría a seguir el fondo.
          if (alto === 0 && cajaActual()?.clientHeight === 0) {
            // Escondida, el relleno no se ve: soltarlo aquí no mueve nada.
            ponRelleno(0);
            return;
          }
          const diferencia = alto - (altoPrevio ?? alto);
          diferenciaDeTamano = diferencia;

          // Ver [`relleno`]. Solo lo que encoge por debajo de lo primero que se
          // ve: lo de arriba, como el recorte de tramos, lo devuelve el ancla.
          // Un colapso manual de un desplegable nunca inyecta blanco artificial.
          const cubierto = diferencia < 0 && sigue();
          // Sin turno nada ocupa el relleno: se quedaría en blanco bajo el último renglón.
          if (cubierto && enTurno() && interaccionActual() !== "cerrar") ponRelleno(Math.min(rellenoActual() + Math.max(0, -diferencia - encogidoArriba()), topeDeRelleno()));
          else if (diferencia > 0 && rellenoActual()) ponRelleno(Math.max(0, rellenoActual() - diferencia));

          // El navegador puede dejar la barra pasada del final cuando el
          // contenido encoge de golpe. Se corrige antes de medir nada.
          if (scrollTop() > fondo()) ponScrollTop(fondo());
          ponCerca(estaCerca());

          // Entró algo con alguien mirando arriba: es lo único que distingue
          // el aviso de mensajes nuevos del botón de bajar. Abrir un desplegable
          // propio no es un mensaje nuevo del agente.
          if (diferencia > antepuesto && !sigue() && interaccionActual() !== "abrir") ponNuevos(true);
          antepuesto = 0;

          // Cualquier mecanismo que persiga el fondo con retraso lo recupera
          // con un tirón: con el último bloque re-envolviéndose, un muelle
          // rígido movía 458 px de más y uno blando se quedaba 32 px corto.
          // Pegar de un corte con holgura mueve exactamente lo que el
          // contenido creció.
          const distanciaAntes = fondo() - diferencia - scrollTop();
          const fondoAlcanzoLaVista =
            estaCerca() &&
            !ruedaArribaActiva() &&
            (scrollTop() >= fondo() || !escapado() || distanciaAntes > MARGEN_DE_FONDO);
          if (diferencia >= 0 || cubierto) {
            // Cubierto, el acotado del navegador ya bajó `scrollTop`: el ancla
            // lo devuelve antes de pintar.
            if (cubierto) restaurarAncla("vista");
            if (sigue()) pegar();
            // Sin seguir, se compensa solo el cambio de layout por encima del ancla:
            // en espacio de contenido, jamás revierte una rueda o inercia en vuelo.
            else restaurarAncla();
          } else if (fondoAlcanzoLaVista) {
            // Encogió tanto que el fondo vino a buscarnos desde lejos (o tocó el tope):
            // quedarse suelto mirando el final no tiene sentido. En cambio, un encogimiento
            // pequeño cuando la persona se acaba de subir pocos píxeles nunca re-engancha.
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

          // El ancla se vuelve a tomar SIEMPRE y con el layout ya corregido.
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

  const diferenciaActual = () => diferenciaDeTamano;
  const olvidarAlto = () => {
    altoPrevio = undefined;
  };
  const sumarAntepuesto = (crecio: number) => {
    antepuesto += crecio;
  };

  return { observador, diferenciaActual, olvidarAlto, sumarAntepuesto };
}
