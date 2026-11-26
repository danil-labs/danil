import { CHUNK, chunkIds, chunkStart, headChunk, tailChunk } from "../model/threadWindow";
import type { createChatBlocks } from "./chat-blocks";
import type { createChatComposerState } from "./chat-composer-state";
import { SOLTAR_LO_LEIDO_MS } from "./chat-model";
import type { ChatProps } from "./chat-props";
import { batch, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";

/** Lo que el bloque usa del cuerpo de Chat. */
export type ChatThreadWindowDeps = {
  bloqueDeLectura: ReturnType<typeof createChatBlocks>["bloqueDeLectura"];
  bloques: ReturnType<typeof createChatBlocks>["bloques"];
  clavesDelHilo: ReturnType<typeof createChatBlocks>["clavesDelHilo"];
  hilo: ReturnType<typeof createChatComposerState>["hilo"];
};

/** Ventana progresiva del hilo por tramos reales de DOM, sin alturas estimadas ni márgenes sintéticos. */
export function createChatThreadWindow(props: ChatProps, deps: ChatThreadWindowDeps) {
  const { bloqueDeLectura, bloques, clavesDelHilo, hilo } = deps;
  const volverAReciente = () =>
    void Promise.resolve(props.onRecientes?.()).then(() =>
      hilo.bajar({ animacion: "instantanea", duracion: 300, ignorarEscapes: true }),
    );
  // El primer tramo montado se fija al cargar la conversación y solo retrocede:
  // si avanzara con cada mensaje nuevo, desmontaría lo que alguien lee arriba.
  const bloqueInicial = props.lectura ? bloqueDeLectura(props.lectura) : null;
  const [firstChunk, setFirstChunk] = createSignal<number | null>(
    bloqueInicial === null ? null : Math.floor(bloqueInicial / CHUNK),
  );
  // Hasta qué final cabe todo en la vista: el borde de arriba volvió a anteponer lo soltado sin que nadie subiera.
  const [cabeHasta, setCabeHasta] = createSignal<number | null>(null);
  // Bloques que entraron por delante con páginas anteriores del historial.
  const [origen, setOrigen] = createSignal(0);
  let recienSoltado = false;
  createEffect(
    on(
      () => props.conversacion,
      () => {
        setFirstChunk(null);
        setOrigen(0);
        setCabeHasta(null);
      },
      { defer: true },
    ),
  );
  // Plegar el avance de un turno encoge el hilo: lo montado no pasa del final.
  const shownFrom = createMemo(() => {
    if (typeof IntersectionObserver === "undefined") return headChunk(origen());
    const tail = tailChunk(bloques().length, origen());
    return Math.min(firstChunk() ?? tail, tail);
  });
  createEffect(() => {
    const first = firstChunk();
    if (first === null ? !props.cargando && bloques().length > 0 : first > shownFrom()) setFirstChunk(shownFrom());
  });
  const chunks = createMemo(() => chunkIds(bloques().length, shownFrom(), origen()));
  // Lo leído arriba se suelta cuando se vuelve al final y se queda ahí: sin
  // esto cada tramo que alguien subió a leer queda montado hasta cerrar la pestaña.
  const sobranTramos = createMemo(() => {
    const tail = tailChunk(bloques().length, origen());
    return hilo.alFondo() && shownFrom() < tail && cabeHasta() !== tail;
  });
  createEffect(() => {
    if (!sobranTramos()) return;
    const t = setTimeout(() => {
      recienSoltado = true;
      setFirstChunk(tailChunk(bloques().length, origen()));
    }, SOLTAR_LO_LEIDO_MS);
    onCleanup(() => clearTimeout(t));
  });
  onCleanup(() => {
    const lectura = hilo.lectura();
    if (!lectura) return props.onLectura?.(null);
    const clave = clavesDelHilo().lista[chunkStart(shownFrom(), origen()) + lectura.hijo];
    props.onLectura?.(clave ? { clave, desfase: lectura.desfase } : null);
  });
  createEffect(() => props.onLeyendo?.(!hilo.alFondo()));
  // Lo anterior entra por delante del tramo 0: lo montado conserva sus ids y no se remonta.
  let pidiendo = false;
  const pedirAntiguos = async () => {
    if (pidiendo || !props.onAntiguos) return;
    pidiendo = true;
    const conversacion = props.conversacion;
    const poner = await props.onAntiguos().finally(() => {
      pidiendo = false;
    });
    if (!poner || conversacion !== props.conversacion) return;
    const cabeza = bloques()[0];
    const primero = cabeza && props.msgs[cabeza.i];
    hilo.anteponer(() =>
      batch(() => {
        poner();
        const at = primero ? props.msgs.indexOf(primero) : -1;
        const bloque = at > 0 ? bloques().findIndex((b) => b.i === at) : -1;
        if (bloque > 0) setOrigen((o) => o + bloque);
      }),
    );
  };
  // Va con el borde y no con el componente: el hilo se desmonta mientras carga.
  const watchOlder = (edge: HTMLDivElement) => {
    if (typeof IntersectionObserver === "undefined") return;
    const older = new IntersectionObserver(
      (entries) => {
        // Tras volver a observar pueden llegar dos: la que vale es la última.
        if (!entries.at(-1)?.isIntersecting) return;
        if (shownFrom() <= headChunk(origen())) {
          if (props.masAntiguos) void pedirAntiguos();
          return;
        }
        if (recienSoltado && hilo.alFondo()) setCabeHasta(tailChunk(bloques().length, origen()));
        recienSoltado = false;
        hilo.anteponer(() => setFirstChunk(shownFrom() - 1));
      },
      { root: edge.parentElement, rootMargin: "1200px 0px 0px 0px" },
    );
    older.observe(edge);
    let frame = 0;
    // Volver a observar entrega el estado actual: sin esto, un tramo que no
    // llena la vista deja el borde a la vista y no llega otro aviso.
    createEffect(
      on([shownFrom, origen, () => props.masAntiguos], () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          older.unobserve(edge);
          older.observe(edge);
        });
      }),
    );
    // Un cuadro que llega después del desmontaje volvería a observar el borde suelto y retendría el hilo entero.
    onCleanup(() => {
      cancelAnimationFrame(frame);
      older.disconnect();
    });
  };
  return { chunks, origen, pedirAntiguos, setFirstChunk, shownFrom, volverAReciente, watchOlder };
}
