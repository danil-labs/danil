import type { VirtualThreadApi } from "../components/VirtualThread";
import { estimateBlock } from "../model/threadRows";
import { CHUNK, chunkIds, chunkStart, headChunk, tailChunk, type Lectura } from "../model/threadWindow";
import type { createChatBlocks } from "./chat-blocks";
import type { createChatComposerState } from "./chat-composer-state";
import { FILAS_ANTES_DE_PEDIR, HILO_POR_TRAMOS, SOLTAR_LO_LEIDO_MS } from "./chat-model";
import type { ChatProps } from "./chat-props";
import { batch, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";

/** Lo que el bloque usa del cuerpo de Chat. */
export type ChatThreadWindowDeps = { bloqueDeLectura: ReturnType<typeof createChatBlocks>["bloqueDeLectura"]; bloques: ReturnType<typeof createChatBlocks>["bloques"]; clavesDelHilo: ReturnType<typeof createChatBlocks>["clavesDelHilo"]; hilo: ReturnType<typeof createChatComposerState>["hilo"]; hiloDeFilas: VirtualThreadApi | undefined; lecturaPorSaltar: Lectura | null };

/** Movido tal cual de Chat.tsx (el componente `Chat`, tarea 2.6). Lo que usa del cuerpo de Chat llega por `deps`. */
export function createChatThreadWindow(props: ChatProps, deps: ChatThreadWindowDeps) {
  const { bloqueDeLectura, bloques, clavesDelHilo, hilo } = deps;
  // Sin layout (jsdom) todo mide cero: el hilo se monta entero por tramos.
  const hiloVirtual = typeof ResizeObserver !== "undefined" && document.documentElement.getBoundingClientRect().width > 0 && !localStorage.getItem(HILO_POR_TRAMOS);
  // En su propio trozo: la carga inicial tiene techo y el hilo llega después de pintar la ventana.
  const [hiloDeFilasListo, setHiloDeFilasListo] = createSignal<typeof import("../components/VirtualThread").VirtualThread>();
  if (hiloVirtual) void import("../components/VirtualThread").then((module) => setHiloDeFilasListo(() => module.VirtualThread));
  const saltarALaLectura = () => {
    const lectura = deps.lecturaPorSaltar;
    const bloque = lectura && bloqueDeLectura(lectura);
    if (!lectura || bloque === null || !deps.hiloDeFilas) return;
    deps.lecturaPorSaltar = null;
    void deps.hiloDeFilas.jump(bloque, lectura.desfase);
  };
  const volverAReciente = () => void Promise.resolve(props.onRecientes?.()).then(() => hilo.bajar({ animacion: "instantanea", duracion: 300, ignorarEscapes: true }));
  const [primeraFila, setPrimeraFila] = createSignal<number | null>(null);
  const [cajaDeFilas, setCajaDeFilas] = createSignal<HTMLElement>();
  // Una instancia por conversación: ninguna medida ni fila pasa de una tarea a otra.
  const cajaVirtual = createMemo<{ el: HTMLElement } | undefined>((previa) => {
    const el = cajaDeFilas();
    props.conversacion;
    return el ? { el } : previa && undefined;
  });
  createEffect(() => {
    if (!hiloVirtual || !props.masAntiguos || props.estadoAntiguos === "failed" || props.estadoAntiguos === "loading") return;
    const fila = primeraFila();
    if (fila !== null && fila <= FILAS_ANTES_DE_PEDIR) void pedirAntiguos();
  });
  const [retenidas, setRetenidas] = createSignal<ReadonlySet<string>>(new Set());
  const retenerFila = (clave: string | null, motivo: string) => setRetenidas((todas) => {
    const previa = motivos.get(motivo) ?? null;
    if (previa === clave) return todas;
    if (clave) motivos.set(motivo, clave);
    else motivos.delete(motivo);
    return new Set(motivos.values());
  });
  const motivos = new Map<string, string>();
  const filasRetenidas = createMemo<ReadonlySet<string>>(() => {
    const fija = retenidas();
    const viva = props.busy ? clavesDelHilo().lista.at(-1) : undefined;
    return viva ? new Set([...fija, viva]) : fija;
  });
  const filaDe = (nodo: Node | null | undefined) =>
    (nodo instanceof Element ? nodo : nodo?.parentElement)?.closest<HTMLElement>("[data-thread-key]")?.dataset.threadKey ?? null;
  const altoEstimado = (index: number) => {
    const b = bloques()[index];
    if (!b) return 80;
    return estimateBlock(b.tipo, b.tipo === "pasos" ? 0 : b.msg.text.length, b.tipo === "msg" ? 0 : b.pasos.length);
  };
  // El primer tramo montado se fija al cargar la conversación y solo retrocede:
  // si avanzara con cada mensaje nuevo, desmontaría lo que alguien lee arriba.
  const bloqueInicial = props.lectura && !hiloVirtual ? bloqueDeLectura(props.lectura) : null;
  const [firstChunk, setFirstChunk] = createSignal<number | null>(
    bloqueInicial === null ? null : Math.floor(bloqueInicial / CHUNK),
  );
  // Hasta qué final cabe todo en la vista: el borde de arriba volvió a anteponer lo soltado sin que nadie subiera.
  const [cabeHasta, setCabeHasta] = createSignal<number | null>(null);
  // Bloques que entraron por delante con páginas anteriores del historial.
  const [origen, setOrigen] = createSignal(0);
  let recienSoltado = false;
  createEffect(on(() => props.conversacion, () => {
    setFirstChunk(null);
    setOrigen(0);
    setCabeHasta(null);
  }, { defer: true }));
  // Plegar el avance de un turno encoge el hilo: lo montado no pasa del final.
  const shownFrom = createMemo(() => {
    if (hiloVirtual) return headChunk(origen());
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
    return !hiloVirtual && hilo.alFondo() && shownFrom() < tail && cabeHasta() !== tail;
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
    const clave = hiloVirtual
      // Del nodo y no de su sitio: al desmontar, las filas ya salieron del hilo.
      ? (lectura.el as HTMLElement).dataset.threadKey
      : clavesDelHilo().lista[chunkStart(shownFrom(), origen()) + lectura.hijo];
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
    if (hiloVirtual) return batch(poner);
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
    if (typeof IntersectionObserver === "undefined" || hiloVirtual) return;
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
  return { altoEstimado, cajaVirtual, chunks, filaDe, filasRetenidas, hiloDeFilasListo, hiloVirtual, motivos, origen, pedirAntiguos, retenerFila, saltarALaLectura, setCajaDeFilas, setFirstChunk, setPrimeraFila, setRetenidas, shownFrom, volverAReciente, watchOlder };
}
