/**
 * De quién es la cola que se tiene en la mano, y cuándo se le deja salir.
 *
 * **Lo encolado es de una SESIÓN, pero se sostiene en una sola señal**: la de la
 * tarea que se está mirando. Cambiar de tarea es entonces una secuencia de
 * asignaciones —la sesión primero, soltar la cola después— y en Solid cada una
 * corre los efectos antes de la siguiente. Ese hueco de un paso es donde la cola
 * de una tarea se encuentra con la sesión de otra, y ahí es donde hay que
 * decidir con las dos delante.
 *
 * **Sin esto, lo escrito para una tarea sale en la siguiente que se abra.** Con
 * un turno corriendo en A y dos mensajes en cola, pulsar la pestaña de B los
 * manda a los dos **en B**: `abrirSesion` pone la sesión antes de soltar lo que
 * había en la mano, y ese `setSessionId` apaga `busy` —B no está contestando—
 * con la cola de A todavía puesta, así que el efecto que despacha lee «hay cola y
 * nadie está ocupado» y dispara. De propina, lo que quedaba se guarda vacío en la
 * carpeta de A: la cola sale en la tarea equivocada y desaparece de la suya.
 *
 * La decisión vive aquí, en una función que se puede probar, y no repartida en
 * las condiciones de un efecto: **el fallo no es ninguna de las condiciones, es
 * el orden en que se evalúan respecto a un cambio de sesión.**
 */

/**
 * Por qué la cola no avanza sola. Espejo de `retenida` en `App.tsx`, donde está
 * lo que significa cada una.
 */
export type RazonDeRetencion = "fallo" | "borrador" | "pregunta" | "session";

/** Todo lo que hace falta para decidir, junto y sin leer señales. */
export type EstadoDeLaCola = {
  /** Cuántos mensajes esperan. */
  pendientes: number;
  /**
   * De qué sesión es la cola que se tiene en la mano. `null` es una
   * conversación que todavía no existe en disco: su cola es suya igual, pero no
   * tiene carpeta donde guardarse.
   */
  de: string | null;
  /** Qué tarea se está mirando. `null` es la conversación en blanco. */
  mirando: string | null;
  /** Si la tarea que se está mirando está contestando. */
  ocupado: boolean;
  /** Si hay un renglón de la cola abierto para editar. */
  editando: boolean;
  retenida: RazonDeRetencion | null;
  /** Si el agente preguntó algo que nadie ha contestado. */
  esperando: boolean;
};

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
 * ¿Sale el siguiente mensaje?
 *
 * Las cuatro razones de quedarse quieto —contestando, editando, retenida, una
 * pregunta sin contestar— significan lo mismo para quien mira: de aquí no sale
 * nada hasta que alguien haga algo. La quinta, la de arriba, no se le enseña
 * porque no es un estado de la cola sino un instante de un cambio de tarea.
 */
export function despachable(e: EstadoDeLaCola): boolean {
  if (e.pendientes === 0) return false;
  if (!esDeLaTareaAbierta(e.de, e.mirando)) return false;
  return !e.ocupado && !e.editando && e.retenida === null && !e.esperando;
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

/**
 * Lo leído de disco sin retención conservada es `borrador`: sobrevivió a cerrar
 * la app. Marcar así lo que la ventana conservó al cambiar de workspace lo deja
 * parado aunque su turno acabe bien.
 */
export function retencionAlCargar(
  pendientes: number,
  conservada: RazonDeRetencion | null | undefined,
): RazonDeRetencion | null {
  if (pendientes === 0) return null;
  return conservada === undefined ? "borrador" : conservada;
}

/**
 * Un borrador leído de disco con su tarea contestando se escribió para ese turno;
 * sin soltarlo no sale al cerrarlo. El de un cierre sin desenlace no se suelta.
 */
export function sueltaElBorrador(
  retenida: RazonDeRetencion | null,
  viva: boolean,
  deDisco: boolean,
): boolean {
  return retenida === "borrador" && viva && deDisco;
}

// Un `!` o un `/` pegado a otro renglón saldría como un solo comando.
/**
 * Lo que contesta el ejecutor cuando despachó el mensaje pero no pudo saber si
 * entró (`runtime/chat/delivery.rs`, `ACCEPTANCE_UNKNOWN`). Es una clave
 * interna, no una frase: pintarla deja ese identificador en el hilo con un
 * reintento que repite el mismo camino. La ventana la cuenta con
 * `chat.steer.unconfirmed`; OpenCode 2.x cae aquí (rechaza el segundo prompt).
 */
export const ENTREGA_SIN_CONFIRMAR = "executor_acceptance_unknown";

export { siguienteLote, agruparCola, inyectable, deOtraTarea, esDeLaTerminal, contestaALaTerminal, seMandaSinSuperficie } from "./queuePolicy.ts";
