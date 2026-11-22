import type { Recipient, ReplyTo, SenderTask } from "../../../../apps/desktop/src/lib/recipients.ts";
import type { TaskMention } from "../../../../apps/desktop/src/lib/taskMentions.ts";

// Conserva la configuración al encolar; el lote adopta la del último mensaje.
export type Encolado = {
  id: string;
  text: string;
  task_mentions?: TaskMention[];
  provider: string;
  model: string | null;
  effort: string | null;
  /**
   * Con cuánta vigilancia se escribió, capturado al encolar como el modelo.
   *
   * Es del mensaje y no de la caja porque un turno encolado puede salir minutos
   * después: si leyera el modo del momento de despacharse, alguien que cambiara
   * a automático mientras espera se encontraría con que lo que escribió para
   * aprobar a mano ya se hizo solo.
   */
  permission_mode: string | null;
  attachments: string[];
  /**
   * A quién va dirigido. Sin él, lo que se escribió para un encargado sale
   * como un turno más de esta conversación.
   */
  recipients?: Recipient[];
  /**
   * El sobre de una entrega que la cola guardó mientras el chat contestaba
   * (`runtime/chat/queue.rs`). La cola la vacía la ventana: lo que no se
   * devuelva aquí aterriza firmado como de la persona y sin dónde contestar.
   */
  agent?: string | null;
  /** Por qué canal lo escribió la persona (`Turn::channel`). */
  channel?: string | null;
  reply_to?: ReplyTo | null;
  /** Cuántos saltos entre encargados lleva. Se cuenta y se pinta, no se limita. */
  hops?: number | null;
  /** La tarea que lo mandó por el CLI (`Turn::from_task`). */
  from_task?: SenderTask | null;
  /**
   * El escritorio activo al encolarlo, no al salir: lo que lance un chat de
   * agente en ese turno cae ahí (`spaces::TurnDesk`).
   */
  space?: string | null;
  /** El motor retiene su cola (`load_queue`, `chat_queue_v1`): no sale sola. Lo escrito aquí lo ignora. */
  held?: boolean;
  /** El motor no sabe si salió (se reinició a mitad del despacho): no lo reenvía solo. Lo escrito aquí lo ignora. */
  uncertain?: boolean;
};

/**
 * De quién es la cola que se tiene en la mano.
 *
 * **Lo encolado es de una SESIÓN, pero se sostiene en una sola señal**: la de la
 * tarea que se está mirando. Cambiar de tarea es entonces una secuencia de
 * asignaciones —la sesión primero, soltar la cola después— y en Solid cada una
 * corre los efectos antes de la siguiente. En ese hueco de un paso la cola de
 * una tarea se encuentra con la sesión de otra: guardarla ahí la escribiría en
 * la carpeta equivocada y la dejaría vacía en la suya.
 *
 * La ventana no manda nada de la cola por su cuenta: la despacha el motor que
 * anuncia `chat_queue_dispatch_v1`, y si no, la persona con «Enviar».
 */

/**
 * Por qué la cola no sale sola: una pregunta sin contestar, el motor la retiene,
 * no se sabe si su motor la despacha (`manual`) o la encabeza un `!`, que el motor no corre.
 */
export type RazonDeRetencion = "pregunta" | "motor" | "manual" | "terminal";

/**
 * ¿La cola en la mano es la de la tarea que se está mirando?
 *
 * Los dos `null` a la vez **sí son la misma**: es la conversación en blanco con
 * lo que se escribió durante su primer turno, que aún no tiene id porque lo
 * reparte Rust al crear la sesión. `enviar` le pone dueño en cuanto vuelve.
 */
export function esDeLaTareaAbierta(de: string | null, mirando: string | null): boolean {
  return de === mirando;
}

/**
 * ¿Se escribe el `.cola.json`, y de qué sesión?
 *
 * Sin dueño no hay carpeta donde escribir —el primer turno la crea y entonces se
 * guarda de golpe—, y con un dueño que no es la tarea abierta lo que se
 * guardaría es la cola de otra: eso es lo que dejaba `.cola.json` vacíos en la
 * tarea que se acababa de dejar.
 */
export function guardable(de: string | null, mirando: string | null): de is string {
  return de !== null && esDeLaTareaAbierta(de, mirando);
}

// Un `!` o un `/` es un comando: no entra en un turno vivo ni se interrumpe con él.
function esComando(item: Encolado): boolean {
  return /^[!/]/.test(item.text.trimStart());
}

/** La inyección no lleva sobre ni admite menciones: conserva la autoría del mensaje. */
export function inyectable(item: Encolado): boolean {
  return !item.task_mentions?.length && interrumpible(item);
}

/** Un mensaje propio para el siguiente turno admite menciones y adjuntos. */
export function interrumpible(item: Encolado): boolean {
  return !esComando(item) && !conSobre(item);
}

function conSobre(item: Encolado): boolean {
  return Boolean(item.agent || item.channel || item.reply_to || item.hops != null || item.from_task);
}

/** Las entregas de otra tarea conservan su remitente y no se editan desde esta cola. */
export function deOtraTarea(item: Encolado): boolean {
  return !item.channel && Boolean(item.from_task || item.agent);
}

/** El `!` que escribió la persona. Espejo de `queue::comando_de` en Rust. */
export function esDeLaTerminal(item: Encolado): boolean {
  return (
    item.text.trimStart().startsWith("!") &&
    !item.agent && !item.channel && !item.reply_to && item.hops == null && !item.from_task
  );
}

/**
 * ¿Pide la ventana que el agente conteste a la salida de un `!` que acaba de
 * cerrar? Con algo detrás en la cola no: lo siguiente la lleva o la vuelve a
 * esperar. Sin superficie utilizable tampoco: la salida viaja con el primer mensaje.
 */
export function contestaALaTerminal(restantes: readonly Encolado[], detenido: boolean, hayQuienConteste: boolean): boolean {
  return restantes.length === 0 && !detenido && hayQuienConteste;
}

/** Un `!` no llama a ningún modelo: la caja lo manda aunque no haya superficie utilizable. */
export function seMandaSinSuperficie(texto: string): boolean {
  return texto.startsWith("!");
}

/**
 * Lo que contesta el ejecutor cuando despachó el mensaje pero no pudo saber si
 * entró (`runtime/chat/delivery.rs`, `ACCEPTANCE_UNKNOWN`). Es una clave
 * interna, no una frase: pintarla deja ese identificador en el hilo con un
 * reintento que repite el mismo camino. La ventana la cuenta con
 * `chat.steer.unconfirmed`; OpenCode 2.x cae aquí (rechaza el segundo prompt).
 */
export const ENTREGA_SIN_CONFIRMAR = "executor_acceptance_unknown";
