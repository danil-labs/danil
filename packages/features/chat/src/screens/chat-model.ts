import { createSignal, type Signal } from "solid-js";
import { sharedLazy } from "../../../../../apps/desktop/src/lib/sharedLazy";
import type { ObservedTurnActivity as TurnActivity } from "../../../../../apps/desktop/src/lib/activityObservation";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { type MentionSource } from "../../../../../apps/desktop/src/lib/mentions";
import { type Clase, type Paso, pasoDe, pasoDePermiso } from "../../../../../apps/desktop/src/lib/steps";
import { avisoDeEncargado } from "../model/failures";
import { type InputMessage } from "../components/YourMessages";
import { type PresentedActivityBlock, type ActivityChunk } from "../model/activityBlocks";
import type { Msg } from "../model/messageTypes";


// Chunk aparte: el bloque de razonamiento solo lo carga un turno que lo trae.
const SelectorDeModelo = sharedLazy(() => import("../components/ModelPicker"));
/** Un bloque de la transcripción: un mensaje, o una tira de pasos plegable. */
type Bloque = PresentedActivityBlock<Msg>;
type Avance = ActivityChunk<Msg>;

type BloqueDeMensaje = Extract<Bloque, { tipo: "msg" }>;
type BloqueDePasos = Extract<Bloque, { tipo: "pasos" }>;
type BloqueDeTrabajo = Extract<Bloque, { tipo: "trabajo" }>;

/**
 * Lo que la capa de color y el campo tienen que pintar igual: borde, padding,
 * tamaño, interlínea, letra y el hueco de la barra. Con un valor distinto en
 * uno de los dos, el color cae fuera de las letras y el cursor deja de coincidir.
 * El tamaño va en rem: en px, ⌘+/⌘− agranda el resto y este campo se queda.
 * `font-family: inherit` le gana al textarea nativo, que si no cae a la del sistema.
 */
const METRICA_DEL_CAMPO =
  "border border-transparent px-2 py-1.5 text-ui leading-[1.4] [font-family:inherit] [scrollbar-gutter:stable]";
// Del mismo tipo que el `inherit` de arriba, para que `cn` lo reemplace.
const FUENTE_DE_TERMINAL = "[font-family:var(--font-mono)] [tab-size:4]";
const archivosDelNavegador = () => import("../model/browserFiles");

const mensajeDe = (bloque: Bloque): BloqueDeMensaje | null =>
  bloque.tipo === "msg" ? bloque : null;
const pasosDe = (bloque: Bloque): BloqueDePasos | null =>
  bloque.tipo === "pasos" ? bloque : null;
const trabajoDe = (bloque: Bloque): BloqueDeTrabajo | null =>
  bloque.tipo === "trabajo" ? bloque : null;
// Una prop que también lee otra señal no puede leer el accesor de su `Match`: corre antes de que se desmonte.
const fromWork = <T,>(block: Bloque, read: (work: BloqueDeTrabajo) => T, otherwise: T): T => {
  const work = trabajoDe(block);
  return work ? read(work) : otherwise;
};
// Lo que lee un trabajo en el instante en que su sitio ya es otro bloque y aún no se desmonta.
const SIN_MENSAJE: Msg = { role: "agent", text: "" };
const SIN_AVANCE: Avance[] = [];

/**
 * La transcripción y la caja de escritura. Agente, modelo y adjuntos se
 * deciden al escribir el mensaje: los tres viven aquí adentro y no en una
 * barra aparte.
 */
/** Cuánto se queda montado lo leído arriba después de volver al final. */
const SOLTAR_LO_LEIDO_MS = 30_000;
/** El riel necesita ancho para no tapar el texto del hilo. */
const ANCHO_DEL_RIEL = 320;
const mismoRemitente = (a: InputMessage["sender"], b: InputMessage["sender"]) => {
  if (a?.kind !== b?.kind) return false;
  if (!a || !b) return true;
  if (a.kind === "agent" && b.kind === "agent") return a.name === b.name;
  return a.kind === "task" && b.kind === "task" && a.agent === b.agent && a.model === b.model;
};
/** Cuánto espera tras el último `scroll` para mover la marca activa. */
const ESPERA_DEL_RIEL_MS = 120;
/** A cuánto del borde de arriba queda el mensaje al saltar: el relleno de la caja. */
const DESFASE_DEL_SALTO = 12;

/** Lo plegado y desplegado de una conversación. Vive en `App`: la pestaña escondida se desmonta. */
export type VistaDeLaConversacion = {
  trabajos: Signal<Record<string, boolean>>;
  razonamientos: Signal<Record<string, boolean>>;
  preguntasPlegadas: Signal<Record<string, boolean>>;
  /** El turno cuya pregunta pendiente está plegada. */
  preguntaPlegadaEn: Signal<string | null>;
};

export const vistaNueva = (): VistaDeLaConversacion => ({
  trabajos: createSignal<Record<string, boolean>>({}),
  razonamientos: createSignal<Record<string, boolean>>({}),
  preguntasPlegadas: createSignal<Record<string, boolean>>({}),
  preguntaPlegadaEn: createSignal<string | null>(null),
});

/**
 * Un tramo de trabajo: las herramientas seguidas entre dos textos del agente,
 * con su cuenta por clase como cabecera. Se pliega; lo que el turno preguntó
 * (`RegistroPreguntas`) queda fuera. Lo que cambió no se pinta en el hilo:
 * «Editó N archivos» abre el panel de la tarea en «Cambios».
 */
function activitySteps(activity: TurnActivity<Msg> | undefined): Paso[] {
  return activity?.messages.flatMap(message => message.shell ? [] : message.permission
    ? [pasoDePermiso(message.permission.tool, message.permission.target ?? null, message.permission.allow, message.encargado ?? message.fromTask?.title)]
    : message.paso ? [message.paso] : message.role === "system" && message.meta === "usó" ? [pasoDe(message.text)] : []) ?? [];
}


/**
 * Con qué se recuerda si el registro de un turno está desplegado.
 *
 * El id del turno cuando lo tiene. Las transcripciones escritas antes de que
 * existiera no lo traen, y ahí se cae al texto: dos turnos del agente con el
 * mismo texto exacto compartirían pliegue, que es un defecto mucho más chico que
 * el que todos compartan uno.
 */
function claveDeTrabajo(msg: Msg): string {
  return msg.turno ?? `texto:${msg.text.slice(0, 64)}`;
}

/** Identidad de la fila que nace con el primer paso y cierra con la respuesta. */
function claveDeBloque(i: string): string {
  return `bloque:${i}`;
}



/** El mecanismo de preguntas no es una respuesta para la persona. */
function textoVisible(texto: string) {
  const anuncioInterno = /\.?\s*preguntas\s*(?:(?:\.|punto)\s*json|\.json)/i;
  return texto
    .split(/\r?\n/)
    .filter((linea) => !anuncioInterno.test(linea))
    .join("\n")
    .trim();
}

/**
 * La interrupción es un hito del hilo, no un error recuperable por texto.
 *
 * Se conserva el formato anterior: las transcripciones ya escritas llevan
 * el aviso largo, y al reabrirlas se ven igual de compactas que las nuevas.
 */
function esInterrupcion(msg: Msg) {
  return (
    msg.role === "system" &&
    msg.meta === "fallo" &&
    (msg.text === "Interrumpido." ||
      msg.text === "chat.turn.cancelled" ||
      msg.text.startsWith("Turno interrumpido."))
  );
}

/**
 * Acciones y hora de un mensaje, solo al posar en él o al enfocarlas. Con un
 * `group` sin nombre respondería a cualquier ancestro y se encenderían las de
 * todo el hilo. El sitio se reserva para que no baile el hilo.
 */
/** Una marca de laboratorio para comparar con el hilo por tramos; no es una opción de producto. */
const HILO_POR_TRAMOS = "terminus.chat.thread-chunks";
const FILAS_ANTES_DE_PEDIR = 8;

const FILA_DEL_MENSAJE =
  "flex items-center gap-0.5 pt-1 opacity-0 transition-opacity group-hover/mensaje:opacity-100 group-focus-within/mensaje:opacity-100";
/** Cuántas fuentes se llegan a ofrecer de una vez. */
const TOPE_MENU = 60;

/**
 * Ordena las fuentes por lo que se está tecleando.
 *
 * Gana el nombre del archivo sobre la ruta —se escribe `@SYSTEM`, no
 * `@harness-app/SY`— y, a igualdad, la ruta más corta: lo que está más cerca de la
 * raíz del proyecto es lo que se menciona más.
 */
function filterMentionSources(fuentes: MentionSource[], consulta: string): MentionSource[] {
  if (!consulta) return fuentes.slice(0, TOPE_MENU);
  const puntos = (f: MentionSource) => {
    const ruta = f.ruta.toLowerCase();
    const base = ruta.slice(ruta.lastIndexOf("/") + 1);
    if (base.startsWith(consulta)) return 0;
    if (base.includes(consulta)) return 1;
    if (ruta.includes(consulta)) return 2;
    return 3;
  };
  return fuentes
    .map((f) => ({ f, p: puntos(f) }))
    .filter((x) => x.p < 3)
    .sort((a, b) => a.p - b.p || a.f.ruta.length - b.f.ruta.length)
    .slice(0, TOPE_MENU)
    .map((x) => x.f);
}

/**
 * Lo que dice una fila de sistema.
 *
 * El reenvío se ve —quién lo pasó a quién—, o llega una respuesta firmada por
 * alguien a quien nadie llamó y se lee como un error de la app. Se compone
 * aquí solo cuando el turno no trae prosa: la que mande Rust gana, que es la
 * que se auditó.
 */
function textoDeSistema(m: Msg): string {
  const aviso = avisoDeEncargado(m);
  if (aviso) return aviso;
  if (m.meta !== "reenvio" || m.text) return m.text;
  const a = (m.recipients ?? []).map((r) => r.name).join(", ");
  return m.encargado && a
    ? t("chat.recipients.forwarded", { from: m.encargado, to: a, hops: m.hops ?? 1 })
    : m.text;
}

/** Los eventos del turno que no son herramientas, con su clase de fila. */
function claseDeSistema(meta: string | undefined): Clase {
  if (meta === "gasto") return "gasto";
  if (meta === "fin") return "fin";
  return "aviso";
}
export { SelectorDeModelo, type Bloque, type Avance, type BloqueDeMensaje, type BloqueDePasos, type BloqueDeTrabajo, METRICA_DEL_CAMPO, FUENTE_DE_TERMINAL, archivosDelNavegador, mensajeDe, pasosDe, trabajoDe, fromWork, SIN_MENSAJE, SIN_AVANCE, SOLTAR_LO_LEIDO_MS, ANCHO_DEL_RIEL, mismoRemitente, ESPERA_DEL_RIEL_MS, DESFASE_DEL_SALTO, activitySteps, claveDeTrabajo, claveDeBloque, textoVisible, esInterrupcion, HILO_POR_TRAMOS, FILAS_ANTES_DE_PEDIR, FILA_DEL_MENSAJE, TOPE_MENU, filterMentionSources, textoDeSistema, claseDeSistema };
