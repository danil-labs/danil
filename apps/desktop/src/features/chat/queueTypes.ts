import type { Recipient, ReplyTo, SenderTask } from "../../lib/recipients.ts";
import type { TaskMention } from "../../lib/taskMentions.ts";


// Conserva la configuración al encolar; el lote adopta la del último mensaje.
export type Encolado = {
  id: string;
  /** The engine could have accepted it; resending would risk a duplicate operation. */
  uncertain?: boolean;
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
};
