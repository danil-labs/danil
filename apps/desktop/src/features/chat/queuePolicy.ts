import type { Encolado } from "./queueTypes.ts";



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
  if (primero.uncertain) return { mensaje: null, lote: [], resto: items.slice() };
  let corte = 1;
  if (!esComando(primero))
    while (corte < items.length && !items[corte].uncertain && mismoRemite(primero, items[corte]) && !esComando(items[corte])) corte++;
  const lote = items.slice(0, corte);
  return { mensaje: agruparCola(lote), lote, resto: items.slice(corte) };
}


/**
 * Junta en un mensaje lo que la cola tiene esperando. El sobre sale del primero
 * —un lote es homogéneo por construcción ([`siguienteLote`])— y la
 * configuración del último, que es la que se eligió más tarde.
 */
export function agruparCola(items: readonly Encolado[]): Omit<Encolado, "id"> | null {
  if (items.some(item => item.uncertain)) return null;
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
  return !item.uncertain && !item.task_mentions?.length && !esComando(item) && !conSobre(item);
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
