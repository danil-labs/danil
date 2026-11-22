/** La bajada pedida a mano ([`Pegado.bajar`]): el muelle y su estado, que solo ella escribe. */
import type { Accessor, Setter } from "solid-js";
import { comportamientoDe, MS_POR_CUADRO, type Comportamiento } from "./paste-spring.ts";
import type { Bajada } from "./paste-types.ts";

export function crearBajada({ ponSigue, ponEscapado, ponNuevos, sigue, destino, scrollTop, ponScrollTop, haySeleccion }: { ponSigue: Setter<boolean>; ponEscapado: Setter<boolean>; ponNuevos: Setter<boolean>; sigue: Accessor<boolean>; destino: () => number; scrollTop: () => number; ponScrollTop: (valor: number) => void; haySeleccion: () => boolean }) {
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

  return { bajar, animacionActual: () => animacion };
}
