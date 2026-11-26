/** El ancla de lectura de [`seguirElFondo`]: dónde se lee, y devolver la vista ahí. Solo este módulo escribe `ancla`. */
import type { Accessor } from "solid-js";

export function crearAncla({ cajaActual, dentroActual, scrollTop, ponScrollTop, sigue }: { cajaActual: () => HTMLElement | undefined; dentroActual: () => HTMLElement | undefined; scrollTop: () => number; ponScrollTop: (valor: number) => void; sigue: Accessor<boolean> }) {
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
  let ancla: { el: Element; desfase: number; y: number; i: number; st: number } | undefined;

  const esEspaciador = (el: Element) => el.getAttribute?.("aria-hidden") === "true";

  /**
   * Busca desde el último hijo que sirvió y camina hacia donde haga falta.
   * Recorrer desde el principio es O(mensajes) por cambio de tamaño: con el
   * hilo cerca del final, la conversación entera por cada token.
   */
  const tomarAncla = () => {
    const caja = cajaActual(), dentro = dentroActual();
    // `children` se pregunta con cuidado: un contenido sin hijos es un estado
    // real —la conversación vacía— y los dos entornos sin layout de este repo
    // (`node --test` y el jsdom de `mount-frontend.mjs`) tampoco lo traen.
    if (!caja || !dentro?.children?.length) {
      ancla = undefined;
      return;
    }
    const cajaRect = caja.getBoundingClientRect();
    const arriba = cajaRect.top;
    const abajo = cajaRect.bottom;
    const hijos = dentro.children;
    let i = Math.min(ancla?.i ?? 0, hijos.length - 1);
    // Hacia arriba mientras el de la mano empiece por debajo del borde.
    while (i > 0 && hijos[i]!.getBoundingClientRect().top > arriba) i--;
    // Y hacia abajo mientras acabe por encima: ese ya no se ve.
    while (i < hijos.length - 1 && hijos[i]!.getBoundingClientRect().bottom <= arriba) i++;
    // Nunca anclar al espaciador decorativo del composer (`aria-hidden="true"`).
    while (i > 0 && esEspaciador(hijos[i]!)) i--;
    if (esEspaciador(hijos[i]!)) {
      ancla = undefined;
      return;
    }
    const el = hijos[i]!;
    const rect = el.getBoundingClientRect();
    // Si incluso el primer hijo montado queda por debajo de la vista (p. ej. al
    // scrollear rápido hacia arriba dentro del margen virtual aún sin montar),
    // no anclar a un elemento fuera de pantalla.
    if (abajo > arriba && rect.top >= abajo) {
      ancla = undefined;
      return;
    }
    const st = scrollTop();
    const desfase = rect.top - arriba;
    ancla = { el, desfase, y: desfase + st, i, st };
  };

  /** Cuánto encogió el contenido por encima del ancla desde que se tomó. */
  const encogidoArriba = () => {
    const caja = cajaActual();
    if (!ancla || !caja || !ancla.el.isConnected) return Infinity;
    const y = ancla.el.getBoundingClientRect().top - caja.getBoundingClientRect().top + scrollTop();
    return Math.max(0, ancla.y - y);
  };

  /**
   * Devuelve la vista tras un cambio de layout.
   *
   * - `"contenido"` (lectura suelta): compensa únicamente el cambio de posición
   *   del ancla en espacio de contenido (`yAhora - ancla.y`), que es invariante
   *   ante el scroll de la persona (rueda, inercia, barra o teclado). Así nunca
   *   deshace un gesto en vuelo ni deja sin compensar un cambio por encima.
   * - `"vista"` (`cubierto` siguiendo el fondo): devuelve el desfase respecto al
   *   borde superior cuando el navegador acotó `scrollTop` al encoger el hilo.
   */
  const restaurarAncla = (modo: "contenido" | "vista" = "contenido") => {
    const caja = cajaActual();
    if (!ancla || !caja || !ancla.el.isConnected) return;
    const arriba = caja.getBoundingClientRect().top;
    const st = scrollTop();
    const desfase = ancla.el.getBoundingClientRect().top - arriba;
    const yAhora = desfase + st;
    let movido: number;
    if (modo === "vista") {
      movido = desfase - ancla.desfase;
    } else {
      // Si al encoger el contenido el navegador recortó `scrollTop` al nuevo `maxScroll`,
      // ese descenso es recorte del navegador y no un gesto de la persona: descontarlo
      // evita restarlo dos veces y disparar la vista hacia arriba.
      const maxScroll = Math.max(0, caja.scrollHeight - caja.clientHeight);
      const recortado = st >= maxScroll - 1.5 && ancla.st > st ? ancla.st - st : 0;
      movido = yAhora - ancla.y + recortado;
    }
    // El medio píxel es el redondeo de `scrollTop`: corregir por menos de eso
    // es escribir un valor que el navegador ya tiene.
    if (Math.abs(movido) >= 0.5) ponScrollTop(st + movido);
    if (modo === "contenido") {
      const stFinal = scrollTop();
      const nuevoDesfase = ancla.el.getBoundingClientRect().top - arriba;
      ancla = { ...ancla, desfase: nuevoDesfase, y: nuevoDesfase + stFinal, st: stFinal };
    }
  };

  const lectura = () => (sigue() || !ancla ? null : { hijo: ancla.i, desfase: ancla.desfase, el: ancla.el });

  const olvidarAncla = () => {
    ancla = undefined;
  };

  return { tomarAncla, encogidoArriba, restaurarAncla, lectura, olvidarAncla };
}
