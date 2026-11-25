/** El observador de tamaño de [`seguirElFondo`] y lo que solo él escribe. */
import type { Accessor, Setter } from "solid-js";

export function crearObservador({ cajaActual, sigue, enTurno, encogidoArriba, ponScrollTop, fondo, scrollTop, ponCerca, estaCerca, ponNuevos, restaurarAncla, pegar, tomarAncla, ponEscapado, ponSigue, rellenoActual, ponRelleno, topeDeRelleno, ruedaArribaActiva, ruedaPendiente }: { cajaActual: () => HTMLElement | undefined; sigue: Accessor<boolean>; enTurno: () => boolean; encogidoArriba: () => number; ponScrollTop: (valor: number) => void; fondo: () => number; scrollTop: () => number; ponCerca: Setter<boolean>; estaCerca: () => boolean; ponNuevos: Setter<boolean>; restaurarAncla: () => void; pegar: () => void; tomarAncla: () => void; ponEscapado: Setter<boolean>; ponSigue: Setter<boolean>; rellenoActual: () => number; ponRelleno: (valor: number) => void; topeDeRelleno: () => number; ruedaArribaActiva: () => boolean; ruedaPendiente: () => boolean }) {
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
          const cubierto = diferencia < 0 && sigue();
          // Sin turno nada ocupa el relleno: se quedaría en blanco bajo el último renglón.
          if (cubierto && enTurno()) ponRelleno(Math.min(rellenoActual() + Math.max(0, -diferencia - encogidoArriba()), topeDeRelleno()));
          else if (diferencia > 0 && rellenoActual()) ponRelleno(Math.max(0, rellenoActual() - diferencia));

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
            else if (!ruedaPendiente()) restaurarAncla();
          } else if (estaCerca() && !ruedaArribaActiva()) {
            // Encogió tanto que el fondo vino a buscarnos: eso no es un gesto
            // de nadie, y quedarse suelto ahí sería quedarse suelto mirando el
            // final. Si la persona acaba de rodar hacia arriba, no se re-engancha.
            ponEscapado(false);
            ponSigue(true);
            ponNuevos(false);
          } else if (!ruedaPendiente()) {
            // Encogió y sigues arriba: el mismo caso de arriba por la otra
            // puerta, y el que más se nota — un registro de ejecución que se
            // pliega al cerrarse el turno se lleva de golpe cientos de píxeles
            // que estaban por encima.
            restaurarAncla();
          }

          // El ancla se vuelve a tomar SIEMPRE y con el layout ya corregido
          // (salvo con rueda hacia arriba en vuelo, donde `alScrollear` la toma
          // una vez aplicado el desplazamiento).
          if (sigue() || !ruedaPendiente()) tomarAncla();

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
