import type { Encolado } from "./MessageQueue";

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


/**
 * ¿Los dos vienen del mismo sitio? Compara el sobre: quién lo manda, dónde se
 * contesta, cuántos saltos lleva y desde qué escritorio se mandó.
 */
function mismoRemite(a: Encolado, b: Encolado): boolean {
  return (
    (a.agent ?? null) === (b.agent ?? null) &&
    (a.channel ?? null) === (b.channel ?? null) &&
    (a.reply_to?.folder ?? null) === (b.reply_to?.folder ?? null) &&
    (a.reply_to?.task ?? null) === (b.reply_to?.task ?? null) &&
    (a.hops ?? null) === (b.hops ?? null) &&
    (a.from_task?.task ?? null) === (b.from_task?.task ?? null) &&
    (a.space ?? null) === (b.space ?? null)
  );
}

/**
 * Lo que sale en el turno siguiente, y lo que se queda esperando al otro.
 *
 * Un lote no mezcla remitentes: en un buzón se encolan a la vez las entregas
 * de otros y lo que la persona escriba, y juntarlas firmaría el texto de una
 * con la cara del otro. Sale el grupo de cabeza; el resto espera al siguiente.
 */
export function siguienteLote(items: readonly Encolado[]): {
  mensaje: Omit<Encolado, "id"> | null;
  lote: Encolado[];
  resto: Encolado[];
} {
  const primero = items[0];
  if (!primero) return { mensaje: null, lote: [], resto: [] };
  let corte = 1;
  if (!esComando(primero))
    while (corte < items.length && mismoRemite(primero, items[corte]) && !esComando(items[corte])) corte++;
  const lote = items.slice(0, corte);
  return { mensaje: agruparCola(lote), lote, resto: items.slice(corte) };
}

/**
 * Junta en un mensaje lo que la cola tiene esperando. El sobre sale del primero
 * —un lote es homogéneo por construcción ([`siguienteLote`])— y la
 * configuración del último, que es la que se eligió más tarde.
 */
export function agruparCola(items: readonly Encolado[]): Omit<Encolado, "id"> | null {
  const ultimo = items.at(-1);
  if (!ultimo) return null;
  let offset = 0;
  const task_mentions = items.flatMap(item => {
    const refs = (item.task_mentions ?? []).map(m => ({ ...m, start: m.start + offset, end: m.end + offset }));
    offset += item.text.length + 2;
    return refs;
  });
  // Los destinatarios se rebasan igual que el material: el backend comprueba
  // cada tramo contra el texto que de verdad se manda, y uno que quedara
  // señalando el texto de su renglón rechaza el lote entero.
  let destino = 0;
  const recipients = items.flatMap(item => {
    const refs = (item.recipients ?? []).map(r => ({ ...r, start: r.start + destino, end: r.end + destino }));
    destino += item.text.length + 2;
    return refs;
  });
  const remite = items[0];
  return {
    ...(task_mentions.length ? { task_mentions } : {}),
    ...(recipients.length ? { recipients } : {}),
    // Solo cuando los hay: una clave escrita en `null` y una clave ausente
    // significan lo mismo, y dos formas de lo mismo se comparan mal.
    ...(remite.agent ? { agent: remite.agent } : {}),
    ...(remite.channel ? { channel: remite.channel } : {}),
    ...(remite.reply_to ? { reply_to: remite.reply_to } : {}),
    ...(remite.hops != null ? { hops: remite.hops } : {}),
    ...(remite.from_task ? { from_task: remite.from_task } : {}),
    ...(remite.space ? { space: remite.space } : {}),
    text: items.map(item => item.text).join("\n\n"),
    provider: ultimo.provider,
    model: ultimo.model,
    effort: ultimo.effort,
    permission_mode: ultimo.permission_mode,
    attachments: [...new Set(items.flatMap(item => item.attachments))],
  };
}

// Un `!` o un `/` pegado a otro renglón saldría como un solo comando.
function esComando(item: Encolado): boolean {
  return /^[!/]/.test(item.text.trimStart());
}

/**
 * Lo que puede entrar en el turno vivo: solo texto para el agente, y de la
 * persona. `inject_message` no lleva sobre: lo de otra tarea o de un canal
 * entraría firmado por quien mira y sin dónde contestar.
 */
export function inyectable(item: Encolado): boolean {
  return !item.task_mentions?.length && !esComando(item) && !conSobre(item);
}

function conSobre(item: Encolado): boolean {
  return Boolean(item.agent || item.channel || item.reply_to || item.hops != null || item.from_task);
}

/**
 * Lo que dejó en la cola otra tarea o un encargado, no la persona. Un motor
 * anterior las escribía aquí; se ven con su remitente y no se editan ni se
 * quitan: no son de quien mira, y quitarlas las perdería.
 */
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
